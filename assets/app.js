/* Kalkulator Punktów WZON – logika aplikacji.
   Plik ładowany z tej samej domeny (Content-Security-Policy: script-src 'self').
   Nie dodawaj tu skryptów z innych serwerów ani kodu wykonywanego przez eval(). */
'use strict';

/* ================================================================
   KONFIGURACJA WŁAŚCICIELA SERWISU – uzupełnij przed publikacją
   Zasady bezpieczeństwa:
   - linki muszą zaczynać się od https:// (inne są ignorowane),
   - nie wpisuj tu haseł, kluczy API ani tokenów – ten plik jest publiczny,
   - numer telefonu do BLIK jest publiczny; bezpieczniej używać tylko
     strony płatności (BuyCoffee.to / link płatności).
   ================================================================ */
const CONFIG = Object.freeze({
  siteUrl: 'https://kalkulatorwzon.pl/',
  contactEmail: '',            // np. 'kontakt@kalkulatorwzon.pl'
  buyCoffeeUrl: '',            // np. 'https://buycoffee.to/twoja-nazwa'
  blikPhone: '',               // np. '500 600 700' (zalecane: zostaw puste)
  blikRecipient: '',           // np. 'Jan Kowalski'
  paymentLink: '',             // np. link do płatności Stripe / Przelewy24 (https://...)
  suggestedAmount: '19,99 zł',
  allowFreeDownload: true,     // true = przycisk „Pobierz bez wpłaty” jest widoczny
  partner: Object.freeze({     // kancelaria partnerska (baner oznaczony jako reklama)
    name: '',                  // np. 'Kancelaria Radcy Prawnego Jan Nowak'
    url: '',                   // np. 'https://kancelaria.pl/odwolanie-wzon'
    phone: '',                 // np. '+48 600 000 000'
    pitch: ''                  // np. 'Pierwsza konsultacja bezpłatna.'
  })
});

/* ---------- Walidacja konfiguracji (ochrona przed błędnymi lub niebezpiecznymi linkami) ---------- */
function safeHttpsUrl(u) {
  if (!u) return '';
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && !x.username && !x.password ? x.href : '';
  } catch (e) { return ''; }
}
function safeEmail(e) {
  const s = String(e || '').trim();
  return /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(s) ? s : '';
}
function safePhone(p) {
  const s = String(p || '').trim();
  return /^\+?[0-9 ]{9,16}$/.test(s) ? s : '';
}
function safeText(t, max) { return String(t || '').slice(0, max); }
const SAFE = Object.freeze({
  paymentLink: safeHttpsUrl(CONFIG.paymentLink),
  buyCoffeeUrl: safeHttpsUrl(CONFIG.buyCoffeeUrl),
  blikPhone: safePhone(CONFIG.blikPhone),
  blikRecipient: safeText(CONFIG.blikRecipient, 80),
  contactEmail: safeEmail(CONFIG.contactEmail),
  suggestedAmount: safeText(CONFIG.suggestedAmount, 20),
  allowFreeDownload: CONFIG.allowFreeDownload !== false,
  partner: Object.freeze({
    name: safeText(CONFIG.partner.name, 120),
    url: safeHttpsUrl(CONFIG.partner.url),
    phone: safePhone(CONFIG.partner.phone),
    pitch: safeText(CONFIG.partner.pitch, 200)
  }),
  siteHost: (() => { try { return new URL(CONFIG.siteUrl).hostname; } catch (e) { return ''; } })()
});

/* ================================================================
   STAŁE USTAWOWE (stan: październik 2026)
   ================================================================ */
const RENTA_GR = 197849;       // renta socjalna 1978,49 zł (od 1.03.2026 do 28.02.2027)
const RENTA_PREV_GR = 187891;  // renta socjalna 1878,91 zł (1.03.2025–28.02.2026)
const SP_2026 = 3386;          // świadczenie pielęgnacyjne 2026 r. (zł/mies.)
const KRYT_SINGLE = 1010;      // kryterium dochodowe pomocy społecznej – osoba samotnie gospodarująca
const KRYT_FAMILY = 823;       // kryterium dochodowe pomocy społecznej – osoba w rodzinie
const TOP_N = 25;
const BRACKETS = [
  { min: 70, max: 74, pct: 40 },
  { min: 75, max: 79, pct: 60 },
  { min: 80, max: 84, pct: 80 },
  { min: 85, max: 89, pct: 120 },
  { min: 90, max: 94, pct: 180 },
  { min: 95, max: 100, pct: 220 }
];
const THRESHOLDS = BRACKETS.map(b => b.min);

const ACTIVITIES = [
  'Zmiana pozycji ciała',
  'Poruszanie się w znanym środowisku',
  'Poruszanie się w nieznanym środowisku',
  'Sięganie, chwytanie i manipulowanie przedmiotami użytkowymi',
  'Przemieszczanie się środkami transportu',
  'Klasyfikacja docierających bodźców',
  'Przekazywanie informacji innym osobom',
  'Prowadzenie rozmowy',
  'Opanowanie nowej umiejętności praktycznej',
  'Koncentrowanie się na czynności',
  'Korzystanie z urządzeń i technologii informacyjno-komunikacyjnych',
  'Mycie i osuszanie całego ciała',
  'Mycie rąk i twarzy',
  'Pielęgnowanie poszczególnych części ciała',
  'Troska o własne zdrowie',
  'Korzystanie z toalety',
  'Ubieranie się',
  'Jedzenie i picie',
  'Stosowanie zalecanych środków terapeutycznych',
  'Realizowanie wyborów i decyzji',
  'Pozostawanie w domu samemu',
  'Nawiązywanie kontaktów',
  'Kontrolowanie własnych zachowań i emocji',
  'Utrzymywanie kontaktów z bliskimi',
  'Tworzenie bliskich relacji',
  'Kupowanie artykułów codziennej potrzeby',
  'Przygotowywanie posiłków',
  'Dbanie o dom, ubrania i obuwie',
  'Dokonywanie transakcji finansowych',
  'Rekreacja i organizacja czasu wolnego',
  'Załatwianie spraw urzędowych',
  'Realizowanie dziennego rozkładu zajęć'
];

const TYPES = [
  { k: 'T', name: 'towarzyszące', w: 80, text: 'wymaga stałego nadzoru lub obecności drugiej osoby (asekuracja, przypominanie, kierowanie)' },
  { k: 'C', name: 'częściowe', w: 90, text: 'może ją wykonać jedynie częściowo, wspólnie z opiekunem, który fizycznie pomaga w jej realizacji' },
  { k: 'P', name: 'pełne', w: 99, text: 'nie jest w stanie jej wykonać – czynność w całości wykonuje za nią opiekun (wyręczenie)' },
  { k: 'S', name: 'szczególne', w: 100, text: 'wymaga wsparcia innej osoby oraz stosowania technologii wspomagających podtrzymujących funkcje organizmu lub zapewnienia bezpieczeństwa w związku z zachowaniami niebezpiecznymi, agresywnymi lub oporującymi' }
];
const FREQS = [
  { k: 'D', name: 'czasami', w: 50, text: 'sporadycznie' },
  { k: 'C', name: 'często', w: 75, text: 'często, choć nie za każdym razem' },
  { k: 'B', name: 'bardzo często', w: 95, text: 'przy większości prób wykonania czynności' },
  { k: 'A', name: 'zawsze', w: 100, text: 'zawsze – przy każdej próbie wykonania czynności' }
];
const VALID_CODES = new Set(['', '0', ...TYPES.flatMap(t => FREQS.map(f => t.k + '-' + f.k))]);

/* ================================================================
   OBLICZENIA
   ================================================================ */
