/**
 * Maintenance status route — KV-based toggle.
 *
 * Read a KV-backed maintenance flag.
 *
 * Targets:
 *  - /api/maintenance/status?target=test -> maintenance_mode_test
 *  - /api/maintenance/status?target=prod -> maintenance_mode_prod
 *  - /api/maintenance/status             -> legacy maintenance_mode
 */

const TARGET_KEYS = {
  test: 'maintenance_mode_test',
  prod: 'maintenance_mode_prod',
};

function normalizeTarget(value) {
  return value === 'prod' ? 'prod' : value === 'test' ? 'test' : '';
}

export async function handleMaintenanceRoutes(request, env, method, headers) {
  if (method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers },
    );
  }

  try {
    const url = new URL(request.url);
    const target = normalizeTarget(url.searchParams.get('target'));
    const key = target ? TARGET_KEYS[target] : 'maintenance_mode';
    let enabled = false;

    if (env.MAINTENANCE_KV) {
      const value = await env.MAINTENANCE_KV.get(key);
      enabled = value === 'true';
    }

    return Response.json({ enabled, target: target || 'legacy' }, { headers });
  } catch (err) {
    console.error('Maintenance status error:', err);
    return Response.json({ enabled: false }, { headers });
  }
}
