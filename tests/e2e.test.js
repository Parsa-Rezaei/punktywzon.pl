// Testy end-to-end (Playwright + Chromium + pdftotext) – kalkulator, PDF i bezpieczeństwo płatności.
// Uruchom: node tests/e2e.test.js   (wymaga: playwright z przeglądarką Chromium, poppler-utils)
// /api/verify jest atrapą (page.route) – prawdziwą funkcję testuje tests/verify.test.mjs.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'public'); // katalog publikowany (Cloudflare Pages: output directory = public)
const OUT = path.join(REPO, 'test-output');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS', name);
  else { failures++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); }
}

/* ---------- nagłówki z pliku _headers (blok "/*") ---------- */
const HEADERS = {};
{
  let inBlock = false;
  for (const line of fs.readFileSync(path.join(SITE, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) inBlock = line.trim() === '/*';
    else if (inBlock && line.includes(':')) { const i = line.indexOf(':'); HEADERS[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
}
// Na produkcji strona działa po HTTPS. Testowy host jest po HTTP, więc tylko tutaj usuwamy
// „upgrade-insecure-requests” (inaczej Chromium próbowałby pobierać pliki po https z serwera testowego).
const stripUpgrade = s => s.replace(/;\s*upgrade-insecure-requests/g, '');
HEADERS['Content-Security-Policy'] = stripUpgrade(HEADERS['Content-Security-Policy']);

const MODE = { paymentUrl: '' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = req.url;
  if (url.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); } // zawsze przechwytywane przez page.route
  const rel = decodeURIComponent(url.split('?')[0]).replace(/^\/$/, '/index.html');
  const p = path.join(SITE, rel);
  if (!p.startsWith(SITE + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  let body = fs.readFileSync(p);
  if (rel === '/index.html') body = Buffer.from(stripUpgrade(body.toString('utf8')));
  if (rel === '/assets/config.js') body = Buffer.from(body.toString('utf8').replace(/paymentUrl: '[^']*',/, `paymentUrl: '${MODE.paymentUrl || ''}',`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', ...HEADERS });
  res.end(body);
});

/* ---------- atrapa /api/verify ---------- */
const PAID = new Map(); // session_id → ref
const VERIFY = { ready: true, calls: [] };
async function mockVerify(page) {
  await page.route('**/api/verify**', route => {
    const u = new URL(route.request().url());
    VERIFY.calls.push(u.search);
    let body;
    if (u.searchParams.has('ping')) body = { ready: VERIFY.ready };
    else {
      const sid = u.searchParams.get('session_id'), ref = u.searchParams.get('ref');
      body = { paid: VERIFY.ready && PAID.has(sid) && PAID.get(sid) === ref };
    }
    route.fulfill({ status: VERIFY.ready ? 200 : 503, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function newPage(browser, opts = {}) {
  const context = await browser.newContext({ locale: 'pl-PL', timezoneId: 'Europe/Warsaw', acceptDownloads: true, viewport: { width: 1280, height: 900 }, ...opts });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const page = await context.newPage();
  page.errors = [];
  page.external = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Cross-Origin-Opener-Policy header has been ignored')) page.errors.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!/^(http:\/\/(127\.0\.0\.1|wzon\.test)(:\d+)?\/|data:|blob:|https:\/\/buy\.stripe\.com\/)/.test(u)) page.external.push(u); }); // buy.stripe.com = nawigacja do płatności
  await mockVerify(page);
  return { context, page };
}
async function pdfText(download, name) {
  const f = path.join(OUT, name);
  await download.saveAs(f);
  const txt = execFileSync('pdftotext', ['-layout', f, '-']).toString();
  const pages = +execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/)[1];
  return { txt, pages };
}
const isoDaysAgo = n => { const d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); };
async function fillAppeal(page) {
  await page.click('#btnDemo'); // przykład: decyzja 89 pkt + 4 zastrzeżenia
  for (const [s, v] of [['#cDecisionNo', 'WZON.4321.15.2026'], ['#cDecisionDate', isoDaysAgo(8)], ['#cDeliveryDate', isoDaysAgo(5)], ['#cWzonCity', 'Łodzi'],
    ['#cName', 'Łukasz Żółkiewski'], ['#cAddress', 'ul. Źródlana 5/12, 90-001 Łódź'], ['#cPlace', 'Łódź']]) await page.fill(s, v);
  await page.dispatchEvent('#cDeliveryDate', 'change');
  await page.waitForTimeout(200);
}
const overlayVisible = page => page.$eval('#paywallOverlay', e => !e.hidden);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const LOCAL = `http://127.0.0.1:${port}`;
  const PROD = `http://wzon.test:${port}`; // „prawdziwa” (nie-lokalna) domena – tryb demo musi być wyłączony
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP wzon.test 127.0.0.1`] });

  /* ======================= 1. Kalkulator (bezpłatny) ======================= */
  console.log('CALCULATOR (free)');
  MODE.paymentUrl = '';
  let { context, page } = await newPage(browser);
  await page.goto(PROD + '/');
  await page.click('#btnDemo');
  await page.waitForTimeout(200);
  const result = await page.textContent('#resultBox');
  check('example: decision 89 pkt (sum 88,470) → 2375 zł', /88,470/.test(result) && /89\s*pkt/.test(result) && result.includes('2375 zł'), result);
  check('example: corrected 90 pkt (sum 89,910) → 3562 zł', /89,910/.test(result) && /90\s*pkt/.test(result) && result.includes('3562 zł'), result);
  const rates = await page.textContent('#ratesBody');
  check('rates table unchanged (792 … 4353 zł)', ['792 zł', '1188 zł', '1583 zł', '2375 zł', '3562 zł', '4353 zł'].every(x => rates.includes(x)));
  await page.fill('#cDeliveryDate', '2026-10-02');
  await page.dispatchEvent('#cDeliveryDate', 'change');
  await page.waitForTimeout(100);
  check('deadline calculator works (14 days, k.p.a.)', (await page.textContent('#deadlineBox')).includes('16 października 2026'));
  const exposed = await page.evaluate(() => ['downloadAppeal', 'buildAppealDoc', 'onPay', 'onBuy', 'PAID', 'state', 'CONFIG', 'verifyPaid'].filter(k => typeof window[k] !== 'undefined'));
  check('SECURITY: no PDF/payment functions reachable from console', exposed.length === 0, exposed);
  let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#btnDiaryPdf')]);
  const diary = await pdfText(dl, 'dzienniczek.pdf');
  check('Dzienniczek opieki stays free on real domain (9 pages, Polish chars)', diary.pages === 9 && diary.txt.includes('DZIENNICZEK OPIEKI OSOBY NIESAMODZIELNEJ') && diary.txt.includes('Częściowe'), diary.pages);
  check('partner slot: neutral box, no invented business', (await page.textContent('#partnerBanner')).includes('Miejsce dla partnera – kontakt'));
  check('no JS errors (calculator)', page.errors.length === 0, page.errors);
  await context.close();

  /* ======================= 2. Tryb demo – tylko lokalnie ======================= */
  console.log('LOCAL DEMO MODE');
  ({ context, page } = await newPage(browser));
  await page.goto(LOCAL + '/');
  await fillAppeal(page);
  check('demo: preview unlocked on localhost without payment link', !(await overlayVisible(page)));
  await page.click('#btnAppealPdf');
  check('demo: checkout shows demo note', await page.$eval('#coDemo', e => !e.hidden));
  await page.click('#coPay');
  check('consents are mandatory', await page.$eval('#coError', e => !e.hidden && e.textContent.includes('obie zgody')));
  await page.check('#coTerms'); await page.check('#coWithdraw');
  [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#coPay')]);
  const demo = await pdfText(dl, 'demo-wniosek.pdf');
  check('demo PDF generated', demo.txt.includes('WNIOSEK O PONOWNE ROZPATRZENIE SPRAWY'));
  check('no JS errors (demo)', page.errors.length === 0, page.errors);
  await context.close();

  /* ======================= 3. Produkcja: brak linku płatności ======================= */
  console.log('PRODUCTION – payments not configured');
  MODE.paymentUrl = '';
  ({ context, page } = await newPage(browser));
  await page.goto(PROD + '/');
  await fillAppeal(page);
  check('locked on real domain without payment link (no free demo)', await overlayVisible(page));
  await page.click('#btnAppealPdf');
  check('"Sprzedaż chwilowo niedostępna" shown, pay button disabled', await page.$eval('#coUnavailable', e => !e.hidden && e.textContent.includes('nie pobraliśmy żadnych środków')) && await page.$eval('#coPay', b => b.disabled));
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.check('#coTerms'); await page.check('#coWithdraw');
  await page.click('#coPay', { force: true }).catch(() => {});
  await page.waitForTimeout(500);
  check('no PDF delivered without payment', !downloaded);
  await context.close();

  /* ======================= 4. Produkcja: przepływ płatności ======================= */
  console.log('PRODUCTION – payment flow');
  MODE.paymentUrl = 'https://buy.stripe.com/test_e2e';
  const captured = [];
  let paidSid = '';
  ({ context, page } = await newPage(browser));
  await context.route('https://buy.stripe.com/**', route => {
    const u = new URL(route.request().url());
    captured.push(u.href);
    paidSid = 'cs_live_' + crypto.randomBytes(12).toString('hex');
    PAID.set(paidSid, u.searchParams.get('client_reference_id'));
    route.fulfill({ status: 302, headers: { location: `${PROD}/?platnosc=sukces&session_id=${paidSid}` } });
  });
  await page.goto(PROD + '/');
  await fillAppeal(page);
  await page.fill('#cPesel', '44051401359');
  await page.fill('textarea[data-claim="12"][data-kind="ex"]', 'Codziennie rano i wieczorem opiekun myje ręce i twarz – samodzielnie niemożliwe.');
  await page.dispatchEvent('textarea[data-claim="12"][data-kind="ex"]', 'input');
  await page.waitForTimeout(300);
  const lockedHtml = await page.$eval('#appealPreview', e => e.innerHTML);
  check('locked preview: notice + grey bars', await overlayVisible(page) && lockedHtml.includes('locked-bar'));
  const pageHtml = await page.content();
  check('SECURITY: paid document text is NOT in the page', !['Mając powyższe na uwadze', 'UZASADNIENIE', 'Wnoszę o:', 'art. 107 § 3 k.p.a.'].some(t => pageHtml.includes(t)));
  check('buy button shows price 19,99 zł', (await page.textContent('#btnAppealPdf')).includes('19,99 zł'));

  // Próba oszustwa 1: podrobiony stan w localStorage
  await page.evaluate(() => {
    localStorage.setItem('kalkulatorWzon.pay.v1', JSON.stringify({ ref: 'w' + 'a'.repeat(32), sid: 'cs_live_forgedforged1234', ts: Date.now() }));
    localStorage.setItem('paid', 'true'); localStorage.setItem('unlocked', '1');
  });
  await page.reload();
  await page.waitForTimeout(800);
  check('SECURITY: forged localStorage does not unlock', await overlayVisible(page));
  check('SECURITY: forged payment record removed after server rejects it', await page.evaluate(() => localStorage.getItem('kalkulatorWzon.pay.v1') === null));

  // Próba oszustwa 2: ręczne dopisanie ?platnosc=sukces (bez rozpoczętego zamówienia i z nim)
  await page.goto(PROD + '/?platnosc=sukces');
  await page.waitForTimeout(500);
  check('SECURITY: ?platnosc=sukces alone does not unlock', await overlayVisible(page));
  await page.goto(PROD + '/?platnosc=sukces&session_id=cs_live_fakefakefake12345');
  await page.waitForTimeout(800);
  check('SECURITY: ?platnosc=sukces with fake session_id does not unlock', await overlayVisible(page));
  check('URL cleaned', !page.url().includes('platnosc'));

  // Prawdziwa (atrapa) płatność – formularz musi przetrwać przejście do Stripe i powrót
  await fillAppeal(page);
  await page.fill('#cPesel', '44051401359');
  check('personal data NOT kept in normal storage (remember off)', await page.evaluate(() => !JSON.stringify(Object.assign({}, sessionStorage, localStorage)).includes('Żółkiewski')));
  await page.click('#btnAppealPdf');
  await page.check('#coTerms'); await page.check('#coWithdraw');
  VERIFY.calls = [];
  const dlP = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#coPay');
  const d2 = await dlP;
  const pp = await pdfText(d2, 'oplacony-wniosek.pdf');
  check('ping before redirect', VERIFY.calls[0] === '?ping=1', VERIFY.calls);
  check('redirect carries random client_reference_id', captured.length === 1 && /client_reference_id=w[0-9a-f]{32}/.test(captured[0]), captured);
  check('after verified payment: PDF downloaded automatically', pp.txt.includes('WNIOSEK O PONOWNE ROZPATRZENIE SPRAWY'));
  check('PDF: Polish diacritics (ąęółśżźćń ŁŻŹ)', pp.txt.includes('Łukasz Żółkiewski') && pp.txt.includes('ul. Źródlana 5/12, 90-001 Łódź') && pp.txt.includes('Łodzi') && /Wojewódzki Zespół/.test(pp.txt), pp.txt.slice(0, 400));
  check('PDF: form survived Stripe round-trip (PESEL, decision no., claims, sum)', pp.txt.includes('44051401359') && pp.txt.includes('WZON.4321.15.2026') && pp.txt.includes('89,910') && pp.txt.includes('Mycie rąk i twarzy'));
  check('after verified payment: preview unlocked', !(await overlayVisible(page)));
  check('PRIVACY: temporary checkout snapshot removed after download', await page.evaluate(() => sessionStorage.getItem('kalkulatorWzon.checkout.v1') === null));
  await page.reload();
  await page.waitForTimeout(800);
  check('re-download possible after reload (server re-verifies)', !(await overlayVisible(page)) && (await page.textContent('#btnAppealPdf')).includes('opłacony'));
  check('SECURITY: zero CSP violations (payment flow incl. PDF)', (await page.evaluate(() => window.__csp)).length === 0, await page.evaluate(() => window.__csp));
  check('SECURITY: no third-party requests', page.external.length === 0, page.external);
  check('no JS errors (payment flow)', page.errors.length === 0, page.errors);
  const paidRef = await page.evaluate(() => JSON.parse(localStorage.getItem('kalkulatorWzon.pay.v1')).ref);
  await context.close();

  // Próba oszustwa 3: udostępniony link z opłaconym session_id w innej przeglądarce
  ({ context, page } = await newPage(browser));
  await page.goto(`${PROD}/?platnosc=sukces&session_id=${paidSid}`);
  await page.waitForTimeout(800);
  check('SECURITY: shared paid link does not unlock another browser', await overlayVisible(page));
  // Próba oszustwa 4: skradziony session_id + zgadywany ref
  await page.evaluate(sid => localStorage.setItem('kalkulatorWzon.pay.v1', JSON.stringify({ ref: 'w' + 'b'.repeat(32), sid, ts: Date.now() })), paidSid);
  await page.reload();
  await page.waitForTimeout(800);
  check('SECURITY: stolen session_id with wrong ref does not unlock', await overlayVisible(page));
  // Kontrola: ten sam sid z właściwym ref działa (blokuje ref, a nie błąd)
  await page.evaluate(([sid, ref]) => localStorage.setItem('kalkulatorWzon.pay.v1', JSON.stringify({ ref, sid, ts: Date.now() })), [paidSid, paidRef]);
  await page.reload();
  await page.waitForTimeout(800);
  check('control: correct ref + sid unlocks', !(await overlayVisible(page)));
  await context.close();

  // Ochrona klienta: serwer weryfikacji nie działa → brak przekierowania do płatności
  console.log('PRODUCTION – verifier down');
  VERIFY.ready = false;
  const captured2 = [];
  ({ context, page } = await newPage(browser));
  await context.route('https://buy.stripe.com/**', route => { captured2.push(route.request().url()); route.abort(); });
  await page.goto(PROD + '/');
  await fillAppeal(page);
  await page.click('#btnAppealPdf');
  await page.check('#coTerms'); await page.check('#coWithdraw');
  await page.click('#coPay');
  await page.waitForTimeout(1000);
  check('BUYER PROTECTION: verifier down → customer NOT sent to pay, message shown', captured2.length === 0 && (await page.$eval('#coError', e => !e.hidden && e.textContent.includes('Sprzedaż chwilowo niedostępna – nie pobraliśmy żadnych środków'))), captured2);
  VERIFY.ready = true;
  await context.close();

  /* ======================= 5. Mobile ======================= */
  console.log('MOBILE');
  MODE.paymentUrl = '';
  ({ context, page } = await newPage(browser, { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
  await page.goto(PROD + '/');
  await page.click('#btnDemo');
  await page.waitForTimeout(200);
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  check('mobile: no horizontal page scroll', ov.sw <= ov.w, ov);
  check('no JS errors (mobile)', page.errors.length === 0, page.errors);
  await context.close();

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL E2E TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