// Kod oceny: '' (nie wybrano) | '0' (samodzielnie) | 'P-A' (rodzaj-częstotliwość)
function parseCode(code) {
  if (!code || code === '0' || !VALID_CODES.has(code)) return null;
  const [tk, fk] = code.split('-');
  const t = TYPES.find(x => x.k === tk), f = FREQS.find(x => x.k === fk);
  return t && f ? { t, f } : null;
}
// Wartość w tysięcznych punktu: zdolność(1) × rodzaj × częstotliwość × waga 4, zaokrąglenie w górę do tysięcznych (§ 9)
function codeToMilli(code) {
  const p = parseCode(code);
  if (!p) return 0;
  return Math.ceil(p.t.w * p.f.w * 4 / 10);
}
function fmtMilli(m) {
  return (m / 1000).toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function codeLabel(code) {
  const p = parseCode(code);
  if (!p) return 'samodzielnie';
  return p.t.name + ', ' + p.f.name;
}
function rankIndices(milli) {
  return milli.map((v, i) => i).sort((a, b) => (milli[b] - milli[a]) || (a - b));
}
function scoreOf(milli) {
  const order = rankIndices(milli);
  const top = new Set(order.slice(0, TOP_N));
  const sum = order.slice(0, TOP_N).reduce((s, i) => s + milli[i], 0);
  const points = Math.floor((sum + 999) / 1000); // § 11: zaokrąglenie w górę do pełnego punktu
  return { sum, points, top, order };
}
function bracketFor(points) {
  return BRACKETS.find(b => points >= b.min && points <= b.max) || null;
}
function amountFor(points, baseGr = RENTA_GR) {
  const b = bracketFor(points);
  if (!b) return 0;
  return Math.floor((baseGr * b.pct + 9999) / 10000); // zaokrąglenie w górę do pełnych złotych
}
function nextThreshold(points) {
  return THRESHOLDS.find(t => t > points) || null;
}
// Ile tysięcznych brakuje, aby suma po zaokrągleniu w górę osiągnęła próg T (suma musi przekroczyć T−1)
function milliNeeded(sum, T) {
  return Math.max(0, (T - 1) * 1000 + 1 - sum);
}
function zl(n) {
  return n.toLocaleString('pl-PL') + ' zł';
}
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/* ================================================================
   STAN APLIKACJI I PAMIĘĆ PRZEGLĄDARKI
   Domyślnie dane trzymamy w sessionStorage (znikają po zamknięciu karty).
   localStorage tylko po zaznaczeniu „Zapamiętaj na tym urządzeniu”.
   PESEL nie jest zapisywany nigdy.
   ================================================================ */
const STORE_KEY = 'kalkulatorWzon.v2';
const REMEMBER_KEY = 'kalkulatorWzon.remember';
const A11Y_KEY = 'kalkulatorWzon.a11y';
const LEGACY_KEYS = ['kalkulatorWzon.v1'];
const MAX_STORED_CHARS = 200000;

const state = {
  mode: 'audit',
  dec: Array(32).fill(''),
  mine: Array(32).fill('same'),
  notes: {},
  b: defaultB(),
  c: {}
};
function defaultB() {
  return { source: 'dec', manual: '', careType: 'sp', careAmount: String(SP_2026), usw: false, mops: false, feeNow: '0', feeAfter: '0', income: '0', household: '1', otherIncome: '0' };
}
const PERSONAL_FIELDS = ['cName', 'cAddress', 'cPhone', 'cRepName', 'cRepAddress']; // PESEL celowo pominięty
const CASE_FIELDS = ['cDecisionNo', 'cDecisionPts', 'cDecisionDate', 'cDeliveryDate', 'cWzonCity', 'cWzonAddress', 'cPlace', 'cSigner', 'cExtra', 'cAttOther'];
const FIELD_MAX = { cExtra: 4000, cAttOther: 500 };
const SIGNERS = ['self', 'guardian', 'attorney'];

function getStore(kind) {
  try {
    const s = window[kind];
    const t = '__kw_test__';
    s.setItem(t, t); s.removeItem(t);
    return s;
  } catch (e) { return null; }
}
function rememberOn() {
  const ls = getStore('localStorage');
  try { return !!ls && ls.getItem(REMEMBER_KEY) === '1'; } catch (e) { return false; }
}
function activeStore() { return rememberOn() ? getStore('localStorage') : getStore('sessionStorage'); }
function removeEverywhere(keys) {
  ['localStorage', 'sessionStorage'].forEach(kind => {
    const s = getStore(kind);
    if (s) keys.forEach(k => { try { s.removeItem(k); } catch (e) { /* ignorujemy */ } });
  });
}

function cleanStr(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function cleanNumStr(v, fallback) {
  return typeof v === 'string' && /^[0-9]{0,9}(\.[0-9]{0,2})?$/.test(v) ? v : fallback;
}
// Pola typu number/date przyjmują tylko poprawny format – inaczej wartość jest pomijana
const FIELD_PATTERN = { cDecisionPts: /^[0-9]{0,3}$/, cDecisionDate: /^(\d{4}-\d{2}-\d{2})?$/, cDeliveryDate: /^(\d{4}-\d{2}-\d{2})?$/ };
// Wczytane dane traktujemy jako niezaufane: przyjmujemy tylko znane pola i dozwolone wartości.
function applyLoaded(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return;
  if (s.mode === 'audit' || s.mode === 'sim') state.mode = s.mode;
  if (Array.isArray(s.dec) && s.dec.length === 32) state.dec = s.dec.map(c => (typeof c === 'string' && VALID_CODES.has(c)) ? c : '');
  if (Array.isArray(s.mine) && s.mine.length === 32) state.mine = s.mine.map(c => (c === 'same' || (typeof c === 'string' && c !== '' && VALID_CODES.has(c))) ? c : 'same');
  if (s.notes && typeof s.notes === 'object') {
    for (let i = 0; i < 32; i++) {
      const n = Object.prototype.hasOwnProperty.call(s.notes, String(i)) ? s.notes[String(i)] : null;
      if (n && typeof n === 'object') {
        const just = cleanStr(n.just, 2000), ex = cleanStr(n.ex, 2000);
        if (just || ex) state.notes[String(i)] = { just, ex };
      }
    }
  }
  if (s.b && typeof s.b === 'object') {
    const b = s.b, d = defaultB();
    state.b = {
      source: ['dec', 'mine', 'manual'].includes(b.source) ? b.source : d.source,
      manual: cleanNumStr(b.manual, ''),
      careType: ['sp', 'szo', 'zdo', 'none'].includes(b.careType) ? b.careType : d.careType,
      careAmount: cleanNumStr(b.careAmount, d.careAmount),
      usw: b.usw === true,
      mops: b.mops === true,
      feeNow: cleanNumStr(b.feeNow, d.feeNow),
      feeAfter: cleanNumStr(b.feeAfter, d.feeAfter),
      income: cleanNumStr(b.income, d.income),
      household: cleanNumStr(b.household, d.household),
      otherIncome: cleanNumStr(b.otherIncome, d.otherIncome)
    };
  }
  if (s.c && typeof s.c === 'object') {
    const c = {};
    [...CASE_FIELDS, ...PERSONAL_FIELDS].forEach(id => {
      if (typeof s.c[id] === 'string' && (!FIELD_PATTERN[id] || FIELD_PATTERN[id].test(s.c[id]))) c[id] = s.c[id].slice(0, FIELD_MAX[id] || 300);
    });
    if (c.cSigner !== undefined && !SIGNERS.includes(c.cSigner)) c.cSigner = 'self';
    c.cRemember = s.c.cRemember === true;
    c.cAskHearing = s.c.cAskHearing !== false;
    state.c = c;
  }
}
function safeLoad() {
  removeEverywhere(LEGACY_KEYS); // starsza wersja zapisywała dane w localStorage na stałe
  const st = activeStore();
  if (!st) return;
  try {
    const raw = st.getItem(STORE_KEY);
    if (!raw || raw.length > MAX_STORED_CHARS) return;
    applyLoaded(JSON.parse(raw));
  } catch (e) { /* uszkodzone dane – zaczynamy od zera */ }
}
function safeSave() {
  const st = activeStore();
  if (!st) return;
  try {
    const c = {};
    const remember = document.getElementById('cRemember').checked;
    [...CASE_FIELDS, ...(remember ? PERSONAL_FIELDS : [])].forEach(id => { c[id] = document.getElementById(id).value; });
    c.cRemember = remember;
    c.cAskHearing = document.getElementById('cAskHearing').checked;
    st.setItem(STORE_KEY, JSON.stringify({ mode: state.mode, dec: state.dec, mine: state.mine, notes: state.notes, b: state.b, c }));
  } catch (e) { /* brak miejsca lub zablokowana pamięć – działamy bez zapisu */ }
}
function setRemember(on) {
  const ls = getStore('localStorage');
  if (!ls) return;
  try {
    if (on) { ls.setItem(REMEMBER_KEY, '1'); removeEverywhere([STORE_KEY]); }
    else { ls.removeItem(REMEMBER_KEY); ls.removeItem(STORE_KEY); }
  } catch (e) { /* ignorujemy */ }
  safeSave();
}
function mineCode(i) {
  return state.mine[i] === 'same' ? state.dec[i] : state.mine[i];
}
function decMilli() { return state.dec.map(codeToMilli); }
function mineMilli() { return state.dec.map((c, i) => codeToMilli(mineCode(i))); }

/* ================================================================
   RENDER: TABELA KWOT
   ================================================================ */
function renderRates() {
  const rows = [`<tr class="border-b border-slate-200"><th scope="row" class="p-2 md:p-3">poniżej 70</th><td class="p-2 md:p-3">–</td><td class="p-2 md:p-3 font-bold text-rose-700">0 zł</td><td class="p-2 md:p-3">0 zł</td><td class="p-2 md:p-3 text-slate-600">Brak prawa – rozważ odwołanie</td></tr>`];
  BRACKETS.forEach(b => {
    const m = amountFor(b.min), prev = amountFor(b.min, RENTA_PREV_GR);
    const tag = b.min === 70 ? ' <span class="ml-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">nowość od 1.01.2026</span>'
      : b.min === 75 ? ' <span class="ml-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">75–77 pkt: nowość od 1.01.2026</span>' : '';
    rows.push(`<tr class="border-b border-slate-200"><th scope="row" class="p-2 md:p-3">${b.min}–${b.max} pkt${tag}</th><td class="p-2 md:p-3">${b.pct}%</td><td class="p-2 md:p-3 font-bold text-teal-800 tabular-nums">${zl(m)}</td><td class="p-2 md:p-3 tabular-nums">${zl(m * 12)}</td><td class="p-2 md:p-3 text-slate-600 tabular-nums">${zl(prev)}</td></tr>`);
  });
  document.getElementById('ratesBody').innerHTML = rows.join('');
}

/* ================================================================
   RENDER: WIERSZE 32 CZYNNOŚCI
   ================================================================ */
function optionsHtml(withSame) {
  let h = withSame ? '<option value="same">= jak w decyzji</option>' : '<option value="">— wybierz —</option>';
  h += '<option value="0">0,000 – samodzielnie</option>';
  TYPES.forEach(t => {
    h += `<optgroup label="Wsparcie ${t.name} (${(t.w / 100).toFixed(2).replace('.', ',')})">`;
    FREQS.forEach(f => {
      const code = t.k + '-' + f.k;
      h += `<option value="${code}">${fmtMilli(codeToMilli(code))} – ${t.name}, ${f.name}</option>`;
    });
    h += '</optgroup>';
  });
  return h;
}
function buildRows() {
  const wrap = document.getElementById('activityRows');
  const decOpts = optionsHtml(false), mineOpts = optionsHtml(true);
  wrap.innerHTML = ACTIVITIES.map((name, i) => `
    <div class="act-row grid grid-cols-[2rem_minmax(0,1fr)] md:grid-cols-[2.5rem_minmax(0,1fr)_15.5rem_15.5rem] gap-2 md:gap-3 items-center p-3 rounded-xl border" data-i="${i}">
      <span class="font-bold text-slate-700">${i + 1}.</span>
      <div class="min-w-0">
        <span class="act-name font-semibold">${name}</span>
        <span class="act-badge ml-1 inline-block text-xs px-2 py-0.5 rounded-full align-middle"></span>
      </div>
      <label class="block col-span-2 md:col-span-1">
        <span class="dec-label md:sr-only text-xs font-semibold text-slate-600">Ocena w decyzji WZON</span>
        <select class="sel-dec mt-1 md:mt-0 w-full px-2 py-2 rounded-lg ring-1 ring-slate-300 bg-white" aria-label="Czynność ${i + 1}: ${name} – ocena w decyzji">${decOpts}</select>
      </label>
      <label class="block mine-cell col-span-2 md:col-span-1">
        <span class="md:sr-only text-xs font-semibold text-slate-600">Twoja ocena (rzeczywista)</span>
        <select class="sel-mine mt-1 md:mt-0 w-full px-2 py-2 rounded-lg ring-1 ring-slate-300 bg-white" aria-label="Czynność ${i + 1}: ${name} – Twoja ocena">${mineOpts}</select>
        <span class="mine-badge block text-xs mt-1"></span>
      </label>
    </div>`).join('');
  wrap.querySelectorAll('.act-row').forEach(row => {
    const i = +row.dataset.i;
    const sd = row.querySelector('.sel-dec'), sm = row.querySelector('.sel-mine');
    sd.value = state.dec[i];
    sm.value = state.mine[i];
    sd.addEventListener('change', () => { state.dec[i] = VALID_CODES.has(sd.value) ? sd.value : ''; updateAll(); });
    sm.addEventListener('change', () => { state.mine[i] = sm.value === 'same' || VALID_CODES.has(sm.value) ? sm.value : 'same'; updateAll(); });
  });
}
function syncSelects() {
  document.querySelectorAll('#activityRows .act-row').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('.sel-dec').value = state.dec[i];
    row.querySelector('.sel-mine').value = state.mine[i];
  });
}

