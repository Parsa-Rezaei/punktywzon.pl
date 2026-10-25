# Kalkulator Punktów WZON 2026 – Świadczenie Wspierające + Generator Odwołania

**🇵🇱 Polski** · [🇬🇧 English below](#english)

Bezpłatna, jednoplikowa aplikacja internetowa (`index.html`) dla osób z niepełnosprawnościami i ich opiekunów. Liczy poziom potrzeby wsparcia dokładnie według rozporządzenia, pokazuje kwotę świadczenia wspierającego z ZUS i generuje wniosek o ponowne rozpatrzenie sprawy przez WZON w PDF.

**100% prywatności:** wszystkie obliczenia i dokumenty PDF powstają wyłącznie w przeglądarce użytkownika. Strona nie ma serwera, bazy danych, cookies ani analityki.

## Funkcje

| Moduł | Co robi |
|---|---|
| **A – Kalkulator i audytor decyzji** | 32 czynności → wartość każdej czynności → suma 25 najwyższych → zaokrąglenie w górę. Porównanie „decyzja WZON” vs „Twoja ocena”, kwota miesięczna i roczna, ile brakuje do następnego progu, 5 czynności z największym potencjałem korekty, minimalny zestaw korekt potrzebny do przekroczenia progu, ranking TOP 25 / 7 pomijanych. Tryb „przed komisją” do symulacji. |
| **B – Opiekun** | Porównanie: świadczenie pielęgnacyjne (3386 zł w 2026 r.) / SZO / zasiłek dla opiekuna vs świadczenie wspierające, z odpłatnością za usługi opiekuńcze MOPS i kryterium dochodowym pomocy społecznej (1010 zł / 823 zł). Ostrzeżenia: brak łączenia świadczeń, USW-1, DPS/ZOL. |
| **C – Generator** | Wniosek o ponowne rozpatrzenie sprawy (A4, PDF) z tabelą kwestionowanych czynności i uzasadnieniem, kalkulator terminu 14 dni (k.p.a., z sobotami i świętami, w tym Wigilią od 2025 r.), okno 3 miesięcy na wniosek do ZUS, dzienniczek opieki (PDF, 9 stron). |
| **Monetyzacja** | Okno „wesprzyj” (BuyCoffee.to / BLIK na telefon / link płatności) przed pobraniem wniosku, baner kancelarii partnerskiej oznaczony jako reklama. |
| **SEO** | Tytuł i opis, Open Graph, `SoftwareApplication` + `FAQPage` JSON-LD, widoczne FAQ, `robots.txt`, `sitemap.xml`, `og-image.png`. |
| **Dostępność** | Większy tekst, wysoki kontrast, pełna obsługa klawiaturą, etykiety dla czytników ekranu, układ mobilny z paskiem wyniku. |

## Zasady obliczeń (zweryfikowane)

- Rozporządzenie MRiPS z 23.11.2023 r. w sprawie ustalania poziomu potrzeby wsparcia (Dz.U. 2023 poz. 2581):
  - wartość czynności = zdolność (0/1) × rodzaj wsparcia (towarzyszące 0,80 · częściowe 0,90 · pełne 0,99 · szczególne 1,00) × częstotliwość (czasami 0,50 · często 0,75 · bardzo często 0,95 · zawsze 1,00) × waga 4, zaokrąglona w górę do tysięcznych (§ 9);
  - poziom potrzeby wsparcia = suma 25 najwyższych wartości, zaokrąglona w górę do pełnego punktu (§ 11).
- Kwoty od 1.03.2026 do 28.02.2027 (renta socjalna 1978,49 zł, zaokrąglenie w górę do pełnych złotych): 70–74 pkt 792 zł · 75–79 pkt 1188 zł · 80–84 pkt 1583 zł · 85–89 pkt 2375 zł · 90–94 pkt 3562 zł · 95–100 pkt 4353 zł.
- Wniosek o ponowne rozpatrzenie: 14 dni od doręczenia. Odwołanie do sądu pracy i ubezpieczeń społecznych: miesiąc od doręczenia decyzji wydanej po ponownym rozpatrzeniu, za pośrednictwem WZON.
- ZUS: wniosek wyłącznie elektronicznie (PUE/eZUS, Emp@tia, bankowość), 3 miesiące od dnia, w którym decyzja WZON stała się ostateczna.

## Konfiguracja przed publikacją

Otwórz `assets/app.js`, znajdź blok `const CONFIG = Object.freeze({` i uzupełnij (linki tylko `https://`, inne są ignorowane; nie wpisuj tam haseł ani kluczy):

```js
const CONFIG = Object.freeze({
  siteUrl: 'https://kalkulatorwzon.pl/',
  contactEmail: 'kontakt@twojadomena.pl',
  buyCoffeeUrl: 'https://buycoffee.to/twoja-nazwa',
  blikPhone: '',                // zalecane: puste (numer telefonu byłby publiczny)
  blikRecipient: '',
  paymentLink: '',              // opcjonalnie: Stripe Payment Link / Przelewy24 z BLIK
  suggestedAmount: '19,99 zł',
  allowFreeDownload: true,
  partner: Object.freeze({ name: '', url: '', phone: '', pitch: '' })
});
```

Po każdej zmianie w `assets/app.js` lub `assets/app.css` zmień numer `?v=` w dwóch linijkach w `<head>` pliku `index.html` (np. `?v=20261101`), aby przeglądarki pobrały nową wersję.

Jeżeli żadna metoda płatności nie jest uzupełniona, PDF pobiera się od razu, bez okna wsparcia.

**Domena:** adres `https://kalkulatorwzon.pl/` występuje w `index.html` (canonical, og:url, og:image, JSON-LD), `assets/app.js` (`CONFIG.siteUrl`), `robots.txt` i `sitemap.xml`. Po zakupie innej domeny zamień go wszędzie (Szukaj → Zamień wszystko).

## Struktura plików

| Plik | Rola |
|---|---|
| `index.html` | Treść strony, SEO, JSON-LD, polityka bezpieczeństwa (CSP) |
| `assets/app.js` | Cała logika (obliczenia, terminy, PDF, konfiguracja `CONFIG`) |
| `assets/app.css` | Skompilowany Tailwind CSS (nie edytuj ręcznie) |
| `assets/vendor/` | pdfmake 0.2.20 (lokalnie, z hashem SRI) |
| `src/styles.css` | Źródło stylów → `npm run build:css` |
| `_headers` | Nagłówki bezpieczeństwa dla Cloudflare Pages / Netlify |
| `BEZPIECZENSTWO.md` | Opis zabezpieczeń i lista kontrolna właściciela |

## Publikacja

**Zalecane: Cloudflare Pages** (bezpłatnie, działa też z prywatnym repozytorium, odczytuje `_headers` z pełnymi nagłówkami bezpieczeństwa):
1. dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → wybierz repozytorium.
2. Framework preset: *None*, Build command: *(puste)*, Build output directory: `/`.
3. Deploy → Custom domains → dodaj swoją domenę.

**Alternatywa: GitHub Pages** (wymaga publicznego repozytorium w darmowym planie):
1. Repozytorium → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → **Save**.
2. Własna domena: w polu **Custom domain** wpisz domenę, ustaw rekordy DNS według [dokumentacji GitHub Pages](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site), zaznacz **Enforce HTTPS** i zweryfikuj domenę.

## Bezpieczeństwo

Strona nie ma serwera, bazy danych ani kluczy API i nie łączy się z żadnym zewnętrznym serwerem. Ścisła polityka CSP, lokalne biblioteki z SRI, blokada osadzania w ramce, walidacja danych zapisanych w przeglądarce, przechowywanie domyślnie tylko w bieżącej karcie, PESEL nigdy nie zapisywany. Szczegóły i **obowiązkowa lista kontrolna właściciela (2FA, domena, płatności)**: [BEZPIECZENSTWO.md](BEZPIECZENSTWO.md).

## Testy

Aplikację przetestowano automatycznie w Chromium (Playwright): kwoty, przykład 89 → 90 pkt (suma 88,470 → 89,910), terminy k.p.a. ze świętami, porównanie opiekuna, generowanie obu PDF z polskimi znakami, zapis w przeglądarce, układ mobilny 375 px bez przewijania w poziomie.

## Zastrzeżenie

Serwis niezależny, niepowiązany z WZON, ZUS ani administracją rządową. Kalkulator ma charakter informacyjny i nie stanowi porady prawnej. Stan prawny: październik 2026 r. Kwoty należy zaktualizować po waloryzacji renty socjalnej 1 marca 2027 r. (stałe `RENTA_GR`, `RENTA_PREV_GR`, `SP_2026` w `index.html`).

---

<a id="english"></a>

## 🇬🇧 English

**WZON Points Calculator 2026 – Support Benefit (Świadczenie Wspierające) + Appeal Generator**

A free, single-file web app (`index.html`, in Polish) for people with disabilities in Poland and their caregivers. It reproduces the official scoring of the “level of need for support” (poziom potrzeby wsparcia) issued by the Provincial Disability Assessment Teams (WZON), shows the resulting monthly ZUS support benefit, and generates a formal request for reconsideration (wniosek o ponowne rozpatrzenie sprawy) as a PDF.

**100% private:** every calculation and PDF is produced in the user’s browser. No server, no database, no cookies, no analytics.

### Features
- **Module A – calculator & decision auditor:** 32 activities, per-activity score = ability (0/1) × support type (0.80/0.90/0.99/1.00) × frequency (0.50/0.75/0.95/1.00) × weight 4, rounded up to 0.001; total = sum of the 25 highest scores rounded **up** to a whole point (Regulation Dz.U. 2023 item 2581, §§ 9 and 11). Compares the WZON decision with the user’s own assessment, shows the money at stake, the distance to the next payout threshold, the top-5 activities with the highest correction potential and the minimum set of corrections needed to cross the threshold.
- **Module B – caregiver comparison:** nursing benefit (3,386 PLN in 2026) vs support benefit, including municipal care-service fees and the social-assistance income criterion.
- **Module C – generator:** A4 PDF reconsideration request, 14-day deadline calculator (Polish Administrative Procedure Code, weekends and public holidays incl. Christmas Eve from 2025), 3-month ZUS filing window, printable care diary.
- **Monetisation:** optional “support us” modal (BuyCoffee.to / BLIK phone transfer / payment link) before the appeal download; partner law-firm banner labelled as an advertisement.
- **SEO & accessibility:** JSON-LD (`SoftwareApplication`, `FAQPage`), Open Graph image, sitemap, larger-text and high-contrast modes, keyboard and screen-reader support, mobile layout.

### Payouts 1 March 2026 – 28 February 2027 (social pension 1,978.49 PLN)
70–74 pts: 792 PLN · 75–79: 1,188 · 80–84: 1,583 · 85–89: 2,375 · 90–94: 3,562 · 95–100: 4,353 PLN per month (tax-free, not means-tested).

### Configure & deploy
Fill in the `CONFIG` object at the top of the script in `index.html` (contact e-mail, BuyCoffee.to URL, BLIK phone number, optional payment link, partner law firm), replace `https://kalkulatorwzon.pl/` with your domain in `index.html`, `robots.txt` and `sitemap.xml`, then enable **GitHub Pages** (Settings → Pages → branch `main`, root).

### Tech & security
HTML5, Tailwind CSS 4.1.18 (compiled to `assets/app.css`), vanilla JavaScript (`assets/app.js`), pdfmake 0.2.20 (self-hosted in `assets/vendor/`, SRI-pinned, lazy-loaded, Roboto font with full Polish character support). No third-party requests, strict Content-Security-Policy (`script-src 'self'`), anti-framing, validated browser storage (session-only by default, PESEL never stored), `_headers` for Cloudflare Pages / Netlify. See [BEZPIECZENSTWO.md](BEZPIECZENSTWO.md) for the owner security checklist.

### Disclaimer
Independent project, not affiliated with WZON, ZUS or the Polish government. Informational tool, not legal advice. Legal status: October 2026.
