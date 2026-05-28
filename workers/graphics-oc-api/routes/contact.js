/**
 * Contact / feedback routes — send messages to Discord.
 *
 * Replaces src/blueprints/contact.py.
 */

import { sendDiscordWebhook, truncateField } from '../utils/discord.js';

export async function handleContactRoutes(request, env, method, pathname, headers) {
  if (method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers },
    );
  }

  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return Response.json(
      { error: 'Server configuration error' },
      { status: 500, headers },
    );
  }

  try {
    let data;
    try {
      data = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers },
      );
    }

    // ── /api/contact ────────────────────────────────────────────────
    if (pathname === '/api/contact') {
      const email = (data.email || '').trim();
      const message = (data.message || '').trim();
      const name = (data.name || '').trim() || 'Anonymous';

      if (!email || !message) {
        return Response.json(
          { error: 'Email and message are required' },
          { status: 400, headers },
        );
      }
      if (!email.includes('@') || !email.includes('.')) {
        return Response.json(
          { error: 'Invalid email format' },
          { status: 400, headers },
        );
      }

      const delivered = await sendDiscordWebhook(webhookUrl, {
        content: 'New contact query for Graphics.H OC',
        embeds: [
          {
            color: 0x00ff88,
            fields: [
              { name: 'Name', value: name, inline: false },
              { name: 'Email', value: email, inline: false },
              { name: 'Message', value: truncateField(message), inline: false },
            ],
          },
        ],
      });

      return Response.json(
        delivered
          ? { success: true, message: 'Message sent successfully' }
          : { success: false, error: 'Message delivery failed' },
        { status: delivered ? 200 : 502, headers },
      );
    }

    // ── /api/maintenance/message ────────────────────────────────────
    if (pathname === '/api/maintenance/message') {
      const message = (data.message || '').trim();
      if (!message) {
        return Response.json(
          { error: 'Message is required' },
          { status: 400, headers },
        );
      }

      const delivered = await sendDiscordWebhook(webhookUrl, {
        content: '🔧 Message from Maintenance Page',
        embeds: [
          {
            color: 0xff9900,
            fields: [
              { name: 'Message', value: truncateField(message), inline: false },
            ],
          },
        ],
      });

      return Response.json(
        delivered
          ? { success: true, message: 'Message sent successfully' }
          : { success: false, error: 'Message delivery failed' },
        { status: delivered ? 200 : 502, headers },
      );
    }

    // ── /api/feedback ───────────────────────────────────────────────
    if (pathname === '/api/feedback') {
      const message = (data.message || '').trim();
      if (!message) {
        return Response.json(
          { error: 'Message is required' },
          { status: 400, headers },
        );
      }

      const delivered = await sendDiscordWebhook(webhookUrl, {
        content: '⭐ **New Feedback from Compiler Pop-up**',
        embeds: [
          {
            color: 0xe3b341,
            fields: [
              { name: 'Message', value: truncateField(message), inline: false },
            ],
          },
        ],
      });

      return Response.json(
        delivered
          ? { success: true, message: 'Feedback sent successfully' }
          : { success: false, error: 'Feedback delivery failed' },
        { status: delivered ? 200 : 502, headers },
      );
    }

    return Response.json(
      { error: 'Route not found' },
      { status: 404, headers },
    );
  } catch (err) {
    console.error('Contact route error:', err);
    return Response.json(
      { error: 'Failed to process request' },
      { status: 500, headers },
    );
  }
}