/* ================================================================
   RENDER: WYNIKI MODUŁU A
   ================================================================ */
function scoreCard(title, sc) {
  const amt = amountFor(sc.points), b = bracketFor(sc.points);
  return `<div>
    <p class="text-xs font-bold uppercase text-slate-600">${title}</p>
    <p class="mt-1"><span class="text-4xl font-extrabold tabular-nums">${sc.points}</span> <span class="font-semibold">pkt</span></p>
    <p class="text-sm text-slate-700">Suma TOP 25: <strong class="tabular-nums">${fmtMilli(sc.sum)}</strong> → zaokrąglenie w górę</p>
    ${b ? `<p class="mt-2 text-lg font-bold text-teal-800">${zl(amt)} / mies.</p><p class="text-sm text-slate-700">${b.pct}% renty socjalnej · ${zl(amt * 12)} rocznie</p>`
        : `<p class="mt-2 text-lg font-bold text-rose-700">0 zł – brak prawa do świadczenia</p><p class="text-sm text-slate-700">Wymagane minimum: 70 pkt</p>`}
  </div>`;
}
function thresholdMessage(sc) {
  if (!state.dec.some(c => c !== '')) return '<p class="text-sm">Wybierz oceny czynności, aby zobaczyć, ile brakuje do kolejnego progu.</p>';
  const T = nextThreshold(sc.points);
  if (!T) return `<p class="font-bold">To najwyższy próg (95–100 pkt) – maksymalna kwota ${zl(amountFor(100))} miesięcznie.</p>`;
  const need = milliNeeded(sc.sum, T);
  const diff = amountFor(T) - amountFor(sc.points);
  return `<p class="font-bold text-lg">Brakuje${need <= 5000 ? ' tylko' : ''} ${fmtMilli(need)} pkt do progu ${T} pkt${need <= 5000 ? '!' : '.'}</p>
    <p class="mt-1">Przejście z ${sc.points} na ${T} pkt daje <strong>+${zl(diff)} miesięcznie</strong>, czyli <strong>+${zl(diff * 12)} rocznie</strong>.</p>
    <p class="mt-2 text-sm text-slate-700">Suma 25 najwyższych wartości musi przekroczyć ${T - 1},000 (np. ${T - 1},001 → ${T} pkt). Przykład: zmiana jednej czynności z 3,600 (częściowe, zawsze) na 3,960 (pełne, zawsze) dodaje 0,360.</p>`;
}
function updateRowsUI(dSc, mSc) {
  const audit = state.mode === 'audit';
  document.querySelectorAll('#activityRows .act-row').forEach(row => {
    const i = +row.dataset.i;
    const inTop = dSc.top.has(i);
    row.classList.toggle('row-top', inTop);
    row.classList.toggle('row-out', !inTop);
    const badge = row.querySelector('.act-badge');
    const v = codeToMilli(state.dec[i]);
    badge.textContent = (inTop ? 'TOP 25 · ' : 'pomijana · ') + fmtMilli(v);
    badge.className = 'act-badge ml-1 inline-block text-xs px-2 py-0.5 rounded-full align-middle ' + (inTop ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-800');
    const mb = row.querySelector('.mine-badge');
    if (audit) {
      const mv = codeToMilli(mineCode(i));
      if (state.mine[i] !== 'same' && mv !== v) {
        const d = mv - v;
        mb.innerHTML = `<span class="${d > 0 ? 'text-emerald-800' : 'text-rose-800'} font-semibold">${d > 0 ? '+' : '−'}${fmtMilli(Math.abs(d))} ${mSc.top.has(i) ? '(w TOP 25)' : '(poza TOP 25)'}</span>`;
      } else mb.textContent = '';
    }
    row.querySelector('.mine-cell').classList.toggle('hidden', !audit);
    row.querySelector('.dec-label').textContent = audit ? 'Ocena w decyzji WZON' : 'Przewidywana ocena';
  });
  document.getElementById('colMineHead').classList.toggle('invisible', !audit);
  document.getElementById('colDecHead').textContent = audit ? 'Ocena w decyzji WZON' : 'Przewidywana ocena';
  document.getElementById('howToText').textContent = audit
    ? 'W kolumnie „Ocena w decyzji WZON” wybierz wartość przypisaną każdej czynności w decyzji (np. 3,600). W kolumnie „Twoja ocena” zaznacz rodzaj i częstotliwość wsparcia, które faktycznie są potrzebne – tylko tam, gdzie się nie zgadzasz.'
    : 'Dla każdej z 32 czynności wybierz rodzaj i częstotliwość wsparcia, jakie realnie są potrzebne. Wynik pokaże, ile punktów może przyznać WZON przy takiej ocenie.';
  const filled = state.dec.filter(c => c !== '').length;
  document.getElementById('fillInfo').textContent = filled < 32
    ? `Uzupełniono ${filled} z 32 czynności. Niewybrane czynności liczone są jako 0,000.`
    : 'Uzupełniono wszystkie 32 czynności.';
}
function renderResults(dSc, mSc) {
  const audit = state.mode === 'audit';
  const box = document.getElementById('resultBox');
  if (audit) {
    const diff = amountFor(mSc.points) - amountFor(dSc.points);
    box.innerHTML = scoreCard('Decyzja WZON', dSc) +
      `<hr class="my-4 border-teal-200">` + scoreCard('Twoja ocena', mSc) +
      (mSc.points !== dSc.points
        ? `<p class="mt-4 p-3 rounded-lg ${diff > 0 ? 'bg-emerald-600' : 'bg-slate-700'} text-white font-semibold">Różnica: ${mSc.points - dSc.points > 0 ? '+' : ''}${mSc.points - dSc.points} pkt · ${diff >= 0 ? '+' : ''}${zl(diff)} / mies. · ${diff >= 0 ? '+' : ''}${zl(diff * 12)} / rok</p>`
        : `<p class="mt-4 text-sm text-slate-700">Twoja ocena daje taki sam wynik jak decyzja.</p>`);
  } else {
    box.innerHTML = scoreCard('Przewidywany wynik', dSc);
  }
  const bar = document.getElementById('mobileBar');
  bar.classList.toggle('hidden', !state.dec.some(c => c !== ''));
  bar.innerHTML = audit
    ? `<span>Decyzja: ${dSc.points} pkt · ${zl(amountFor(dSc.points))}</span><span>Twoja ocena: ${mSc.points} pkt · ${zl(amountFor(mSc.points))}</span>`
    : `<span>Wynik: ${dSc.points} pkt</span><span>${zl(amountFor(dSc.points))} / mies.</span>`;
  document.getElementById('thresholdBox').innerHTML =
    `<p class="text-xs font-bold uppercase text-amber-900 mb-1">${audit ? 'Decyzja WZON' : 'Przewidywany wynik'} – najbliższy próg</p>` + thresholdMessage(dSc);
}
function renderRanking(dSc) {
  const milli = decMilli();
  const list = document.getElementById('rankingList');
  list.innerHTML = dSc.order.map((i, pos) => {
    const inTop = pos < TOP_N;
    const sep = pos === TOP_N ? '<li class="py-1 text-xs font-bold uppercase text-slate-500 border-t-2 border-dashed border-slate-400 mt-2 pt-2">Granica TOP 25 – poniżej czynności pomijane</li>' : '';
    return sep + `<li class="grid grid-cols-[2rem_minmax(0,1fr)_3.6rem] gap-2 items-center ${inTop ? '' : 'text-slate-500'}">
      <span class="tabular-nums text-right">${pos + 1}.</span>
      <span class="min-w-0"><span class="block truncate">${i + 1}. ${ACTIVITIES[i]}</span>
        <span class="block bar ${inTop ? 'bg-emerald-500' : 'bg-slate-300'}" data-w="${Math.max(2, milli[i] / 40)}"></span></span>
      <span class="tabular-nums text-right font-semibold">${fmtMilli(milli[i])}</span></li>`;
  }).join('');
  // Szerokość ustawiana przez CSSOM (dozwolone przy CSP bez 'unsafe-inline')
  list.querySelectorAll('[data-w]').forEach(el => { el.style.width = Number(el.dataset.w) + '%'; });
}
// Zysk w sumie TOP 25 po zmianie jednej czynności
function gainFor(base, i, newMilli) {
  const arr = base.slice(); arr[i] = newMilli;
  return scoreOf(arr).sum - scoreOf(base).sum;
}
function oneStepUpgrades(code) {
  const p = parseCode(code), out = [];
  if (!p) { out.push('T-D'); return out; }
  const ti = TYPES.indexOf(p.t), fi = FREQS.indexOf(p.f);
  if (ti < 2) out.push(TYPES[ti + 1].k + '-' + p.f.k);   // T→C→P (wsparcie szczególne wymaga spełnienia odrębnych przesłanek)
  if (fi < 3) out.push(p.t.k + '-' + FREQS[fi + 1].k);
  return out;
}
function renderPotential(dSc, mSc) {
  const box = document.getElementById('potentialBox');
  if (!state.dec.some(c => c !== '')) { box.innerHTML = '<p class="text-slate-600">Uzupełnij oceny czynności (albo wczytaj przykład), aby zobaczyć podpowiedzi.</p>'; return; }
  const base = decMilli();
  const audit = state.mode === 'audit';
  const claims = [];
  if (audit) {
    state.dec.forEach((c, i) => {
      const mc = mineCode(i);
      const mv = codeToMilli(mc), dv = base[i];
      if (state.mine[i] !== 'same' && mv > dv) claims.push({ i, from: c, to: mc, delta: mv - dv, gain: gainFor(base, i, mv) });
    });
  }
  let html = '';
  if (claims.length) {
    claims.sort((a, b) => (b.gain - a.gain) || (b.delta - a.delta));
    html += `<p class="text-slate-700">Twoje zastrzeżenia do decyzji (${claims.length}). „Wpływ” to zmiana sumy TOP 25, gdyby WZON uznał tylko tę jedną korektę:</p><ol class="mt-3 space-y-2">`;
    claims.slice(0, 5).forEach(cl => {
      html += `<li class="p-3 rounded-lg ${cl.gain > 0 ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50 ring-1 ring-slate-200'}">
        <strong>${cl.i + 1}. ${ACTIVITIES[cl.i]}</strong><br>
        ${fmtMilli(codeToMilli(cl.from))} (${codeLabel(cl.from)}) → <strong>${fmtMilli(codeToMilli(cl.to))}</strong> (${codeLabel(cl.to)})<br>
        <span class="font-semibold ${cl.gain > 0 ? 'text-emerald-800' : 'text-slate-600'}">Wpływ na sumę: +${fmtMilli(cl.gain)}</span>${cl.gain === 0 ? ' – sama ta zmiana nie wejdzie do TOP 25' : ''}</li>`;
    });
    html += '</ol>';
    if (claims.length > 5) html += `<p class="mt-2 text-slate-600">…oraz ${claims.length - 5} kolejne (wszystkie trafią do wniosku w Module C).</p>`;
    const T = nextThreshold(dSc.points);
    if (T) {
      const arr = base.slice(); const used = []; const pool = claims.slice();
      while (scoreOf(arr).points < T && pool.length) {
        let best = -1, bestGain = -1;
        pool.forEach((cl, k) => { const g = gainFor(arr, cl.i, codeToMilli(cl.to)); if (g > bestGain) { bestGain = g; best = k; } });
        if (bestGain <= 0) break;
        const cl = pool.splice(best, 1)[0]; arr[cl.i] = codeToMilli(cl.to); used.push(cl.i + 1);
      }
      if (scoreOf(arr).points >= T) {
        html += `<p class="mt-3 p-3 rounded-lg bg-amber-100 text-amber-950"><strong>Do progu ${T} pkt wystarczy uznanie ${used.length} z ${claims.length} zastrzeżeń:</strong> czynności nr ${used.join(', ')}. To one powinny mieć najmocniejsze uzasadnienie i dowody.</p>`;
      } else {
        html += `<p class="mt-3 p-3 rounded-lg bg-slate-100">Nawet uznanie wszystkich zastrzeżeń daje ${mSc.points} pkt – do progu ${T} pkt brakuje jeszcze ${fmtMilli(milliNeeded(mSc.sum, T))}.</p>`;
      }
    }
  } else {
    const cands = [];
    state.dec.forEach((c, i) => {
      let best = null;
      oneStepUpgrades(c).forEach(up => {
        const g = gainFor(base, i, codeToMilli(up));
        if (g > 0 && (!best || g > best.gain)) best = { i, from: c, to: up, gain: g };
      });
      if (best) cands.push(best);
    });
    cands.sort((a, b) => (b.gain - a.gain) || (a.i - b.i));
    if (!cands.length) {
      html = '<p class="text-slate-600">Uzupełnij oceny czynności, aby zobaczyć podpowiedzi.</p>';
    } else {
      html += `<p class="text-slate-700">${audit ? 'Nie wskazano jeszcze zastrzeżeń w kolumnie „Twoja ocena”. ' : ''}Te czynności dają największy przyrost sumy TOP 25 przy ocenie wyższej o jeden stopień (rodzaj lub częstotliwość wsparcia). Sprawdź, czy taka ocena odpowiada rzeczywistości – np. czy przy czynności ocenionej jako „częściowe” opiekun w praktyce całkowicie ją wykonuje:</p><ol class="mt-3 space-y-2">`;
      cands.slice(0, 5).forEach(cl => {
        html += `<li class="p-3 rounded-lg bg-sky-50 ring-1 ring-sky-200"><strong>${cl.i + 1}. ${ACTIVITIES[cl.i]}</strong><br>
          ${fmtMilli(codeToMilli(cl.from))} (${codeLabel(cl.from)}) → ${fmtMilli(codeToMilli(cl.to))} (${codeLabel(cl.to)})<br>
          <span class="font-semibold text-sky-900">Wpływ na sumę: +${fmtMilli(cl.gain)}</span></li>`;
      });
      html += '</ol>';
    }
  }
  box.innerHTML = html;
}

/* ================================================================
   MODUŁ B
   ================================================================ */
function readB() {
  const b = state.b;
  const src = document.querySelector('input[name="bSource"]:checked');
  b.source = src && ['dec', 'mine', 'manual'].includes(src.value) ? src.value : 'dec';
  b.manual = document.getElementById('bManualPts').value;
  const ct = document.getElementById('bCareType').value;
  b.careType = ['sp', 'szo', 'zdo', 'none'].includes(ct) ? ct : 'sp';
  b.careAmount = document.getElementById('bCareAmount').value;
  b.usw = document.getElementById('bUsw').checked;
  b.mops = document.getElementById('bMops').checked;
  b.feeNow = document.getElementById('bFeeNow').value;
  b.feeAfter = document.getElementById('bFeeAfter').value;
  b.income = document.getElementById('bIncome').value;
  b.household = document.getElementById('bHousehold').value;
  b.otherIncome = document.getElementById('bOtherIncome').value;
}
function writeB() {
  const b = state.b;
  document.querySelectorAll('input[name="bSource"]').forEach(r => { r.checked = r.value === b.source; });
  document.getElementById('bManualPts').value = b.manual;
  document.getElementById('bCareType').value = b.careType;
  document.getElementById('bCareAmount').value = b.careAmount;
  document.getElementById('bUsw').checked = b.usw;
  document.getElementById('bMops').checked = b.mops;
  document.getElementById('bFeeNow').value = b.feeNow;
  document.getElementById('bFeeAfter').value = b.feeAfter;
  document.getElementById('bIncome').value = b.income;
  document.getElementById('bHousehold').value = b.household;
  document.getElementById('bOtherIncome').value = b.otherIncome;
}
// Liczba nieujemna, ograniczona do rozsądnego zakresu
function num(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) && n > 0 ? Math.min(n, 1e7) : 0;
}
const CARE_NAMES = { sp: 'Świadczenie pielęgnacyjne', szo: 'Specjalny zasiłek opiekuńczy', zdo: 'Zasiłek dla opiekuna', none: 'Świadczenie opiekuna' };
function renderB(dSc, mSc) {
  const b = state.b;
  document.getElementById('bDecPts').textContent = dSc.points;
  document.getElementById('bMinePts').textContent = mSc.points;
  document.getElementById('bMopsFields').classList.toggle('hidden', !b.mops);
  const pts = b.source === 'mine' ? mSc.points : b.source === 'manual' ? Math.min(100, Math.max(0, Math.round(num(b.manual)))) : dSc.points;
  const sw = amountFor(pts);
  const care = b.careType === 'none' ? 0 : num(b.careAmount);
  const feeNow = b.mops ? num(b.feeNow) : 0, feeAfter = b.mops ? num(b.feeAfter) : 0;
  const v1 = care - feeNow, v2 = sw - feeAfter;
  const careName = CARE_NAMES[b.careType] || CARE_NAMES.sp;
  const fmt = n => (n < 0 ? '−' : '') + zl(Math.round(Math.abs(n) * 100) / 100);
  let verdict;
  if (sw === 0) verdict = `<p class="p-4 rounded-xl bg-rose-50 ring-1 ring-rose-300 font-semibold">Przy ${pts} pkt świadczenie wspierające nie przysługuje (minimum 70 pkt).${care > 0 ? ' Zostań przy obecnym świadczeniu opiekuna.' : ''}</p>`;
  else if (v2 > v1) verdict = `<p class="p-4 rounded-xl bg-emerald-600 text-white font-semibold">Świadczenie wspierające jest korzystniejsze o ${fmt(v2 - v1)} miesięcznie (${fmt((v2 - v1) * 12)} rocznie).</p>`;
  else if (v2 < v1) verdict = `<p class="p-4 rounded-xl bg-amber-500 text-slate-950 font-semibold">Obecne świadczenie opiekuna jest korzystniejsze o ${fmt(v1 - v2)} miesięcznie (${fmt((v1 - v2) * 12)} rocznie).</p>`;
  else verdict = `<p class="p-4 rounded-xl bg-slate-200 font-semibold">Oba warianty dają taką samą kwotę.</p>`;
  document.getElementById('bResult').innerHTML = `
    <div class="overflow-x-auto"><table class="w-full text-sm md:text-base border-collapse min-w-[520px]">
      <caption class="text-left font-semibold mb-2">Porównanie dla ${pts} pkt (miesięcznie)</caption>
      <thead><tr class="bg-slate-100"><th class="p-2 text-left" scope="col">Pozycja</th><th class="p-2 text-right" scope="col">Wariant 1: zostaje ${careName.toLowerCase()}</th><th class="p-2 text-right" scope="col">Wariant 2: świadczenie wspierające</th></tr></thead>
      <tbody class="tabular-nums">
        <tr class="border-b border-slate-200"><th scope="row" class="p-2 text-left font-normal">${careName} (dla opiekuna)</th><td class="p-2 text-right">${fmt(care)}</td><td class="p-2 text-right">0 zł</td></tr>
        <tr class="border-b border-slate-200"><th scope="row" class="p-2 text-left font-normal">Świadczenie wspierające (dla osoby z niepełnosprawnością)</th><td class="p-2 text-right">0 zł</td><td class="p-2 text-right">${fmt(sw)}</td></tr>
        ${b.mops ? `<tr class="border-b border-slate-200"><th scope="row" class="p-2 text-left font-normal">Odpłatność za usługi opiekuńcze MOPS/GOPS</th><td class="p-2 text-right">${fmt(-feeNow)}</td><td class="p-2 text-right">${fmt(-feeAfter)}</td></tr>` : ''}
        <tr class="font-bold"><th scope="row" class="p-2 text-left">Razem miesięcznie</th><td class="p-2 text-right">${fmt(v1)}</td><td class="p-2 text-right">${fmt(v2)}</td></tr>
        <tr class="font-bold"><th scope="row" class="p-2 text-left">Razem rocznie</th><td class="p-2 text-right">${fmt(v1 * 12)}</td><td class="p-2 text-right">${fmt(v2 * 12)}</td></tr>
      </tbody></table></div>
    <div class="mt-4">${verdict}</div>`;

  // Pomocnik kryterium dochodowego
  const hh = Math.min(30, Math.max(1, Math.round(num(b.household) || 1)));
  const krit = hh === 1 ? KRYT_SINGLE : KRYT_FAMILY;
  const baseInc = num(b.income) + (hh > 1 ? num(b.otherIncome) : 0);
  const perBefore = hh === 1 ? baseInc : baseInc / hh;
  const perAfter = hh === 1 ? baseInc + sw : (baseInc + sw) / hh;
  const pct = v => Math.round(v / krit * 100);
  document.getElementById('bCriterionOut').innerHTML = `<p>Kryterium: <strong>${zl(krit)}</strong> ${hh === 1 ? '(osoba samotnie gospodarująca)' : 'na osobę w rodzinie'}.</p>
    <p>Dochód ${hh === 1 ? '' : 'na osobę '}bez świadczenia wspierającego: <strong>${fmt(perBefore)}</strong> (${pct(perBefore)}% kryterium)</p>
    <p>Dochód ${hh === 1 ? '' : 'na osobę '}ze świadczeniem wspierającym: <strong>${fmt(perAfter)}</strong> (${pct(perAfter)}% kryterium)</p>
    <p class="text-xs text-slate-600 mt-1">Ministerstwo Rodziny wskazało, że świadczenie wspierające nie jest wyłączone z dochodu w pomocy społecznej. Procent odpłatności za usługi opiekuńcze w zależności od dochodu ustala każda gmina w uchwale – odczytaj go tam dla nowego % kryterium.</p>`;

  const w = [];
  w.push('Obu świadczeń nie można pobierać za ten sam okres. ZUS zaleca, aby we wniosku o świadczenie wspierające wskazać datę, od której ma być przyznane, tak aby okresy się nie nakładały.');
  if (b.careType === 'sp') w.push('Przed złożeniem wniosku do ZUS ustal w MOPS/GOPS, czy w razie rezygnacji ze świadczenia wspierającego będzie możliwy powrót do świadczenia pielęgnacyjnego (od 2024 r. dla opiekunów dorosłych obowiązują zasady praw nabytych).');
  w.push('Świadczenie wspierające jest wypłacane osobie z niepełnosprawnością, a nie opiekunowi.');
  if (b.usw) w.push('Opiekun spełniający warunki może złożyć w ZUS elektroniczny wniosek USW-1 – wtedy składki emerytalne, rentowe i zdrowotne opłaca budżet państwa. Zgłoszenie dotyczy opieki tylko nad jedną osobą.');
  else w.push('Jeżeli opiekun nie pracuje z powodu opieki i mieszka razem z osobą z niepełnosprawnością, sprawdź warunki wniosku USW-1 w ZUS (ubezpieczenia emerytalne, rentowe i zdrowotne opłacane przez budżet państwa).');
  if (b.mops) w.push('Świadczenie wspierające wlicza się do dochodu przy ustalaniu odpłatności za usługi opiekuńcze – odpłatność może wzrosnąć.');
  w.push('Świadczenie wspierające nie przysługuje w czasie pobytu w DPS, ZOL, ZPO ani innej placówce zapewniającej całodobową opiekę.');
  document.getElementById('bWarnings').innerHTML = w.map(t => `<li class="flex gap-2"><span aria-hidden="true" class="text-amber-600 font-bold">!</span><span>${t}</span></li>`).join('');
}

