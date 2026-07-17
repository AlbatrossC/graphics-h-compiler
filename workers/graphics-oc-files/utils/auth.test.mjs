import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticateRequest,
  buildSessionToken,
  shouldRefreshSession,
} from './auth.js';

const HOUR_SEC = 60 * 60;
const DAY_SEC = 24 * HOUR_SEC;
const TEST_ORIGIN = 'https://test.graphics-h-compiler.pages.dev';
const PROD_ORIGIN = 'https://graphicsh.online';

function requestFrom(origin) {
  return new Request('https://graphics-oc-api.graphicshcompiler.workers.dev/api/auth/session', {
    headers: { Origin: origin },
  });
}

test('test session is renewed after 24 hours of age', () => {
  const issuedAt = 1_800_000_000;
  const session = { iat: issuedAt, exp: issuedAt + (3 * DAY_SEC) };

  assert.equal(
    shouldRefreshSession(session, requestFrom(TEST_ORIGIN), issuedAt + DAY_SEC - 1),
    false,
  );
  assert.equal(
    shouldRefreshSession(session, requestFrom(TEST_ORIGIN), issuedAt + DAY_SEC),
    true,
  );
});

test('production keeps the existing final-24-hours renewal policy', () => {
  const issuedAt = 1_800_000_000;
  const session = { iat: issuedAt, exp: issuedAt + (3 * DAY_SEC) };

  assert.equal(
    shouldRefreshSession(session, requestFrom(PROD_ORIGIN), issuedAt + DAY_SEC),
    false,
  );
  assert.equal(
    shouldRefreshSession(session, requestFrom(PROD_ORIGIN), issuedAt + (2 * DAY_SEC)),
    true,
  );
});

test('test renewal covers an every-other-day return cadence', () => {
  const issuedAt = 1_800_000_000;
  const session = { iat: issuedAt, exp: issuedAt + (3 * DAY_SEC) };

  assert.equal(
    shouldRefreshSession(session, requestFrom(TEST_ORIGIN), issuedAt + (2 * DAY_SEC) - 1),
    true,
  );
});

test('a 24-hour-old test session is validated and renewed for a fresh 72 hours', async () => {
  const issuedAt = 1_800_000_000;
  const realDateNow = Date.now;
  const user = {
    user_id: 'test-user-id',
    display_name: 'Test User',
    email: 'test@example.com',
    avatar_url: null,
    write_blocked: 0,
    total_files: 0,
    total_storage: 0,
  };
  const env = {
    SESSION_SECRET: 'test-only-session-secret',
    graphicsh_oc_db: {
      prepare() {
        return {
          bind() { return this; },
          async first() { return user; },
        };
      },
    },
  };

  try {
    Date.now = () => issuedAt * 1000;
    const originalToken = await buildSessionToken(env, user);

    Date.now = () => (issuedAt + DAY_SEC) * 1000;
    const request = new Request(
      'https://graphics-oc-api.graphicshcompiler.workers.dev/api/auth/session',
      {
        headers: {
          Cookie: `session=${originalToken}`,
          Origin: TEST_ORIGIN,
        },
      },
    );
    const auth = await authenticateRequest(request, env);

    assert.ok(auth.refreshCookie, 'expected a renewed session cookie');
    assert.match(auth.refreshCookie, /Max-Age=259200(?:;|$)/);

    const renewedToken = auth.refreshCookie.match(/^session=([^;]+)/)?.[1];
    assert.ok(renewedToken, 'expected a JWT in the renewed session cookie');
    const payloadPart = renewedToken.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    assert.equal(payload.iat, issuedAt + DAY_SEC);
    assert.equal(payload.exp - payload.iat, 3 * DAY_SEC);
  } finally {
    Date.now = realDateNow;
  }
});
