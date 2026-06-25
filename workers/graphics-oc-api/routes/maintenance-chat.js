/**
 * Maintenance chat routes backed by Supabase REST.
 */

import { sendDiscordWebhook, truncateField } from '../utils/discord.js';
import { SupabaseRestError, supabaseRequest } from '../utils/supabase-rest.js';

const MAX_MESSAGE_LENGTH = 500;
const MAX_NAME_LENGTH = 40;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const NAME_PATTERN = /^[A-Za-z][A-Za-z-]{1,38}[a-z]$/;

function json(data, status, headers) {
  return Response.json(data, { status, headers });
}

function cleanString(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function todaySlug() {
  return new Date().toISOString().slice(0, 10);
}

function getConfiguredSessionSlug(env) {
  return cleanString(env.MAINTENANCE_SESSION_SLUG || '', 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getSessionSlug(env) {
  const configured = getConfiguredSessionSlug(env);
  if (configured) return configured;

  if (env.MAINTENANCE_KV) {
    const kvSlug = await env.MAINTENANCE_KV.get('maintenance_session_slug');
    const cleaned = cleanString(kvSlug || '', 80)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (cleaned) return cleaned;
  }

  return `maintenance-${todaySlug()}`;
}

function sessionLabelFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function encodeFilter(value) {
  return encodeURIComponent(value);
}

function normalizeSession(row) {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    isActive: Boolean(row.is_active),
  };
}

function normalizeMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    generatedName: row.generated_name,
    message: row.message,
    createdAt: row.created_at,
  };
}

async function getOrCreateSession(env) {
  const slug = await getSessionSlug(env);
  const select = 'id,slug,label,started_at,ended_at,is_active';
  const rows = await supabaseRequest(
    env,
    `maintenance_sessions?slug=eq.${encodeFilter(slug)}&select=${select}&limit=1`,
  );

  if (Array.isArray(rows) && rows.length > 0) {
    return normalizeSession(rows[0]);
  }

  const id = crypto.randomUUID();
  const inserted = await supabaseRequest(env, 'maintenance_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: [
      {
        id,
        slug,
        label: sessionLabelFromSlug(slug),
        is_active: true,
      },
    ],
  });

  return normalizeSession(inserted[0]);
}

function getRoomStub(env, sessionId) {
  if (!env.MAINTENANCE_CHAT_ROOM) return null;
  const id = env.MAINTENANCE_CHAT_ROOM.idFromName(sessionId);
  return env.MAINTENANCE_CHAT_ROOM.get(id);
}

async function hashRateKey(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function checkRateLimit(request, env, generatedName) {
  if (!env.MAINTENANCE_KV) return true;

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  const keyHash = await hashRateKey(`${ip}|${generatedName}`);
  const key = `maintenance_chat_rate:${keyHash}`;
  const current = Number(await env.MAINTENANCE_KV.get(key)) || 0;
  if (current >= 8) return false;

  await env.MAINTENANCE_KV.put(key, String(current + 1), { expirationTtl: 60 });
  return true;
}

async function maybeNotifyDiscord(env, message) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  await sendDiscordWebhook(env.DISCORD_WEBHOOK_URL, {
    content: 'Maintenance chat message',
    embeds: [
      {
        color: 0xff9900,
        fields: [
          { name: 'Session', value: truncateField(message.sessionId, 128), inline: false },
          { name: 'Name', value: truncateField(message.generatedName, 128), inline: false },
          { name: 'Message', value: truncateField(message.message), inline: false },
        ],
      },
    ],
  });
}

async function handleSession(env, headers) {
  const session = await getOrCreateSession(env);
  return json({ success: true, session }, 200, headers);
}

async function handleMessages(request, env, headers) {
  const url = new URL(request.url);
  const sessionId = cleanString(url.searchParams.get('session') || '', 80);
  if (!sessionId) {
    return json({ error: 'session_required' }, 400, headers);
  }

  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const select = 'id,session_id,generated_name,message,created_at';
  const rows = await supabaseRequest(
    env,
    `maintenance_messages?session_id=eq.${encodeFilter(sessionId)}&status=eq.visible&select=${select}&order=created_at.desc&limit=${limit}`,
  );

  const messages = (Array.isArray(rows) ? rows : []).map(normalizeMessage).reverse();
  return json({ success: true, messages }, 200, headers);
}

async function handlePostMessage(request, env, ctx, headers) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, headers);
  }

  const sessionId = cleanString(data.sessionId, 80);
  const generatedName = cleanString(data.generatedName, MAX_NAME_LENGTH);
  const messageText = cleanString(data.message, MAX_MESSAGE_LENGTH);

  if (!sessionId) {
    return json({ error: 'session_required' }, 400, headers);
  }
  if (!generatedName || !NAME_PATTERN.test(generatedName)) {
    return json({ error: 'invalid_name' }, 400, headers);
  }
  if (!messageText) {
    return json({ error: 'message_required' }, 400, headers);
  }
  if (String(data.message || '').trim().length > MAX_MESSAGE_LENGTH) {
    return json({ error: 'message_too_long' }, 400, headers);
  }

  const allowed = await checkRateLimit(request, env, generatedName);
  if (!allowed) {
    return json({ error: 'rate_limited' }, 429, headers);
  }

  const inserted = await supabaseRequest(env, 'maintenance_messages', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: [
      {
        id: crypto.randomUUID(),
        session_id: sessionId,
        generated_name: generatedName,
        message: messageText,
        status: 'visible',
      },
    ],
  });

  const message = normalizeMessage(inserted[0]);
  const room = getRoomStub(env, sessionId);
  if (room) {
    ctx.waitUntil(
      room.fetch('https://maintenance-chat-room/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'message', message }),
      }),
    );
  }
  ctx.waitUntil(maybeNotifyDiscord(env, message));

  return json({ success: true, message }, 201, headers);
}

async function handleWebSocket(request, env, headers) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'websocket_required' }, 426, headers);
  }

  const url = new URL(request.url);
  const sessionId = cleanString(url.searchParams.get('session') || '', 80);
  if (!sessionId) {
    return json({ error: 'session_required' }, 400, headers);
  }

  const room = getRoomStub(env, sessionId);
  if (!room) {
    return json({ error: 'chat_room_not_configured' }, 500, headers);
  }

  return room.fetch(request);
}

export async function handleMaintenanceChatRoutes(request, env, ctx, method, pathname, headers) {
  try {
    if (method === 'GET' && pathname === '/api/maintenance/chat/session') {
      return await handleSession(env, headers);
    }

    if (method === 'GET' && pathname === '/api/maintenance/chat/messages') {
      return await handleMessages(request, env, headers);
    }

    if (method === 'POST' && pathname === '/api/maintenance/chat/messages') {
      return await handlePostMessage(request, env, ctx, headers);
    }

    if (method === 'GET' && pathname === '/api/maintenance/chat/ws') {
      return await handleWebSocket(request, env, headers);
    }

    return json({ error: 'not_found' }, 404, headers);
  } catch (error) {
    if (error instanceof SupabaseRestError) {
      console.error('Supabase maintenance chat error:', error.status, error.details);
      return json({ error: 'database_error', message: error.message }, 500, headers);
    }
    console.error('Maintenance chat route error:', error);
    return json({ error: 'internal_error' }, 500, headers);
  }
}