/* ================================================================
   MODUŁ C – TERMINY (k.p.a.)
   ================================================================ */
function parseDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (y < 1900 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonthsClamp(d, n) {
  const y = d.getFullYear(), m = d.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const holidayCache = new Map();
function holidaysPL(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const e = easterSunday(y);
  const list = [[0, 1], [0, 6], [4, 1], [4, 3], [7, 15], [10, 1], [10, 11], [11, 25], [11, 26]].map(([m, d]) => new Date(y, m, d));
  if (y >= 2025) list.push(new Date(y, 11, 24)); // Wigilia – dzień wolny od 2025 r.
  list.push(e, addDays(e, 1), addDays(e, 49), addDays(e, 60)); // Wielkanoc, Poniedziałek Wielkanocny, Zielone Świątki, Boże Ciało
  const set = new Set(list.map(ymd));
  holidayCache.set(y, set);
  return set;
}
function isNonWorking(d) { return d.getDay() === 0 || d.getDay() === 6 || holidaysPL(d.getFullYear()).has(ymd(d)); }
// Art. 57 k.p.a.: termin liczony od dnia następującego po doręczeniu; jeśli koniec przypada w sobotę lub dzień ustawowo wolny – następny dzień roboczy
function appealDeadline(delivery) {
  let d = addDays(delivery, 14);
  while (isNonWorking(d)) d = addDays(d, 1);
  return d;
}
function fmtDateLong(d) { return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtDateShort(d) { return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function todayLocal() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function renderDeadlines(dSc) {
  const box = document.getElementById('deadlineBox');
  const delivery = parseDate(document.getElementById('cDeliveryDate').value);
  const ptsInput = document.getElementById('cDecisionPts').value;
  const pts = ptsInput !== '' ? Math.round(num(ptsInput)) : dSc.points;
  if (!delivery) {
    box.innerHTML = `<h3 class="font-bold text-base">Kalkulator terminów</h3><p class="mt-2 text-sm">Wpisz datę doręczenia decyzji, aby obliczyć ostatni dzień na wniosek o ponowne rozpatrzenie sprawy (14 dni) i okno na wniosek do ZUS.</p>`;
    return;
  }
  const dl = appealDeadline(delivery);
  const left = Math.round((dl - todayLocal()) / 86400000);
  const final = addDays(dl, 1);
  const zusEnd = addMonthsClamp(final, 3);
  let status;
  if (left > 1) status = `<p class="mt-2 text-sm font-semibold">Zostało ${left} dni.</p>`;
  else if (left === 1) status = `<p class="mt-2 text-sm font-semibold">Termin upływa jutro!</p>`;
  else if (left === 0) status = `<p class="mt-2 text-sm font-semibold">Termin upływa dziś – złóż wniosek w WZON lub nadaj go dziś w placówce Poczty Polskiej.</p>`;
  else status = `<p class="mt-2 text-sm font-semibold">Termin minął ${-left} dni temu. Jeżeli uchybienie nastąpiło bez Twojej winy, złóż wniosek o przywrócenie terminu (w ciągu 7 dni od ustania przyczyny) razem z wnioskiem o ponowne rozpatrzenie (art. 58 k.p.a.).</p>`;
  box.innerHTML = `<h3 class="font-bold text-base">Ostatni dzień na wniosek do WZON</h3>
    <p class="mt-1 text-2xl font-extrabold text-rose-800">${fmtDateLong(dl)}</p>${status}
    <p class="mt-2 text-xs text-slate-700">14 dni liczone od dnia po doręczeniu (${fmtDateShort(delivery)}); gdy koniec wypada w sobotę, niedzielę lub święto – przesuwa się na najbliższy dzień roboczy (art. 57 k.p.a.). Liczy się data nadania w placówce Poczty Polskiej.</p>
    <hr class="my-3 border-rose-200">
    <h3 class="font-bold text-base">Wniosek do ZUS (SWN)</h3>
    ${pts >= 70
      ? `<p class="mt-1 text-sm">Jeżeli <strong>nie</strong> złożysz wniosku do WZON, decyzja stanie się ostateczna po upływie terminu (orientacyjnie ${fmtDateShort(final)}). Według ZUS masz wtedy 3 miesiące – orientacyjnie do <strong>${fmtDateShort(zusEnd)}</strong> – aby złożyć elektroniczny wniosek z wyrównaniem.</p>
         <p class="mt-1 text-xs text-slate-700">Jeżeli złożysz wniosek o ponowne rozpatrzenie, ZUS przyjmie wniosek dopiero po nowej, ostatecznej decyzji – 3 miesiące liczą się od niej. Nie zwlekaj do ostatniego dnia.</p>`
      : `<p class="mt-1 text-sm">Decyzja poniżej 70 pkt nie daje prawa do świadczenia wspierającego – wniosek do ZUS ma sens dopiero po uzyskaniu co najmniej 70 pkt.</p>`}`;
}

/* ================================================================
   MODUŁ C – LISTA ZASTRZEŻEŃ
   ================================================================ */
function currentClaims() {
  if (state.mode !== 'audit') return [];
  const out = [];
  state.dec.forEach((c, i) => {
    const mc = mineCode(i);
    if (state.mine[i] !== 'same' && codeToMilli(mc) > codeToMilli(c)) out.push({ i, from: c, to: mc });
  });
  return out;
}
function defaultJustification(cl) {
  const p = parseCode(cl.to);
  const from = `${fmtMilli(codeToMilli(cl.from))} pkt (${codeLabel(cl.from)})`;
  return `W decyzji przyjęto ${from}. W rzeczywistości przy tej czynności osoba zainteresowana ${p.t.text}, a wsparcie jest potrzebne ${p.f.text}. Odpowiada to wsparciu ${p.t.name}mu o częstotliwości „${p.f.name}”, tj. ${fmtMilli(codeToMilli(cl.to))} pkt.`;
}
function renderClaimsForm() {
  const wrap = document.getElementById('cClaims');
  const claims = currentClaims();
  if (!claims.length) {
    wrap.innerHTML = `<p class="p-3 rounded-lg bg-amber-50 ring-1 ring-amber-300 text-sm">Brak wskazanych czynności. W Module A (tryb „Mam decyzję WZON”) ustaw „Twoja ocena” wyżej niż w decyzji dla czynności, z którymi się nie zgadzasz. Możesz też wygenerować wniosek z samym opisem okoliczności.</p>`;
    return;
  }
  const dPts = scoreOf(decMilli()).points, ptsIn = document.getElementById('cDecisionPts').value;
  const mismatch = ptsIn !== '' && Math.round(num(ptsIn)) !== dPts
    ? `<p class="p-3 rounded-lg bg-amber-50 ring-1 ring-amber-300 text-sm">Uwaga: z ocen wpisanych w Module A wychodzi ${dPts} pkt, a w polu „Punkty w decyzji” jest ${Math.round(num(ptsIn))} pkt. Sprawdź, czy wpisano wszystkie 32 wartości zgodnie z decyzją – inaczej wniosek nie poda wyliczenia punktów.</p>` : '';
  wrap.innerHTML = mismatch + claims.map(cl => {
    const key = String(cl.i);
    const note = state.notes[key] || {};
    const just = note.just || defaultJustification(cl);
    const ex = note.ex || '';
    return `<div class="p-4 rounded-xl ring-1 ring-slate-300">
      <p class="font-bold">${cl.i + 1}. ${ACTIVITIES[cl.i]}: ${fmtMilli(codeToMilli(cl.from))} → ${fmtMilli(codeToMilli(cl.to))}</p>
      <label class="block mt-2"><span class="text-sm font-semibold">Uzasadnienie</span>
        <textarea data-claim="${key}" data-kind="just" rows="5" maxlength="2000" class="mt-1 w-full px-3 py-2 rounded-lg ring-1 ring-slate-300">${escHtml(just)}</textarea></label>
      <label class="block mt-2"><span class="text-sm font-semibold">Konkretne przykłady z ostatnich tygodni (zalecane)</span>
        <textarea data-claim="${key}" data-kind="ex" rows="2" maxlength="2000" class="mt-1 w-full px-3 py-2 rounded-lg ring-1 ring-slate-300" placeholder="np. 12.10 – upadek przy próbie samodzielnego wyjścia do toalety; codziennie rano i wieczorem opiekun…">${escHtml(ex)}</textarea></label>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-claim]').forEach(el => el.addEventListener('input', () => {
    const k = el.dataset.claim;
    if (!/^([0-9]|[12][0-9]|3[01])$/.test(k)) return;
    const kind = el.dataset.kind === 'ex' ? 'ex' : 'just';
    state.notes[k] = state.notes[k] || { just: '', ex: '' };
    state.notes[k][kind] = el.value.slice(0, 2000);
    safeSave();
  }));
}

/* ================================================================
   PDF (pdfmake z tej samej domeny, ładowany dopiero po kliknięciu)
   ================================================================ */
const PDF_LIBS = [
  { src: 'assets/vendor/pdfmake-0.2.20.min.js', sri: 'sha384-G23ofMOEI98f9UnroUBjDi6Ll55Y5E6bOX4VAMJo0nIbuQRIxzn0g4athUOb58zs' },
  { src: 'assets/vendor/vfs_fonts-0.2.20.js', sri: 'sha384-pv+tpy6KGI5sKXJDf7oGPdvyVNKYXfAmDYpZ3r3PNP0d13PJQ6YMiiAEndd5sU15' }
];
let pdfPromise = null;
function loadScript(lib) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = lib.src; s.integrity = lib.sri;
    s.onload = resolve; s.onerror = () => reject(new Error('Nie udało się wczytać biblioteki PDF.'));
    document.head.appendChild(s);
  });
}
function ensurePdfMake() {
  if (window.pdfMake && window.pdfMake.vfs) return Promise.resolve();
  if (!pdfPromise) pdfPromise = loadScript(PDF_LIBS[0]).then(() => loadScript(PDF_LIBS[1])).catch(e => { pdfPromise = null; throw e; });
  return pdfPromise;
}
function setPdfStatus(t) { document.getElementById('pdfStatus').textContent = t; }

function val(id) { return document.getElementById(id).value.trim(); }
function peselValid(p) {
  if (!/^\d{11}$/.test(p)) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let s = 0;
  for (let i = 0; i < 10; i++) s += w[i] * Number(p[i]);
  return (10 - (s % 10)) % 10 === Number(p[10]);
}
function collectAppeal() {
  const dSc = scoreOf(decMilli()), mSc = scoreOf(mineMilli());
  const ptsIn = val('cDecisionPts');
  const signerRaw = val('cSigner');
  const signer = SIGNERS.includes(signerRaw) ? signerRaw : 'self';
  const attachments = [...document.querySelectorAll('#cAttachments input:checked')].map(x => x.value);
  val('cAttOther').split(',').map(s => s.trim()).filter(Boolean).slice(0, 15).forEach(s => attachments.push(s.slice(0, 150)));
  const claims = currentClaims().map(cl => {
    const box = document.querySelector(`#cClaims [data-claim="${cl.i}"][data-kind="just"]`);
    const ex = document.querySelector(`#cClaims [data-claim="${cl.i}"][data-kind="ex"]`);
    return { ...cl, just: box ? box.value.trim().slice(0, 2000) : defaultJustification(cl), ex: ex ? ex.value.trim().slice(0, 2000) : '' };
  });
  return {
    decisionNo: val('cDecisionNo'), decisionDate: parseDate(val('cDecisionDate')), delivery: parseDate(val('cDeliveryDate')),
    decisionPtsRaw: ptsIn,
    decisionPts: ptsIn !== '' ? Math.round(num(ptsIn)) : dSc.points,
    wzonCity: val('cWzonCity'), wzonAddress: val('cWzonAddress'),
    name: val('cName'), pesel: val('cPesel'), address: val('cAddress'), phone: val('cPhone'),
    place: val('cPlace'), signer, repName: val('cRepName'), repAddress: val('cRepAddress'),
    extra: val('cExtra').slice(0, 4000), askHearing: document.getElementById('cAskHearing').checked,
    attachments, claims, dSc, mSc
  };
}
const EARLIEST_DECISION = new Date(2023, 10, 29); // rozporządzenie obowiązuje od 29.11.2023
function validateAppeal(d) {
  const errs = [];
  const today = todayLocal();
  if (!d.decisionNo) errs.push(['cDecisionNo', 'Wpisz numer decyzji / znak sprawy.']);
  if (d.decisionPtsRaw !== '' && !/^(100|[1-9]?[0-9])$/.test(d.decisionPtsRaw)) errs.push(['cDecisionPts', 'Punkty w decyzji to liczba całkowita od 0 do 100.']);
  if (!d.decisionDate) errs.push(['cDecisionDate', 'Wpisz datę wydania decyzji.']);
  else if (d.decisionDate < EARLIEST_DECISION || d.decisionDate > today) errs.push(['cDecisionDate', 'Data wydania decyzji jest nieprawidłowa (nie może być z przyszłości).']);
  if (!d.delivery) errs.push(['cDeliveryDate', 'Wpisz datę doręczenia decyzji.']);
  else if (d.delivery > today) errs.push(['cDeliveryDate', 'Data doręczenia nie może być z przyszłości.']);
  else if (d.decisionDate && d.delivery < d.decisionDate) errs.push(['cDeliveryDate', 'Data doręczenia nie może być wcześniejsza niż data wydania decyzji.']);
  if (!d.wzonCity) errs.push(['cWzonCity', 'Wpisz miasto siedziby WZON (np. „Krakowie”).']);
  if (!d.name) errs.push(['cName', 'Wpisz imię i nazwisko osoby zainteresowanej.']);
  if (!d.address) errs.push(['cAddress', 'Wpisz adres osoby zainteresowanej.']);
  if (d.signer !== 'self' && !d.repName) errs.push(['cRepName', 'Wpisz imię i nazwisko osoby podpisującej wniosek.']);
  if (d.pesel && !peselValid(d.pesel)) errs.push(['cPesel', 'Numer PESEL jest nieprawidłowy (sprawdź cyfry) – możesz też zostawić pole puste.']);
  return errs;
}
function renderErrorList(errs) {
  return '<p class="font-bold">Uzupełnij, proszę:</p><ul class="list-disc pl-5 mt-1">' + errs.map(e => `<li><a href="#${e[0]}" class="underline">${escHtml(e[1])}</a></li>`).join('') + '</ul>';
}
function showErrors(errs) {
  const box = document.getElementById('cErrors');
  if (!errs.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = renderErrorList(errs);
  box.classList.remove('hidden');
  box.focus();
}

function buildAppealDoc(d) {
  const signerRole = { self: '', guardian: 'opiekun prawny / przedstawiciel ustawowy', attorney: 'pełnomocnik' }[d.signer];
  const consistent = d.dSc.points === d.decisionPts;
  const requested = d.claims.length && consistent && d.mSc.points > d.decisionPts ? d.mSc.points : null;
  const content = [];
  content.push({ text: `${d.place || '....................'}, dnia ${fmtDateShort(todayLocal())}`, alignment: 'right', margin: [0, 0, 0, 16] });
  const sender = [{ text: d.name, bold: true }, d.address];
  if (d.pesel) sender.push('PESEL: ' + d.pesel);
  if (d.phone) sender.push('tel.: ' + d.phone);
  if (d.signer !== 'self') {
    sender.push({ text: ' ', fontSize: 4 });
    sender.push({ text: `reprezentowana/y przez: ${d.repName}${d.repAddress ? ', ' + d.repAddress : ''} (${signerRole})` });
  }
  content.push({ columns: [{ width: '55%', stack: sender }, { width: '*', text: '' }] });
  const wzon = [{ text: 'Wojewódzki Zespół do Spraw Orzekania', bold: true }, { text: 'o Niepełnosprawności w ' + d.wzonCity, bold: true }];
  if (d.wzonAddress) wzon.push(d.wzonAddress);
  content.push({ columns: [{ width: '45%', text: '' }, { width: '*', stack: wzon }], margin: [0, 18, 0, 18] });
  content.push({ text: `Znak sprawy / nr decyzji: ${d.decisionNo}`, margin: [0, 0, 0, 14] });
  content.push({ text: 'WNIOSEK O PONOWNE ROZPATRZENIE SPRAWY', style: 'title' });
  content.push({ text: 'dotyczący decyzji ustalającej poziom potrzeby wsparcia', alignment: 'center', margin: [0, 0, 0, 14] });

  const who = d.signer === 'self' ? 'Działając we własnym imieniu' : `Działając jako ${signerRole} osoby zainteresowanej (${d.name})`;
  const inTime = todayLocal() <= appealDeadline(d.delivery);
  content.push({ text: `${who}${inTime ? ', w terminie 14 dni od dnia doręczenia' : ''}, składam wniosek o ponowne rozpatrzenie sprawy zakończonej decyzją nr ${d.decisionNo} z dnia ${fmtDateShort(d.decisionDate)} (doręczoną dnia ${fmtDateShort(d.delivery)}), ustalającą poziom potrzeby wsparcia na ${d.decisionPts} pkt.`, margin: [0, 0, 0, 8] });
  content.push({ text: d.claims.length ? 'Decyzję kwestionuję w zakresie oceny czynności wskazanych w uzasadnieniu.' : 'Nie zgadzam się z ustaloną oceną poziomu potrzeby wsparcia.', margin: [0, 0, 0, 8] });
  content.push({ text: 'Wnoszę o:', bold: true, margin: [0, 4, 0, 4] });
  const asks = [];
  if (requested) asks.push(`zmianę zaskarżonej decyzji i ustalenie poziomu potrzeby wsparcia na poziomie co najmniej ${requested} pkt;`);
  else asks.push('zmianę zaskarżonej decyzji i ponowne ustalenie poziomu potrzeby wsparcia zgodnie z rzeczywistym stanem;');
  asks.push('ponowną ocenę czynności wskazanych poniżej, z uwzględnieniem rzeczywistego rodzaju i częstotliwości wymaganego wsparcia;');
  if (d.askHearing) asks.push('przeprowadzenie oceny z udziałem osoby zainteresowanej oraz wysłuchanie opiekuna sprawującego codzienną opiekę;');
  if (d.attachments.length) asks.push('dopuszczenie i przeprowadzenie dowodów z dokumentów załączonych do wniosku.');
  content.push({ ol: asks, margin: [0, 0, 0, 12] });

  content.push({ text: 'UZASADNIENIE', style: 'h2' });
  content.push({ text: 'Zgodnie z rozporządzeniem Ministra Rodziny i Polityki Społecznej z dnia 23 listopada 2023 r. w sprawie ustalania poziomu potrzeby wsparcia (Dz.U. z 2023 r. poz. 2581) wartość punktową każdej z 32 czynności ustala się jako iloczyn współczynnika zdolności do samodzielnego wykonywania czynności, współczynnika rodzaju wymaganego wsparcia, współczynnika częstotliwości wymaganego wsparcia oraz wagi czynności, a poziom potrzeby wsparcia stanowi suma 25 najwyższych wartości, zaokrąglona w górę do pełnego punktu. Ocena rodzaju i częstotliwości wsparcia przyjęta w decyzji nie odpowiada rzeczywistej sytuacji osoby zainteresowanej.', margin: [0, 0, 0, 10] });

  if (d.claims.length) {
    const body = [[{ text: 'Lp.', style: 'th' }, { text: 'Czynność', style: 'th' }, { text: 'Ocena w decyzji', style: 'th' }, { text: 'Ocena prawidłowa', style: 'th' }, { text: 'Różnica', style: 'th' }]];
    d.claims.forEach(cl => {
      const a = codeToMilli(cl.from), b = codeToMilli(cl.to);
      body.push([String(cl.i + 1), ACTIVITIES[cl.i], `${fmtMilli(a)}\n(${codeLabel(cl.from)})`, `${fmtMilli(b)}\n(${codeLabel(cl.to)})`, '+' + fmtMilli(b - a)]);
    });
    content.push({ table: { headerRows: 1, dontBreakRows: true, widths: ['auto', '*', 'auto', 'auto', 'auto'], body }, layout: 'lightHorizontalLines', fontSize: 9.5, margin: [0, 0, 0, 10] });
    d.claims.forEach(cl => {
      content.push({ text: `Czynność nr ${cl.i + 1} – ${ACTIVITIES[cl.i]}`, bold: true, margin: [0, 6, 0, 2] });
      content.push({ text: cl.just, margin: [0, 0, 0, 2] });
      if (cl.ex) content.push({ text: 'Przykłady: ' + cl.ex, italics: true, margin: [0, 0, 0, 2] });
    });
    if (consistent) content.push({ text: `Po uwzględnieniu powyższych korekt suma 25 najwyższych wartości wynosi ${fmtMilli(d.mSc.sum)}, co po zaokrągleniu w górę daje ${d.mSc.points} pkt (w decyzji: ${d.decisionPts} pkt).`, margin: [0, 8, 0, 8] });
  }
  if (d.extra) {
    content.push({ text: 'Dodatkowe okoliczności', bold: true, margin: [0, 6, 0, 2] });
    content.push({ text: d.extra, margin: [0, 0, 0, 8] });
  }
  content.push({ text: 'Organ ma obowiązek podjąć wszelkie czynności niezbędne do dokładnego wyjaśnienia stanu faktycznego oraz wyczerpująco zebrać i rozpatrzyć cały materiał dowodowy (art. 7 i art. 77 § 1 k.p.a.), a uzasadnienie decyzji powinno wskazywać fakty uznane za udowodnione i dowody, na których organ się oparł (art. 107 § 3 k.p.a.). Mając powyższe na uwadze, wnoszę jak na wstępie.', margin: [0, 6, 0, 30] });
  content.push({ columns: [{ width: '*', text: '' }, { width: 220, stack: [{ text: '..............................................................', alignment: 'center' }, { text: d.signer === 'self' ? '(czytelny podpis)' : `(czytelny podpis – ${d.repName})`, alignment: 'center', fontSize: 9 }] }] });
  if (d.attachments.length) {
    content.push({ unbreakable: true, margin: [0, 24, 0, 0], stack: [{ text: 'Załączniki:', bold: true, margin: [0, 0, 0, 4] }, { ol: d.attachments, fontSize: 10 }] });
  }
  return {
    pageSize: 'A4', pageMargins: [56, 50, 56, 56], info: { title: 'Wniosek o ponowne rozpatrzenie sprawy – WZON' },
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.2 },
    styles: { title: { fontSize: 14, bold: true, alignment: 'center' }, h2: { fontSize: 12, bold: true, margin: [0, 6, 0, 6] }, th: { bold: true, fillColor: '#eeeeee' } },
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'center', fontSize: 8, color: '#666666', margin: [0, 20, 0, 0] }),
    content
  };
}

function buildDiaryDoc() {
  const name = val('cName').slice(0, 120);
  const legend = {
    table: { widths: ['auto', '*'], body: [
      [{ text: 'Kod', style: 'th' }, { text: 'Rodzaj wsparcia (wpisz w kolumnie „Rodzaj”)', style: 'th' }],
      ['T', 'Towarzyszące – nadzór, obecność, przypominanie, asekuracja'],
      ['C', 'Częściowe – pomoc fizyczna, wspólne wykonanie czynności'],
      ['P', 'Pełne – opiekun wykonuje czynność za osobę (wyręczenie)'],
      ['S', 'Szczególne – j.w. + sprzęt podtrzymujący funkcje organizmu lub interwencja przy zachowaniach niebezpiecznych, agresywnych, oporujących']
    ] }, layout: 'lightHorizontalLines', fontSize: 9, margin: [0, 6, 0, 6]
  };
  const actList = { columns: [0, 1].map(col => ({ fontSize: 8, stack: ACTIVITIES.slice(col * 16, col * 16 + 16).map((a, k) => `${col * 16 + k + 1}. ${a}`) })), columnGap: 16, margin: [0, 4, 0, 0] };
  const content = [
    { text: 'DZIENNICZEK OPIEKI OSOBY NIESAMODZIELNEJ', style: 'title' },
    { text: `Osoba wymagająca wsparcia: ${name || '.................................................'}     Opiekun: .................................................     Okres: od .............. do ..............`, margin: [0, 8, 0, 4] },
    { text: 'Zapisuj na bieżąco każdą sytuację, w której potrzebna była pomoc – także próby nieudane i sytuacje nocne. Wpisuj numer czynności według listy WZON (32 czynności poniżej). Dzienniczek prowadzony przez kilka tygodni jest cennym dowodem częstotliwości wsparcia (czasami / często / bardzo często / zawsze).', fontSize: 9 },
    legend,
    { text: 'Lista 32 czynności ocenianych przez WZON', bold: true, fontSize: 10, margin: [0, 4, 0, 0] },
    actList
  ];
  const head = ['Data', 'Godz.', 'Nr czynn.', 'Rodzaj (T/C/P/S)', 'Co dokładnie zrobił opiekun', 'Czas (min)', 'Zachowania trudne / zdarzenia', 'Podpis'].map(t => ({ text: t, style: 'th' }));
  for (let day = 1; day <= 7; day++) {
    const body = [head];
    for (let r = 0; r < 13; r++) body.push(['', '', '', '', '', '', '', '']);
    content.push({ text: `Dzień ${day} – data: ....................`, bold: true, pageBreak: 'before', margin: [0, 0, 0, 6] });
    content.push({ table: { headerRows: 1, widths: [52, 36, 40, 52, '*', 40, 150, 60], heights: (row) => row === 0 ? 'auto' : 26, body }, fontSize: 8 });
  }
  const sumBody = [[{ text: 'Nr', style: 'th' }, { text: 'Czynność', style: 'th' }, { text: 'Ile razy potrzebne było wsparcie', style: 'th' }, { text: 'Ile było prób / sytuacji', style: 'th' }, { text: 'Najczęstszy rodzaj (T/C/P/S)', style: 'th' }, { text: 'Uwagi', style: 'th' }]];
  ACTIVITIES.forEach((a, i) => sumBody.push([String(i + 1), a, '', '', '', '']));
  content.push({ text: 'Podsumowanie tygodnia', style: 'title', pageBreak: 'before' });
  content.push({ table: { headerRows: 1, widths: [20, 210, 90, 90, 80, '*'], body: sumBody }, fontSize: 7.5, margin: [0, 6, 0, 0] });
  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [30, 30, 30, 36], info: { title: 'Dzienniczek opieki osoby niesamodzielnej' },
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: { title: { fontSize: 14, bold: true, alignment: 'center' }, th: { bold: true, fillColor: '#eeeeee', fontSize: 8 } },
    footer: (page, pages) => ({ text: `Dzienniczek opieki – strona ${page} / ${pages}`, alignment: 'center', fontSize: 7, color: '#666666' }),
    content
  };
}

async function downloadAppeal() {
  const d = collectAppeal();
  if (validateAppeal(d).length) return; // podwójna kontrola przed utworzeniem dokumentu
  try {
    setPdfStatus('Przygotowuję PDF…');
    await ensurePdfMake();
    window.pdfMake.createPdf(buildAppealDoc(d)).download('Wniosek-o-ponowne-rozpatrzenie-WZON.pdf');
    setPdfStatus('Gotowe – sprawdź pobrane pliki. Wydrukuj, przeczytaj i podpisz wniosek.');
  } catch (e) {
    setPdfStatus('Nie udało się utworzyć PDF. Odśwież stronę i spróbuj ponownie.');
  }
}
async function downloadDiary() {
  try {
    setPdfStatus('Przygotowuję dzienniczek…');
    await ensurePdfMake();
    window.pdfMake.createPdf(buildDiaryDoc()).download('Dzienniczek-opieki.pdf');
    setPdfStatus('Dzienniczek gotowy – wydrukuj tyle kopii, ile tygodni chcesz dokumentować.');
  } catch (e) {
    setPdfStatus('Nie udało się utworzyć PDF. Odśwież stronę i spróbuj ponownie.');
  }
}

/* ================================================================
   MODAL WSPARCIA I BANER PARTNERSKI
   (wszystkie wartości z CONFIG przechodzą walidację + escapowanie)
   ================================================================ */
function hasPayment() { return !!(SAFE.paymentLink || SAFE.buyCoffeeUrl || SAFE.blikPhone); }
function renderSupportOptions() {
  const o = [];
  if (SAFE.paymentLink) o.push(`<a href="${escHtml(SAFE.paymentLink)}" target="_blank" rel="noopener noreferrer" class="block text-center px-4 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-black">Zapłać BLIK-iem lub kartą</a>`);
  if (SAFE.buyCoffeeUrl) o.push(`<a href="${escHtml(SAFE.buyCoffeeUrl)}" target="_blank" rel="noopener noreferrer" class="block text-center px-4 py-3 rounded-xl bg-amber-400 text-slate-950 font-bold hover:bg-amber-300">Postaw kawę na BuyCoffee.to</a>`);
  if (SAFE.blikPhone) o.push(`<div class="p-3 rounded-xl bg-slate-100 text-sm"><p class="font-bold">BLIK na telefon</p><p>Numer: <strong class="tabular-nums">${escHtml(SAFE.blikPhone)}</strong>${SAFE.blikRecipient ? ' · odbiorca: ' + escHtml(SAFE.blikRecipient) : ''}</p><p>Tytuł: „Kalkulator WZON”</p></div>`);
  document.getElementById('supOptions').innerHTML = o.join('');
  document.getElementById('supAmount').textContent = SAFE.suggestedAmount;
  document.getElementById('supHost').textContent = SAFE.siteHost || 'oficjalna strona serwisu';
  document.getElementById('supFree').classList.toggle('hidden', !SAFE.allowFreeDownload);
}
function renderPartner() {
  const p = SAFE.partner, el = document.getElementById('partnerBanner');
  if (p.name && (p.url || p.phone)) {
    el.innerHTML = `<p class="text-xs uppercase font-bold opacity-80">Reklama · partner serwisu</p>
      <h2 class="mt-1 text-xl md:text-2xl font-bold">Zaniżona punktacja? Skonsultuj odwołanie z prawnikiem</h2>
      <p class="mt-2 opacity-95">${escHtml(p.name)}${p.pitch ? ' – ' + escHtml(p.pitch) : ''}</p>
      <div class="mt-4 flex flex-wrap gap-3">
        ${p.url ? `<a href="${escHtml(p.url)}" target="_blank" rel="noopener sponsored" class="px-5 py-3 rounded-xl bg-white text-indigo-900 font-bold hover:bg-indigo-50">Umów konsultację</a>` : ''}
        ${p.phone ? `<a href="tel:${escHtml(p.phone.replace(/\s/g, ''))}" class="px-5 py-3 rounded-xl ring-2 ring-white font-bold hover:bg-white/10">Zadzwoń: ${escHtml(p.phone)}</a>` : ''}
      </div>
      <p class="mt-3 text-xs opacity-80">Kliknięcie nie przekazuje kancelarii żadnych danych z kalkulatora.</p>`;
  } else {
    el.innerHTML = `<p class="text-xs uppercase font-bold opacity-80">Pomoc prawna</p>
      <h2 class="mt-1 text-xl md:text-2xl font-bold">Sprawa skomplikowana? Skorzystaj z pomocy prawnika</h2>
      <p class="mt-2 opacity-95">Odwołanie od decyzji WZON możesz napisać samodzielnie, ale przy sprawie sądowej warto skonsultować się z prawnikiem. Bezpłatnie pomogą punkty nieodpłatnej pomocy prawnej.</p>
      <div class="mt-4 flex flex-wrap gap-3">
        <a href="https://np.ms.gov.pl/" target="_blank" rel="noopener" class="px-5 py-3 rounded-xl bg-white text-indigo-900 font-bold hover:bg-indigo-50">Znajdź bezpłatny punkt</a>
        ${SAFE.contactEmail ? `<a href="mailto:${escHtml(SAFE.contactEmail)}?subject=${encodeURIComponent('Współpraca – kancelaria (Kalkulator WZON)')}" class="px-5 py-3 rounded-xl ring-2 ring-white font-bold hover:bg-white/10">Jesteś kancelarią? Zostań partnerem</a>` : ''}
      </div>`;
  }
  if (SAFE.contactEmail) document.getElementById('footerContact').innerHTML = `Kontakt: <a class="underline" href="mailto:${escHtml(SAFE.contactEmail)}">${escHtml(SAFE.contactEmail)}</a>`;
}

/* ================================================================
   GŁÓWNA AKTUALIZACJA
   ================================================================ */
function updateAll() {
  const dSc = scoreOf(decMilli()), mSc = scoreOf(mineMilli());
  updateRowsUI(dSc, mSc);
  renderResults(dSc, mSc);
  renderRanking(dSc);
  renderPotential(dSc, mSc);
  renderB(dSc, mSc);
  const pts = document.getElementById('cDecisionPts');
  if (pts.dataset.auto !== 'off' && state.mode === 'audit' && state.dec.some(c => c !== '')) pts.value = dSc.points;
  renderClaimsForm();
  renderDeadlines(dSc);
  safeSave();
}

const DEMO = {
  // Osoba leżąca – decyzja 89 pkt (suma 88,470); 4 czynności faktycznie wymagają wsparcia pełnego zamiast częściowego
  dec: ['P-A', 'C-A', 'P-A', 'C-A', 'P-A', 'T-C', 'C-D', 'T-D', 'P-C', 'P-C', 'P-C', 'P-A', 'C-A', 'C-A', 'C-A', 'C-A',
        'C-A', 'C-A', 'C-A', 'P-C', 'P-C', 'C-C', '0', '0', 'T-D', 'P-A', 'P-A', 'P-A', 'C-A', 'P-C', 'P-A', 'P-C'],
  mine: { 12: 'P-A', 15: 'P-A', 16: 'P-A', 17: 'P-A' }
};

/* ================================================================
   OCHRONA PRZED OSADZANIEM STRONY W RAMCE (clickjacking)
   Inna witryna mogłaby wyświetlić kalkulator w ramce i nałożyć
   fałszywe dane do płatności. W ramce nie pokazujemy aplikacji.
   ================================================================ */
function isFramed() {
  try { return window.top !== window.self; } catch (e) { return true; }
}
function blockFraming() {
  const url = location.href.split('#')[0];
  document.body.textContent = '';
  const box = document.createElement('div');
  box.className = 'max-w-xl mx-auto p-6 m-6 rounded-2xl bg-white ring-1 ring-slate-300';
  const p = document.createElement('p');
  p.className = 'font-semibold';
  p.textContent = 'Ta strona została otwarta wewnątrz innej witryny. Ze względów bezpieczeństwa otwórz ją bezpośrednio:';
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.className = 'mt-3 inline-block underline text-teal-800 font-bold';
  a.textContent = 'Otwórz Kalkulator Punktów WZON w nowej karcie';
  box.append(p, a);
  document.body.append(box);
}

function wireClearButton() {
  document.getElementById('btnClearAll').addEventListener('click', () => {
    if (!confirm('Usunąć wszystkie wpisane dane z tej przeglądarki?')) return;
    removeEverywhere([STORE_KEY, REMEMBER_KEY, A11Y_KEY, ...LEGACY_KEYS]);
    location.reload();
  });
}

function init() {
  if (isFramed()) { blockFraming(); return; }
  wireClearButton(); // jako pierwsze – działa nawet, gdyby dalsza część się nie powiodła
  try {
    initApp();
  } catch (e) {
    // Ostatnia linia obrony: uszkodzone dane nie mogą trwale zablokować kalkulatora
    removeEverywhere([STORE_KEY]);
    const msg = document.getElementById('fillInfo');
    if (msg) msg.textContent = 'Wystąpił błąd odczytu zapisanych danych. Zapisane dane zostały usunięte – odśwież stronę.';
  }
}

function initApp() {
  safeLoad();
  renderRates();
  buildRows();
  document.querySelectorAll('input[name="mode"]').forEach(r => { r.checked = r.value === state.mode; });
  writeB();
  const c = state.c || {};
  [...CASE_FIELDS, ...PERSONAL_FIELDS].forEach(id => { if (typeof c[id] === 'string') document.getElementById(id).value = c[id]; });
  document.getElementById('cRemember').checked = !!c.cRemember;
  if (typeof c.cAskHearing === 'boolean') document.getElementById('cAskHearing').checked = c.cAskHearing;
  if (!SIGNERS.includes(document.getElementById('cSigner').value)) document.getElementById('cSigner').value = 'self';
  document.getElementById('cRepFields').classList.toggle('hidden', val('cSigner') === 'self');
  document.getElementById('rememberDevice').checked = rememberOn();
  renderSupportOptions();
  renderPartner();

  document.getElementById('rememberDevice').addEventListener('change', e => setRemember(e.target.checked));
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => {
    state.mode = r.value === 'sim' ? 'sim' : 'audit';
    updateAll();
  }));
  document.getElementById('btnDemo').addEventListener('click', () => {
    state.mode = 'audit';
    document.querySelector('input[name="mode"][value="audit"]').checked = true;
    state.dec = DEMO.dec.slice();
    state.mine = Array(32).fill('same');
    Object.entries(DEMO.mine).forEach(([i, code]) => { state.mine[+i] = code; });
    syncSelects(); updateAll();
    if (window.matchMedia('(min-width: 1024px)').matches) document.getElementById('resultBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  document.getElementById('btnResetMine').addEventListener('click', () => { state.mine = Array(32).fill('same'); syncSelects(); updateAll(); });

  document.querySelectorAll('#opiekun input, #opiekun select').forEach(el => el.addEventListener('input', () => {
    if (el.id === 'bCareType') {
      const amt = document.getElementById('bCareAmount');
      amt.value = el.value === 'sp' ? String(SP_2026) : el.value === 'none' ? '0' : '';
      amt.placeholder = el.value === 'sp' || el.value === 'none' ? '' : 'wpisz kwotę z decyzji';
    }
    readB(); updateAll();
  }));
  document.getElementById('cDecisionPts').addEventListener('input', e => { e.target.dataset.auto = 'off'; updateAll(); });
  ['cDeliveryDate', 'cDecisionDate'].forEach(id => document.getElementById(id).addEventListener('change', updateAll));
  document.querySelectorAll('#appealForm input, #appealForm select, #appealForm textarea').forEach(el => {
    if (!el.dataset.claim) el.addEventListener('change', safeSave);
  });
  document.getElementById('appealForm').addEventListener('input', () => {
    const box = document.getElementById('cErrors');
    if (!box.classList.contains('hidden')) {
      const errs = validateAppeal(collectAppeal());
      if (!errs.length) { box.classList.add('hidden'); box.innerHTML = ''; }
      else box.innerHTML = renderErrorList(errs);
    }
  });
  document.getElementById('cSigner').addEventListener('change', e => {
    document.getElementById('cRepFields').classList.toggle('hidden', e.target.value === 'self');
    document.getElementById('cAttPoa').checked = e.target.value === 'attorney';
  });

  const modal = document.getElementById('supportModal');
  document.getElementById('appealForm').addEventListener('submit', e => {
    e.preventDefault();
    const errs = validateAppeal(collectAppeal());
    showErrors(errs);
    if (errs.length) return;
    ensurePdfMake().catch(() => {}); // wczytywanie w tle, gdy użytkownik czyta okno
    if (hasPayment() && typeof modal.showModal === 'function') modal.showModal(); else downloadAppeal();
  });
  document.getElementById('supPaid').addEventListener('click', () => { modal.close(); downloadAppeal(); });
  document.getElementById('supFree').addEventListener('click', () => { modal.close(); downloadAppeal(); });
  document.getElementById('supCancel').addEventListener('click', () => modal.close());
  document.getElementById('btnDiaryPdf').addEventListener('click', downloadDiary);

  const root = document.documentElement;
  const btnFont = document.getElementById('btnFont'), btnContrast = document.getElementById('btnContrast');
  let a11y = { big: false, hc: false };
  try {
    const ls = getStore('localStorage');
    const raw = ls ? JSON.parse(ls.getItem(A11Y_KEY) || '{}') : {};
    if (raw && typeof raw === 'object') a11y = { big: raw.big === true, hc: raw.hc === true };
  } catch (e) { /* domyślne ustawienia */ }
  function applyA11y() {
    root.classList.toggle('font-big', a11y.big); btnFont.setAttribute('aria-pressed', String(a11y.big));
    root.classList.toggle('hc', a11y.hc); btnContrast.setAttribute('aria-pressed', String(a11y.hc));
  }
  const saveA11y = () => { const ls = getStore('localStorage'); if (ls) try { ls.setItem(A11Y_KEY, JSON.stringify(a11y)); } catch (e) { /* ignorujemy */ } };
  applyA11y();
  btnFont.addEventListener('click', () => { a11y.big = !a11y.big; applyA11y(); saveA11y(); });
  btnContrast.addEventListener('click', () => { a11y.hc = !a11y.hc; applyA11y(); saveA11y(); });

  updateAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
