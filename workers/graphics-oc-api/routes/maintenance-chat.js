/**
 * Maintenance chat routes backed by Supabase REST.
 */

import { sendDiscordWebhook, truncateField } from '../utils/discord.js';
import { SupabaseRestError, supabaseRequest } from '../utils/supabase-rest.js';

const MAX_MESSAGE_LENGTH = 500;
const MAX_NAME_LENGTH = 40;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const NAME_PATTERN = /^[A-Za-z][A-Za-z-]{1,38}[a-z]$/;
const COUNTRY_NAMES = {
  AD: 'Andorra',
  AE: 'United Arab Emirates',
  AF: 'Afghanistan',
  AG: 'Antigua and Barbuda',
  AI: 'Anguilla',
  AL: 'Albania',
  AM: 'Armenia',
  AO: 'Angola',
  AR: 'Argentina',
  AT: 'Austria',
  AU: 'Australia',
  AW: 'Aruba',
  AZ: 'Azerbaijan',
  BA: 'Bosnia and Herzegovina',
  BB: 'Barbados',
  BD: 'Bangladesh',
  BE: 'Belgium',
  BF: 'Burkina Faso',
  BG: 'Bulgaria',
  BH: 'Bahrain',
  BI: 'Burundi',
  BJ: 'Benin',
  BM: 'Bermuda',
  BN: 'Brunei',
  BO: 'Bolivia',
  BR: 'Brazil',
  BS: 'Bahamas',
  BT: 'Bhutan',
  BW: 'Botswana',
  BY: 'Belarus',
  BZ: 'Belize',
  CA: 'Canada',
  CD: 'Democratic Republic of the Congo',
  CF: 'Central African Republic',
  CG: 'Republic of the Congo',
  CH: 'Switzerland',
  CI: 'Cote d Ivoire',
  CL: 'Chile',
  CM: 'Cameroon',
  CN: 'China',
  CO: 'Colombia',
  CR: 'Costa Rica',
  CU: 'Cuba',
  CV: 'Cape Verde',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DE: 'Germany',
  DJ: 'Djibouti',
  DK: 'Denmark',
  DM: 'Dominica',
  DO: 'Dominican Republic',
  DZ: 'Algeria',
  EC: 'Ecuador',
  EE: 'Estonia',
  EG: 'Egypt',
  ES: 'Spain',
  ET: 'Ethiopia',
  FI: 'Finland',
  FJ: 'Fiji',
  FR: 'France',
  GA: 'Gabon',
  GB: 'United Kingdom',
  GD: 'Grenada',
  GE: 'Georgia',
  GH: 'Ghana',
  GM: 'Gambia',
  GN: 'Guinea',
  GQ: 'Equatorial Guinea',
  GR: 'Greece',
  GT: 'Guatemala',
  GY: 'Guyana',
  HK: 'Hong Kong',
  HN: 'Honduras',
  HR: 'Croatia',
  HT: 'Haiti',
  HU: 'Hungary',
  ID: 'Indonesia',
  IE: 'Ireland',
  IL: 'Israel',
  IN: 'India',
  IQ: 'Iraq',
  IR: 'Iran',
  IS: 'Iceland',
  IT: 'Italy',
  JM: 'Jamaica',
  JO: 'Jordan',
  JP: 'Japan',
  KE: 'Kenya',
  KG: 'Kyrgyzstan',
  KH: 'Cambodia',
  KR: 'South Korea',
  KW: 'Kuwait',
  KZ: 'Kazakhstan',
  LA: 'Laos',
  LB: 'Lebanon',
  LC: 'Saint Lucia',
  LK: 'Sri Lanka',
  LR: 'Liberia',
  LS: 'Lesotho',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  LY: 'Libya',
  MA: 'Morocco',
  MC: 'Monaco',
  MD: 'Moldova',
  ME: 'Montenegro',
  MG: 'Madagascar',
  MK: 'North Macedonia',
  ML: 'Mali',
  MM: 'Myanmar',
  MN: 'Mongolia',
  MO: 'Macao',
  MR: 'Mauritania',
  MT: 'Malta',
  MU: 'Mauritius',
  MV: 'Maldives',
  MW: 'Malawi',
  MX: 'Mexico',
  MY: 'Malaysia',
  MZ: 'Mozambique',
  NA: 'Namibia',
  NE: 'Niger',
  NG: 'Nigeria',
  NI: 'Nicaragua',
  NL: 'Netherlands',
  NO: 'Norway',
  NP: 'Nepal',
  NZ: 'New Zealand',
  OM: 'Oman',
  PA: 'Panama',
  PE: 'Peru',
  PG: 'Papua New Guinea',
  PH: 'Philippines',
  PK: 'Pakistan',
  PL: 'Poland',
  PR: 'Puerto Rico',
  PS: 'Palestine',
  PT: 'Portugal',
  PY: 'Paraguay',
  QA: 'Qatar',
  RO: 'Romania',
  RS: 'Serbia',
  RU: 'Russia',
  RW: 'Rwanda',
  SA: 'Saudi Arabia',
  SC: 'Seychelles',
  SD: 'Sudan',
  SE: 'Sweden',
  SG: 'Singapore',
  SI: 'Slovenia',
  SK: 'Slovakia',
  SL: 'Sierra Leone',
  SN: 'Senegal',
  SO: 'Somalia',
  SR: 'Suriname',
  SV: 'El Salvador',
  SY: 'Syria',
  SZ: 'Eswatini',
  TD: 'Chad',
  TG: 'Togo',
  TH: 'Thailand',
  TJ: 'Tajikistan',
  TN: 'Tunisia',
  TR: 'Turkey',
  TT: 'Trinidad and Tobago',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  UA: 'Ukraine',
  UG: 'Uganda',
  US: 'United States',
  UY: 'Uruguay',
  UZ: 'Uzbekistan',
  VE: 'Venezuela',
  VN: 'Vietnam',
  YE: 'Yemen',
  ZA: 'South Africa',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
};

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

