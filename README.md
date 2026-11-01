# Kalkulator Punktów WZON 2026 – Świadczenie Wspierające + Generator Odwołania

**🇵🇱 Polski** · [🇬🇧 English below](#english)

Aplikacja internetowa (statyczna strona w `public/` + jedna funkcja Cloudflare Pages) dla osób z niepełnosprawnościami i ich opiekunów. Bezpłatnie liczy poziom potrzeby wsparcia dokładnie według rozporządzenia, pokazuje kwotę świadczenia wspierającego z ZUS, porównanie dla opiekuna, terminy i daje szablon dzienniczka opieki. Płatny (19,99 zł, BLIK przez Stripe) jest tylko PDF „Wniosek o ponowne rozpatrzenie sprawy” do WZON.

**Prywatność:** wszystkie obliczenia i dokumenty PDF powstają wyłącznie w przeglądarce użytkownika. Dane formularza nigdy nie trafiają na serwer – funkcja `/api/verify` dostaje tylko losowy identyfikator zamówienia i identyfikator sesji Stripe. Bez cookies i analityki.

## Funkcje

| Moduł | Co robi |
|---|---|
| **A – Kalkulator i audytor decyzji** | 32 czynności → wartość każdej czynności → suma 25 najwyższych → zaokrąglenie w górę. Porównanie „decyzja WZON” vs „Twoja ocena”, kwota miesięczna i roczna, ile brakuje do następnego progu, 5 czynności z największym potencjałem korekty, minimalny zestaw korekt potrzebny do przekroczenia progu, ranking TOP 25 / 7 pomijanych. Tryb „przed komisją” do symulacji. |
| **B – Opiekun** | Porównanie: świadczenie pielęgnacyjne (3386 zł w 2026 r.) / SZO / zasiłek dla opiekuna vs świadczenie wspierające, z odpłatnością za usługi opiekuńcze MOPS i kryterium dochodowym pomocy społecznej (1010 zł / 823 zł). Ostrzeżenia: brak łączenia świadczeń, USW-1, DPS/ZOL. |
| **C – Generator** | Wniosek o ponowne rozpatrzenie sprawy (A4, PDF) z tabelą kwestionowanych czynności i uzasadnieniem, kalkulator terminu 14 dni (k.p.a., z sobotami i świętami, w tym Wigilią od 2025 r.), okno 3 miesięcy na wniosek do ZUS, dzienniczek opieki (PDF, 9 stron). |
| **Monetyzacja** | PDF wniosku o ponowne rozpatrzenie: 19,99 zł przez Stripe Payment Link (BLIK), dostęp przyznawany wyłącznie po weryfikacji płatności na serwerze (`functions/api/verify.js`). Dzienniczek opieki i wszystkie kalkulatory – bezpłatne. Baner kancelarii partnerskiej oznaczony jako reklama (bez partnera – neutralne „Miejsce dla partnera – kontakt”). |
| **SEO** | Tytuł i opis, Open Graph, `SoftwareApplication` + `FAQPage` JSON-LD, widoczne FAQ, `robots.txt`, `sitemap.xml`, `og-image.png`. |
| **Dostępność** | Większy tekst, wysoki kontrast, pełna obsługa klawiaturą, etykiety dla czytników ekranu, układ mobilny z paskiem wyniku. |

## Zasady obliczeń (zweryfikowane)

- Rozporządzenie MRiPS z 23.11.2023 r. w sprawie ustalania poziomu potrzeby wsparcia (Dz.U. 2023 poz. 2581):
  - wartość czynności = zdolność (0/1) × rodzaj wsparcia (towarzyszące 0,80 · częściowe 0,90 · pełne 0,99 · szczególne 1,00) × częstotliwość (czasami 0,50 · często 0,75 · bardzo często 0,95 · zawsze 1,00) × waga 4, zaokrąglona w górę do tysięcznych (§ 9);
  - poziom potrzeby wsparcia = suma 25 najwyższych wartości, zaokrąglona w górę do pełnego punktu (§ 11).
- Kwoty od 1.03.2026 do 28.02.2027 (renta socjalna 1978,49 zł, zaokrąglenie w górę do pełnych złotych): 70–74 pkt 792 zł · 75–79 pkt 1188 zł · 80–84 pkt 1583 zł · 85–89 pkt 2375 zł · 90–94 pkt 3562 zł · 95–100 pkt 4353 zł.
- Wniosek o ponowne rozpatrzenie: 14 dni od doręczenia. Odwołanie do sądu pracy i ubezpieczeń społecznych: miesiąc od doręczenia decyzji wydanej po ponownym rozpatrzeniu, za pośrednictwem WZON.
- ZUS: wniosek wyłącznie elektronicznie (PUE/eZUS, Emp@tia, bankowość), 3 miesiące od dnia, w którym decyzja WZON stała się ostateczna.

## Konfiguracja i uruchomienie sprzedaży

### 1. `public/assets/config.js`
Uzupełnij `siteUrl`, `seller` (imię i nazwisko / firma, adres, e-mail, NIP – trafiają do Regulaminu i Polityki prywatności), opcjonalnie `partner`, a na końcu `paymentUrl` (link `https://buy.stripe.com/…`). `price` = `19.99`, `verifyEndpoint` = `'/api/verify'`. **Nigdy nie wpisuj tam kluczy Stripe** – plik jest publiczny. Pusty `paymentUrl` = sprzedaż wyłączona (na `localhost`/`127.0.0.1` działa wtedy tryb demonstracyjny z darmowym PDF; na prawdziwej domenie nie).

### 2. Stripe Payment Link
Produkt „Wniosek o ponowne rozpatrzenie sprawy – WZON (PDF)”, cena **19,99 zł** (PLN), metoda płatności **tylko BLIK**, bez kodów rabatowych. Po płatności: *Don't show confirmation page* → przekierowanie na:

```
https://DOMAIN/?platnosc=sukces&session_id={CHECKOUT_SESSION_ID}
```

### 3. Cloudflare Pages
Workers & Pages → Create → Pages → Connect to Git → repozytorium → Framework preset *None*, **Build command: (puste)**, **Build output directory: `public`**. Katalog `functions/` jest wykrywany automatycznie (endpoint `/api/verify`).

Settings → **Variables and Secrets** (typ *Secret*, środowisko *Production*):

| Zmienna | Wartość |
|---|---|
| `STRIPE_SECRET_KEY` | `rk_live_…` – klucz **ograniczony** (Stripe → Developers → API keys → Create restricted key → *Checkout Sessions: Read*, reszta *None*). Pełny klucz `sk_…` jest odrzucany. |
| `PAYMENT_LINK_ID` | `plink_…` – identyfikator Twojego linku płatności |
| `EXPECTED_AMOUNT` | `1999` (cena w groszach) |
| `MAX_AGE_DAYS` | opcjonalnie, domyślnie `30` (ile dni można ponownie pobierać PDF) |
| `ALLOW_TEST_MODE` | **nie ustawiaj na produkcji** (`true` tylko do testów z kluczem `rk_test_…`) |

Potem Deploy → Custom domains. GitHub Pages nie uruchamia funkcji weryfikującej – tam kalkulator działa, ale sprzedaż jest zablokowana (klient nie zostanie przekierowany do płatności).

### Jak działa płatność
1. „Pobierz wniosek” → okno zamówienia z dwiema obowiązkowymi zgodami (Regulamin + żądanie dostarczenia treści cyfrowej przed upływem terminu odstąpienia, art. 38 pkt 13 ustawy o prawach konsumenta).
2. Strona pyta `/api/verify?ping=1`; jeśli serwer nie jest gotowy – komunikat „Sprzedaż chwilowo niedostępna – nie pobraliśmy żadnych środków”.
3. Formularz zapisuje się w `sessionStorage` tej karty, losowy identyfikator zamówienia w `localStorage`, przekierowanie do Stripe z `client_reference_id`.
4. Po powrocie strona weryfikuje sesję w `/api/verify` (do 3 powtórek co 2 s) i automatycznie pobiera PDF. Serwer sprawdza w Stripe: status, kwotę, walutę PLN, link płatności, `client_reference_id`, tryb live i wiek płatności.

Po każdej zmianie w `public/assets/app.js`, `config.js` lub `app.css` zmień numer `?v=` w `<head>` pliku `public/index.html`.

**Domena:** adres `https://kalkulatorwzon.pl/` występuje w `public/index.html` (canonical, og:url, og:image, JSON-LD), `public/assets/config.js`, `public/robots.txt` i `public/sitemap.xml`. Po zakupie innej domeny zamień go wszędzie.

## Struktura plików

| Plik | Rola |
|---|---|
| `public/` | **Jedyny publikowany katalog** (Cloudflare Pages: output directory) |
| `public/index.html` | Treść strony, SEO, JSON-LD, okna zamówienia / Regulaminu / Polityki prywatności |
| `public/assets/config.js` | Konfiguracja właściciela (cena, link płatności, sprzedawca, partner) – bez kluczy |
| `public/assets/app.js` | Cała logika (obliczenia, terminy, PDF, płatność) |
| `public/assets/app.css` | Skompilowany Tailwind CSS (nie edytuj ręcznie) |
| `public/assets/vendor/` | pdfmake 0.2.20 (lokalnie, z hashem SRI) |
| `public/_headers` | Nagłówki bezpieczeństwa (CSP tylko `'self'`, `frame-ancestors 'none'`) |
| `functions/api/verify.js` | Cloudflare Pages Function – weryfikacja płatności w Stripe |
| `src/styles.css` | Źródło stylów → `npm ci && npm run build:css` |
| `tests/` | `verify.test.mjs` (node --test), `e2e.test.js` (Playwright) |
| `BEZPIECZENSTWO.md` | Opis zabezpieczeń i lista kontrolna właściciela |

## Bezpieczeństwo

Jedyny kod po stronie serwera to `functions/api/verify.js` (tylko odczyt sesji Stripe kluczem ograniczonym trzymanym w sekretach Cloudflare). Strona nie łączy się z żadnym zewnętrznym serwerem (płatność to zwykłe przejście na stronę Stripe). Ścisła polityka CSP, lokalne biblioteki z SRI, blokada osadzania w ramce, walidacja danych zapisanych w przeglądarce, przechowywanie domyślnie tylko w bieżącej karcie, PESEL nie jest zapisywany na stałe (tylko tymczasowo w bieżącej karcie na czas płatności). Szczegóły i **obowiązkowa lista kontrolna właściciela (2FA, domena, Stripe)**: [BEZPIECZENSTWO.md](BEZPIECZENSTWO.md).

## Testy

```
npm test
```

- `tests/verify.test.mjs` (`node --test`) – funkcja weryfikująca z atrapą API Stripe: odrzucanie klucza `sk_`, złej kwoty/waluty/linku, cudzego `client_reference_id`, płatności testowych, starszych niż 30 dni, path traversal.
- `tests/e2e.test.js` (Playwright + Chromium + `pdftotext`, `/api/verify` mockowane przez `page.route`) – kalkulator (przykład 89 → 90 pkt), terminy, darmowy dzienniczek, tryb demo tylko lokalnie, `?platnosc=sukces` i podrobiony `localStorage` nie odblokowują, przepływ płatności z przekierowaniem i powrotem (formularz przetrwał, PDF pobrany automatycznie, polskie znaki), udostępniony link nie działa w innej przeglądarce, brak przekierowania do płatności przy niedziałającym serwerze, brak naruszeń CSP, układ mobilny 375 px.

## Zastrzeżenie

Serwis niezależny, niepowiązany z WZON, ZUS ani administracją rządową. Kalkulator ma charakter informacyjny i nie stanowi porady prawnej. Stan prawny: październik 2026 r. Kwoty należy zaktualizować po waloryzacji renty socjalnej 1 marca 2027 r. (stałe `RENTA_GR`, `RENTA_PREV_GR`, `SP_2026` w `public/assets/app.js`).

---

<a id="english"></a>

## 🇬🇧 English

**WZON Points Calculator 2026 – Support Benefit (Świadczenie Wspierające) + Appeal Generator**

A web app (static site in `public/` + one Cloudflare Pages Function, in Polish) for people with disabilities in Poland and their caregivers. It reproduces the official scoring of the “level of need for support” (poziom potrzeby wsparcia) issued by the Provincial Disability Assessment Teams (WZON), shows the resulting monthly ZUS support benefit, and generates a formal request for reconsideration (wniosek o ponowne rozpatrzenie sprawy) as a PDF.

**Private:** every calculation and PDF is produced in the user’s browser; form data never reaches a server. The calculators and the care-diary template are free; only the reconsideration-request PDF is paid (19.99 PLN, BLIK via Stripe, verified server-side).

### Features
- **Module A – calculator & decision auditor:** 32 activities, per-activity score = ability (0/1) × support type (0.80/0.90/0.99/1.00) × frequency (0.50/0.75/0.95/1.00) × weight 4, rounded up to 0.001; total = sum of the 25 highest scores rounded **up** to a whole point (Regulation Dz.U. 2023 item 2581, §§ 9 and 11). Compares the WZON decision with the user’s own assessment, shows the money at stake, the distance to the next payout threshold, the top-5 activities with the highest correction potential and the minimum set of corrections needed to cross the threshold.
- **Module B – caregiver comparison:** nursing benefit (3,386 PLN in 2026) vs support benefit, including municipal care-service fees and the social-assistance income criterion.
- **Module C – generator:** A4 PDF reconsideration request, 14-day deadline calculator (Polish Administrative Procedure Code, weekends and public holidays incl. Christmas Eve from 2025), 3-month ZUS filing window, printable care diary.
- **Monetisation:** reconsideration-request PDF for 19.99 PLN via a Stripe Payment Link (BLIK only); access is granted only after `functions/api/verify.js` confirms the Checkout Session with Stripe (amount, currency, payment link, client_reference_id, livemode, age). Partner banner labelled as an advertisement, or a neutral “partner slot” box when none is configured.
- **SEO & accessibility:** JSON-LD (`SoftwareApplication`, `FAQPage`), Open Graph image, sitemap, larger-text and high-contrast modes, keyboard and screen-reader support, mobile layout.

### Payouts 1 March 2026 – 28 February 2027 (social pension 1,978.49 PLN)
70–74 pts: 792 PLN · 75–79: 1,188 · 80–84: 1,583 · 85–89: 2,375 · 90–94: 3,562 · 95–100: 4,353 PLN per month (tax-free, not means-tested).

### Configure & deploy
Fill in `public/assets/config.js` (seller data, `paymentUrl`, optional partner; never any keys). Cloudflare Pages: build command empty, **output directory `public`**, secrets `STRIPE_SECRET_KEY=rk_live_…` (restricted key, *Checkout Sessions: Read*), `PAYMENT_LINK_ID=plink_…`, `EXPECTED_AMOUNT=1999`. Stripe Payment Link: BLIK only, redirect to `https://DOMAIN/?platnosc=sukces&session_id={CHECKOUT_SESSION_ID}`. Tests: `npm test`.

### Tech & security
HTML5, Tailwind CSS 4.1.18 (compiled to `assets/app.css`), vanilla JavaScript (`assets/app.js`), pdfmake 0.2.20 (self-hosted in `assets/vendor/`, SRI-pinned, lazy-loaded, Roboto font with full Polish character support). No third-party requests, strict Content-Security-Policy (`'self'` only), anti-framing, validated browser storage (session-only by default, PESEL never stored permanently), `_headers` for Cloudflare Pages / Netlify. See [BEZPIECZENSTWO.md](BEZPIECZENSTWO.md) for the owner security checklist.

### Disclaimer
Independent project, not affiliated with WZON, ZUS or the Polish government. Informational tool, not legal advice. Legal status: October 2026.
