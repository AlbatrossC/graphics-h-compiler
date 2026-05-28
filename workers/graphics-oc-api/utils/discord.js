/**
 * Discord webhook utility.
 *
 * Replaces src/discord_utils.py.
 */

/**
 * Truncate a string to fit Discord's embed field limit.
 */
export function truncateField(text, limit = 1024) {
  const value = (text || '').trim();
  if (value.length <= limit) return value;
  return value.slice(0, limit - 3) + '...';
}

/**
 * Send a payload to the Discord webhook.
 *
 * @param {string} webhookUrl - The Discord webhook URL
 * @param {object} payload - The Discord message payload
 * @returns {Promise<boolean>}
 */
export async function sendDiscordWebhook(webhookUrl, payload) {
  if (!webhookUrl) return false;
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('Discord webhook rejected payload:', response.status, body.slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error('Discord webhook failed:', err);
    return false;
  }
}