function cleanSessionSlug(value) {
  return cleanString(value || '', 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getSessionSlug(env) {
  const configured = getConfiguredSessionSlug(env);
  if (configured) return configured;

  if (env.MAINTENANCE_KV) {
    const kvSlug = await env.MAINTENANCE_KV.get('maintenance_session_slug');
    const cleaned = cleanSessionSlug(kvSlug);
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
  const countryCode = row.country_code || '';
  const countryName = row.country_name || '';
  return {
    id: row.id,
    sessionId: row.session_id,
    generatedName: row.generated_name,
    countryCode,
    countryName,
    countryFlag: flagForCountryCode(countryCode),
    message: row.message,
    createdAt: row.created_at,
  };
}

function flagForCountryCode(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return [...code].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}

function getCountry(request) {
  const cfCountry = request.cf && typeof request.cf.country === 'string' ? request.cf.country : '';
  const headerCountry = request.headers.get('CF-IPCountry') || '';
  const code = (cfCountry || headerCountry).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') {
    return { code: '', name: '' };
  }
  return { code, name: COUNTRY_NAMES[code] || code };
}

async function getOrCreateSession(env, options = {}) {
  const slug = await getSessionSlug(env);
  return await getOrCreateSessionBySlug(env, slug, options);
}

async function getOrCreateSessionBySlug(env, slug, options = {}) {
  const cacheKey = `maintenance_session:${slug}`;
  if (env.MAINTENANCE_KV && !options.forceRefresh) {
    const cached = await env.MAINTENANCE_KV.get(cacheKey, 'json');
    if (cached && cached.id && cached.slug === slug) {
      return cached;
    }
  }

  const select = 'id,slug,label,started_at,ended_at,is_active';
  const rows = await supabaseRequest(
    env,
    `maintenance_sessions?slug=eq.${encodeFilter(slug)}&select=${select}&limit=1`,
  );

  if (Array.isArray(rows) && rows.length > 0) {
    const session = normalizeSession(rows[0]);
    if (env.MAINTENANCE_KV) {
      await env.MAINTENANCE_KV.put(cacheKey, JSON.stringify(session), { expirationTtl: 300 });
    }
    return session;
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

  const session = normalizeSession(inserted[0]);
  if (env.MAINTENANCE_KV) {
    await env.MAINTENANCE_KV.put(cacheKey, JSON.stringify(session), { expirationTtl: 300 });
  }
  return session;
}

async function refreshCurrentSession(env) {
  const slug = await getSessionSlug(env);
  return await getOrCreateSessionBySlug(env, slug, { forceRefresh: true });
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

function getLimitFromUrl(url) {
  return Math.min(
    Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
}

async function getMessagesForSession(env, sessionId, limit) {
  let rows;
  try {
    const select = 'id,session_id,generated_name,country_code,country_name,message,created_at';
    rows = await supabaseRequest(
      env,
      `maintenance_messages?session_id=eq.${encodeFilter(sessionId)}&status=eq.visible&select=${select}&order=created_at.desc&limit=${limit}`,
    );
  } catch (error) {
    if (!(error instanceof SupabaseRestError)) throw error;
    const select = 'id,session_id,generated_name,message,created_at';
    rows = await supabaseRequest(
      env,
      `maintenance_messages?session_id=eq.${encodeFilter(sessionId)}&status=eq.visible&select=${select}&order=created_at.desc&limit=${limit}`,
    );
  }

  return (Array.isArray(rows) ? rows : []).map(normalizeMessage).reverse();
}

async function handleBootstrap(request, env, headers) {
  const url = new URL(request.url);
  const session = await getOrCreateSession(env);
  const messages = await getMessagesForSession(env, session.id, getLimitFromUrl(url));
  return json({ success: true, session, messages }, 200, headers);
}

async function handleMessages(request, env, headers) {
  const url = new URL(request.url);
  const sessionId = cleanString(url.searchParams.get('session') || '', 80);
  if (!sessionId) {
    return json({ error: 'session_required' }, 400, headers);
  }

  const messages = await getMessagesForSession(env, sessionId, getLimitFromUrl(url));
  return json({ success: true, messages }, 200, headers);
}

async function handleNewSession(request, env, headers) {
  if (!env.MAINTENANCE_ADMIN_TOKEN) {
    return json({ error: 'admin_token_not_configured' }, 500, headers);
  }

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token !== env.MAINTENANCE_ADMIN_TOKEN) {
    return json({ error: 'unauthorized' }, 401, headers);
  }

  let data = {};
  try {
    data = await request.json();
  } catch {
    data = {};
  }

  const requestedSlug = cleanSessionSlug(data.slug);
  const slug = requestedSlug || `maintenance-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`;
  if (!env.MAINTENANCE_KV) {
    return json({ error: 'maintenance_kv_not_configured' }, 500, headers);
  }

  await env.MAINTENANCE_KV.put('maintenance_session_slug', slug);
  const session = await getOrCreateSessionBySlug(env, slug);
  return json({ success: true, session }, 200, headers);
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

  const country = getCountry(request);
  const row = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    generated_name: generatedName,
    country_code: country.code,
    country_name: country.name,
    message: messageText,
    status: 'visible',
  };

  async function insertMessage(messageRow) {
    return await supabaseRequest(env, 'maintenance_messages', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: [messageRow],
    });
  }

  let inserted;
  try {
    inserted = await insertMessage(row);
  } catch (error) {
    if (!(error instanceof SupabaseRestError)) throw error;
    const { country_code: countryCode, country_name: countryName, ...fallbackRow } = row;
    try {
      inserted = await insertMessage(fallbackRow);
    } catch (retryError) {
      if (!(retryError instanceof SupabaseRestError)) throw retryError;
      const refreshedSession = await refreshCurrentSession(env);
      const repairedRow = {
        ...row,
        id: crypto.randomUUID(),
        session_id: refreshedSession.id,
      };
      try {
        inserted = await insertMessage(repairedRow);
      } catch (countryRetryError) {
        if (!(countryRetryError instanceof SupabaseRestError)) throw countryRetryError;
        const { country_code: repairedCountryCode, country_name: repairedCountryName, ...repairedFallbackRow } = repairedRow;
        inserted = await insertMessage(repairedFallbackRow);
      }
    }
  }

  const message = normalizeMessage(inserted[0]);
  message.countryCode = message.countryCode || country.code;
  message.countryName = message.countryName || country.name;
  message.countryFlag = message.countryFlag || flagForCountryCode(country.code);
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
    if (method === 'GET' && pathname === '/api/maintenance/chat/bootstrap') {
      return await handleBootstrap(request, env, headers);
    }

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

    if (method === 'POST' && pathname === '/api/maintenance/chat/admin/session') {
      return await handleNewSession(request, env, headers);
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
