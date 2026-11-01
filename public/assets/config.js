/* =====================================================================
   KONFIGURACJA SERWISU – jedyny plik, który edytujesz przed startem.
   NIGDY nie wpisuj tutaj kluczy Stripe (sk_…, rk_…) ani haseł –
   ten plik jest publiczny. Klucze trzymasz wyłącznie w ustawieniach
   Cloudflare Pages (Variables and Secrets).
   Linki muszą zaczynać się od https:// (inne są ignorowane).
   ===================================================================== */
window.WZON_CONFIG = Object.freeze({
  siteName: 'Kalkulator Punktów WZON',
  siteUrl: 'https://kalkulatorwzon.pl/',

  // Cena PDF „Wniosek o ponowne rozpatrzenie” w zł – musi być równa cenie produktu w Stripe
  // i zmiennej EXPECTED_AMOUNT w Cloudflare (w groszach: 1999).
  price: 19.99,

  // Link płatności Stripe (Payment Link, tylko BLIK), np. 'https://buy.stripe.com/abc123'.
  // Pusty = sprzedaż wyłączona (na komputerze lokalnym działa tryb demonstracyjny).
  paymentUrl: '',

  // Weryfikacja płatności po stronie serwera (functions/api/verify.js na Cloudflare Pages).
  // Wymagana do sprzedaży – bez niej przycisk płatności się nie uruchomi.
  verifyEndpoint: '/api/verify',

  // Dane sprzedawcy do regulaminu, polityki prywatności i stopki.
  seller: Object.freeze({
    name: '[imię i nazwisko / firma]',
    address: '[adres]',
    email: '[e-mail kontaktowy]',
    nip: ''
  }),

  // Kancelaria partnerska (baner oznaczony jako reklama). Puste = neutralne „Miejsce dla partnera”.
  partner: Object.freeze({
    name: '',                  // np. 'Kancelaria Radcy Prawnego Jan Nowak'
    url: '',                   // np. 'https://kancelaria.pl/odwolanie-wzon'
    phone: '',                 // np. '+48 600 000 000'
    pitch: ''                  // np. 'Pierwsza konsultacja bezpłatna.'
  })
});
