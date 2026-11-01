// Testy funkcji weryfikującej płatność (functions/api/verify.js) z atrapą API Stripe.
// Uruchom: node --test tests/verify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../functions/api/verify.js', import.meta.url), 'utf8');
const { onRequest, evaluateSession, isConfigured } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const NOW = Math.floor(Date.now() / 1000);
const REF = 'w0123456789abcdef0123456789abcdef';
const ENV = { STRIPE_SECRET_KEY: 'rk_live_abc123', PAYMENT_LINK_ID: 'plink_1TestLink', EXPECTED_AMOUNT: '1999' };
const good = () => ({
  id: 'cs_live_a1B2c3D4e5F6g7', object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid',
  currency: 'pln', amount_subtotal: 1999, amount_total: 1999, payment_link: 'plink_1TestLink', client_reference_id: REF,
  livemode: true, created: NOW - 60
});

let stripeCalls = [];
function mockStripe(session, status = 200) {
  globalThis.fetch = async (url, init) => {
    stripeCalls.push({ url, auth: init && init.headers && init.headers.Authorization });
    return { ok: status >= 200 && status < 300, status, json: async () => session };
  };
}
async function call(query, env = ENV, method = 'GET') {
  const res = await onRequest({ request: new Request('https://wzon.example/api/verify' + query, { method }), env });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test('isConfigured', () => {
  assert.ok(isConfigured(ENV), 'restricted live key + payment link → ready');
  assert.ok(!isConfigured({ ...ENV, STRIPE_SECRET_KEY: 'sk_live_abc123' }), 'FULL secret key sk_ is refused');
  assert.ok(!isConfigured({ STRIPE_SECRET_KEY: 'rk_live_abc123' }), 'missing PAYMENT_LINK_ID');
  assert.ok(!isConfigured({}), 'empty env');
});

test('evaluateSession: valid paid session (19,99 zł)', () => {
  assert.equal(evaluateSession(good(), REF, ENV, NOW).paid, true);
});

test('default EXPECTED_AMOUNT is 1999 grosze', () => {
  const env = { STRIPE_SECRET_KEY: ENV.STRIPE_SECRET_KEY, PAYMENT_LINK_ID: ENV.PAYMENT_LINK_ID };
  assert.equal(evaluateSession(good(), REF, env, NOW).paid, true);
  assert.equal(evaluateSession({ ...good(), amount_subtotal: 1499 }, REF, env, NOW).paid, false);
});

const BAD = [
  [{ payment_status: 'unpaid' }, 'unpaid'],
  [{ payment_status: 'no_payment_required' }, '100% discount (no payment)'],
  [{ status: 'open' }, 'open session'],
  [{ status: 'expired' }, 'expired session'],
  [{ currency: 'eur' }, 'wrong currency'],
  [{ amount_subtotal: 100 }, 'wrong price'],
  [{ amount_subtotal: 1499 }, 'price of another tool'],
  [{ amount_total: 0 }, 'zero total'],
  [{ payment_link: 'plink_OTHER' }, 'session from another product/link'],
  [{ client_reference_id: 'wSOMEONEELSE0000000000000000000000' }, 'ref mismatch (shared link)'],
  [{ client_reference_id: null }, 'payment made outside the site (no ref)'],
  [{ livemode: false }, 'test-mode payment in production'],
  [{ object: 'payment_intent' }, 'wrong object'],
  [{ mode: 'subscription' }, 'wrong mode']
];
for (const [patch, name] of BAD) {
  test(`evaluateSession rejects: ${name}`, () => {
    assert.equal(evaluateSession({ ...good(), ...patch }, REF, ENV, NOW).paid, false);
  });
}

test('test mode accepted only with ALLOW_TEST_MODE=true', () => {
  assert.equal(evaluateSession({ ...good(), livemode: false }, REF, { ...ENV, ALLOW_TEST_MODE: 'true' }, NOW).paid, true);
});

test('older than 30 days → expired; garbage input → false', () => {
  const old = evaluateSession({ ...good(), created: NOW - 31 * 86400 }, REF, ENV, NOW);
  assert.equal(old.paid, false);
  assert.equal(old.error, 'expired');
  assert.equal(evaluateSession(null, REF, ENV, NOW).paid, false);
  assert.equal(evaluateSession('x', REF, ENV, NOW).paid, false);
});

test('HTTP: ping', async () => {
  mockStripe(good());
  let r = await call('?ping=1');
  assert.equal(r.status, 200); assert.equal(r.body.ready, true);
  r = await call('?ping=1', { STRIPE_SECRET_KEY: 'sk_live_x', PAYMENT_LINK_ID: 'plink_1' });
  assert.equal(r.body.ready, false);
});

test('HTTP: paid session → {paid:true}, Stripe called with restricted key, no leaks', async () => {
  mockStripe(good()); stripeCalls = [];
  const r = await call(`?session_id=cs_live_a1B2c3D4e5F6g7&ref=${REF}`);
  assert.equal(r.status, 200);
  assert.equal(JSON.stringify(r.body), '{"paid":true}');
  assert.equal(stripeCalls.length, 1);
  assert.equal(stripeCalls[0].auth, 'Bearer rk_live_abc123');
  assert.equal(stripeCalls[0].url, 'https://api.stripe.com/v1/checkout/sessions/cs_live_a1B2c3D4e5F6g7');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('HTTP: bad input', async () => {
  mockStripe(good()); stripeCalls = [];
  let r = await call(`?session_id=cs_live_a1B2c3D4e5F6g7&ref=wWRONGWRONGWRONGWRONG`);
  assert.equal(r.body.paid, false, 'wrong ref');
  stripeCalls = [];
  r = await call(`?session_id=../../v1/customers&ref=${REF}`);
  assert.equal(r.status, 400); assert.equal(stripeCalls.length, 0, 'path traversal never reaches Stripe');
  r = await call(`?session_id=cs_live_a1B2c3D4e5F6g7&ref=${encodeURIComponent('<script>')}`);
  assert.equal(r.status, 400);
  r = await call(`?session_id=cs_live_a1B2c3D4e5F6g7`);
  assert.equal(r.status, 400);
  r = await call(`?session_id=cs_live_a1B2c3D4e5F6g7&ref=${REF}`, { STRIPE_SECRET_KEY: 'sk_live_full', PAYMENT_LINK_ID: 'plink_1TestLink' });
  assert.equal(r.status, 503); assert.equal(r.body.paid, false);
  r = await call(`?session_id=cs_live_a1B2c3D4e5F6g7&ref=${REF}`, ENV, 'POST');
  assert.equal(r.status, 405);
});

test('HTTP: Stripe errors', async () => {
  mockStripe({ error: { message: 'No such checkout.session' } }, 404);
  let r = await call(`?session_id=cs_live_zzzzzzzzzzzz&ref=${REF}`);
  assert.equal(r.status, 200); assert.equal(JSON.stringify(r.body), '{"paid":false}');
  mockStripe({}, 500);
  r = await call(`?session_id=cs_live_a1B2c3D4e5F6g7&ref=${REF}`);
  assert.equal(r.status, 502); assert.equal(r.body.paid, false);
  globalThis.fetch = async () => { throw new Error('network'); };
  r = await call(`?session_id=cs_live_a1B2c3D4e5F6g7&ref=${REF}`);
  assert.equal(r.status, 502); assert.equal(r.body.paid, false);
});
