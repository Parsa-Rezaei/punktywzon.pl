# Bezpieczeństwo – Kalkulator Punktów WZON

## Zabezpieczenia w kodzie

| Zagrożenie | Zabezpieczenie |
|---|---|
| Wstrzyknięcie skryptu (XSS) przez pola formularza | Wszystkie teksty użytkownika są escapowane; ścisła polityka **Content-Security-Policy** (`script-src 'self'`, brak `unsafe-inline` i `unsafe-eval`) blokuje każdy wstrzyknięty skrypt, nawet gdyby escapowanie zawiodło. |
| Podmiana bibliotek na serwerze CDN (atak na łańcuch dostaw) | Brak zewnętrznych serwerów. Tailwind jest skompilowany do `assets/app.css`, a pdfmake leży w `assets/vendor/` z hashem **SRI** (przeglądarka odrzuci zmieniony plik). |
| Osadzenie strony w ramce i nałożenie fałszywych danych do płatności (clickjacking) | Aplikacja nie uruchamia się w ramce innej strony. Na Cloudflare Pages / Netlify dodatkowo nagłówki `frame-ancestors 'none'` i `X-Frame-Options: DENY` (plik `_headers`). |
| Złośliwe lub uszkodzone dane w pamięci przeglądarki | Wczytywane dane są walidowane (tylko znane pola i dozwolone wartości, limity długości); błąd odczytu czyści dane zamiast blokować kalkulator. |
| Dane o zdrowiu na wspólnym komputerze | Domyślnie dane trzymane są tylko w bieżącej karcie (`sessionStorage`) i znikają po jej zamknięciu. Zapis na stałe tylko po zaznaczeniu opcji. **PESEL nie jest zapisywany nigdy.** |
| Niebezpieczne linki w konfiguracji (`javascript:`, `http:`) | Linki w `CONFIG` są akceptowane wyłącznie z `https://`; e-mail i telefon są sprawdzane wzorcem. |
| Wycieki danych do firm trzecich (RODO) | Strona nie łączy się z żadnym zewnętrznym serwerem, nie używa cookies ani analityki. |
| Oszustwa „na BLIK” | Okno płatności informuje, że serwis nigdy nie prosi o kod BLIK, hasło ani dane karty. |
| Przechwycenie ruchu | `upgrade-insecure-requests`; na Cloudflare Pages dodatkowo HSTS. Włącz „Enforce HTTPS” w GitHub Pages. |

Strona nie ma serwera, bazy danych, logowania ani kluczy API – nie ma czego wykraść po stronie serwisu. Największe ryzyko finansowe to **przejęcie Twoich kont** (GitHub, e-mail, domena, płatności). Poniższa lista jest najważniejsza.

## Lista kontrolna właściciela (zrób przed publikacją)

1. **E-mail** (konto, na które przychodzą resety haseł): unikalne hasło + weryfikacja dwuetapowa (najlepiej klucz bezpieczeństwa / passkey).
2. **GitHub**: Settings → Password and authentication → włącz 2FA (passkey lub aplikacja). Zapisz kody odzyskiwania offline.
3. **GitHub – ochrona gałęzi `main`**: Settings → Branches → Add branch ruleset → zablokuj usuwanie i force-push.
4. **GitHub – prywatność e-maila**: Settings → Emails → zaznacz „Keep my email addresses private” i „Block command line pushes that expose my email”.
5. **GitHub – dostęp aplikacji**: Settings → Applications oraz Settings → Developer settings → Personal access tokens – usuń wszystko, czego nie używasz.
6. **Domena**: u rejestratora włącz 2FA, automatyczne odnowienie, blokadę transferu (domain lock) i – jeśli dostępny – DNSSEC. Wygasła domena może zostać przejęta.
7. **GitHub Pages**: zweryfikuj domenę (Settings konta → Pages → Add a domain), żeby nikt inny nie podpiął jej do swojej strony; zaznacz **Enforce HTTPS**.
8. **BuyCoffee.to / bramka płatności**: unikalne hasło + 2FA; wypłaty tylko na Twoje konto bankowe.
9. **Nie publikuj prywatnego numeru telefonu** do BLIK – używaj strony płatności (BuyCoffee.to lub link płatności).
10. **Nigdy nie wpisuj haseł, tokenów ani kluczy API** do plików w repozytorium – repozytorium jest publiczne.
11. **Phishing**: GitHub, rejestrator i bramka płatności nie proszą o hasło przez e-mail. Loguj się zawsze, wpisując adres ręcznie.
12. **Kopie stron (podróbki)**: jeśli ktoś skopiuje serwis i podmieni dane do płatności, zgłoś to dostawcy hostingu tej kopii (np. formularz DMCA / abuse) – kod i treści są chronione prawem autorskim.

## Zalecany hosting z pełnymi nagłówkami bezpieczeństwa

GitHub Pages nie pozwala ustawić nagłówków HTTP. Kod chroni się sam (CSP w `<meta>`, blokada ramek w skrypcie), ale najmocniejsza ochrona to **Cloudflare Pages** (bezpłatnie, także z prywatnego repozytorium), które odczytuje plik `_headers` (CSP z `frame-ancestors`, HSTS, `X-Content-Type-Options`, `Permissions-Policy`).

## Aktualizacja wyglądu (Tailwind)

Po zmianie klas CSS w `index.html` lub `assets/app.js`:

```
npm ci
npm run build:css
```

`npm ci` instaluje dokładnie wersje z `package-lock.json`. Zależności są potrzebne tylko do zbudowania CSS – nie trafiają na stronę.

## Zgłaszanie problemów bezpieczeństwa

Napisz na adres kontaktowy podany w stopce strony. Nie publikuj szczegółów podatności przed jej naprawą.
