/**
 * Maintenance status route — KV-based toggle.
 *
 * Read the `maintenance_mode` key from KV to check if the site is in maintenance.
 * Toggle via Cloudflare Dashboard → KV → change value between "true" and "false".
 */

export async function handleMaintenanceRoutes(request, env, method, headers) {
  if (method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers },
    );
  }

  try {
    let enabled = false;

    // Read from KV if the binding exists
    if (env.MAINTENANCE_KV) {
      const value = await env.MAINTENANCE_KV.get('maintenance_mode');
      enabled = value === 'true';
    }

    return Response.json({ enabled }, { headers });
  } catch (err) {
    console.error('Maintenance status error:', err);
    // Default to NOT in maintenance if KV fails
    return Response.json({ enabled: false }, { headers });
  }
}
