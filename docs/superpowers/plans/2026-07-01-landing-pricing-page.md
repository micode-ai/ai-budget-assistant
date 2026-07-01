# Landing Pricing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, SEO-indexable `/pricing/` page (all 9 languages) to the ai-budget.pl static marketing landing, showing the real Free/Pro/Business tiers with a Monthly/Yearly CSS toggle, matching the site's existing light/orange visual language.

**Architecture:** All changes live in the single existing generator script `docs/marketing/landing/build_landing.py`, following the exact pattern already used for `about_page()`/`ABOUT`: a new `PRICING` per-language content dict, a `pricing_page(lang)` render function, new CSS appended to the existing `CSS` constant, and a new build loop wired into `build()`.

**Tech Stack:** Plain Python 3 (no dependencies beyond what's already imported: `os`, `re`, `json`, `html`, `glob`, `shutil`, `PIL`). Output is static HTML/CSS with a pure-CSS (`:checked` sibling-selector) toggle, no JavaScript.

## Global Constraints

- Static landing only — no changes to the mobile app, API, Stripe products, or the `Currency` enum (per spec "Out of scope").
- Pricing values must exactly match `PRICING` in `apps/api/src/modules/subscriptions/subscriptions.service.ts`: USD 9.99/95.88 (pro) + 19.99/191.88 (biz); EUR 8.99/86.28 + 17.99/172.68; PLN 29.99/287.88 + 59.99/575.88; RUB 499.00/4789.00 + 999.00/9589.00; UAH 199.00/1909.00 + 399.00/3829.00.
- Currency per language: en→USD, pl→PLN, de→EUR, es→EUR, fr→EUR, ru→RUB, ua→UAH, be→USD (BYN unsupported, confirmed fallback), nl→EUR.
- Visual style must match the site's existing light background / white cards / `#F58320` orange accent — NOT the dark navy/blue reference screenshot. Only the screenshot's *layout* (icon badge, tier header, big price, checkmark list, POPULAR badge, toggle, CTA button) is adopted.
- All 9 languages get real, hand-written copy — no placeholders, no machine-translation stubs.
- Tier brand names ("Free", "Pro", "Business") stay in English across all languages, matching the existing mobile i18n convention (`subscription.plans.pro.name: 'Pro'`).
- Build and verify with `python docs/marketing/landing/build_landing.py` (defaults to `LANDING_BASE=preview`, `ROBOTS=noindex,follow` — safe, does not touch the production apex build).

---

### Task 1: Currency/pricing constants + URL/label helpers

**Files:**
- Modify: `docs/marketing/landing/build_landing.py` (insert after the `about_url`/`ABOUT_LABELS` block, i.e. immediately before `ABOUT = {` around line 118)

**Interfaces:**
- Produces: `CURRENCY_PRICING: dict[str, dict]` (keys `symbol`, `pro_m`, `pro_y`, `biz_m`, `biz_y`), `LANG_CURRENCY: dict[str, str]`, `TIER_KEYS: list[str]`, `TIER_NAMES: dict[str, str]`, `tier_amounts(lang, tier) -> (float, float)`, `tier_price_display(lang, tier) -> (str, str)`, `pricing_url(lang) -> str`, `PRICING_LABELS: dict[str, str]`.
- Consumes: nothing new (uses existing `DEFAULT_LANG` global).

- [ ] **Step 1: Add the constants and helpers**

Insert this block into `docs/marketing/landing/build_landing.py`, immediately before the line `ABOUT = {` (around line 118):

```python
# Pricing (ABA landing pricing page): amounts must match PRICING in
# apps/api/src/modules/subscriptions/subscriptions.service.ts exactly.
CURRENCY_PRICING = {
    "USD": {"symbol": "$",  "pro_m": 9.99,   "pro_y": 95.88,   "biz_m": 19.99,  "biz_y": 191.88},
    "EUR": {"symbol": "€",  "pro_m": 8.99,   "pro_y": 86.28,   "biz_m": 17.99,  "biz_y": 172.68},
    "PLN": {"symbol": "zł", "pro_m": 29.99,  "pro_y": 287.88,  "biz_m": 59.99,  "biz_y": 575.88},
    "RUB": {"symbol": "₽",  "pro_m": 499.00, "pro_y": 4789.00, "biz_m": 999.00, "biz_y": 9589.00},
    "UAH": {"symbol": "₴",  "pro_m": 199.00, "pro_y": 1909.00, "biz_m": 399.00, "biz_y": 3829.00},
}
# be (Belarusian) has no BYN in CURRENCY_PRICING and no Stripe price for it,
# so it falls back to USD display (confirmed intended behavior, not a bug).
LANG_CURRENCY = {
    "en": "USD", "pl": "PLN", "de": "EUR", "es": "EUR", "fr": "EUR",
    "ru": "RUB", "ua": "UAH", "be": "USD", "nl": "EUR",
}
TIER_KEYS = ["free", "pro", "business"]
TIER_NAMES = {"free": "Free", "pro": "Pro", "business": "Business"}

def tier_amounts(lang, tier):
    """Return (monthly, yearly) float amounts in the language's display currency."""
    if tier == "free":
        return 0.0, 0.0
    cur = CURRENCY_PRICING[LANG_CURRENCY[lang]]
    prefix = "pro" if tier == "pro" else "biz"
    return cur[f"{prefix}_m"], cur[f"{prefix}_y"]

def tier_price_display(lang, tier):
    """Return (monthly, yearly) formatted price strings, e.g. ('$9.99', '$95.88')."""
    sym = CURRENCY_PRICING[LANG_CURRENCY[lang]]["symbol"]
    m, y = tier_amounts(lang, tier)
    return f"{sym}{m:.2f}", f"{sym}{y:.2f}"

def pricing_url(lang):
    return "/pricing/" if lang == "pl" else f"/{lang}/pricing/"

PRICING_LABELS = {
    "en": "Pricing", "pl": "Cennik", "de": "Preise", "es": "Precios", "fr": "Tarifs",
    "ru": "Тарифы", "ua": "Тарифи", "be": "Тарыфы", "nl": "Prijzen",
}
```

- [ ] **Step 2: Verify it imports and computes correctly**

Run:
```bash
cd "D:\Work\micode\ai-budget-assistant\docs\marketing\landing" && python -c "
import build_landing as b
assert b.tier_price_display('en', 'pro') == ('\$9.99', '\$95.88'), b.tier_price_display('en','pro')
assert b.tier_price_display('pl', 'business') == ('zł59.99', 'zł575.88'), b.tier_price_display('pl','business')
assert b.tier_price_display('ru', 'pro') == ('₽499.00', '₽4789.00'), b.tier_price_display('ru','pro')
assert b.tier_price_display('be', 'free') == ('\$0.00', '\$0.00'), b.tier_price_display('be','free')
assert b.pricing_url('pl') == '/pricing/'
assert b.pricing_url('de') == '/de/pricing/'
print('OK')
"
```
Expected: `OK` printed, no `AssertionError`, no `KeyError` (the script executes its whole module top-level, including `build_blog` import via `read_blog_index()`'s dependency — if that errors, it means an unrelated existing issue, not this task; re-run to confirm it's this task's code at fault before investigating further).

- [ ] **Step 3: Commit**

```bash
cd "D:\Work\micode\ai-budget-assistant" && git add docs/marketing/landing/build_landing.py && git commit -m "Add pricing constants and URL helpers for landing pricing page"
```

---

### Task 2: `PRICING` content dict (all 9 languages)

**Files:**
- Modify: `docs/marketing/landing/build_landing.py` (insert immediately after the constants block added in Task 1, still before `ABOUT = {`)

**Interfaces:**
- Consumes: nothing (pure data).
- Produces: `PRICING: dict[str, dict]` — one entry per language key (`en`,`pl`,`de`,`es`,`fr`,`ru`,`ua`,`be`,`nl`), each with keys: `title`, `meta`, `h1`, `sub`, `toggle_monthly`, `toggle_yearly`, `toggle_save`, `popular`, `cta_free`, `cta_paid`, `per_month`, `per_year`, `tier_free_subtitle`, `tier_free_features` (list[str]), `tier_pro_subtitle`, `tier_pro_intro`, `tier_pro_features` (list[str]), `tier_biz_subtitle`, `tier_biz_intro`, `tier_biz_features` (list[str]), `faq_title`, `faq` (list[tuple[str,str]]). Later tasks (3-5) read these exact key names.

- [ ] **Step 1: Add the full `PRICING` dict**

Insert immediately after the block from Task 1 (still before `ABOUT = {`):

```python
PRICING = {
 "en": {
   "title": "Pricing - AI Budget Assistant",
   "meta": "Simple, transparent pricing for AI Budget Assistant. Free forever, or upgrade to Pro or Business for more AI requests, accounts and analytics.",
   "h1": "Simple, transparent pricing",
   "sub": "Start free. Pro and Business come with a 7-day free trial — no card required.",
   "toggle_monthly": "Monthly", "toggle_yearly": "Yearly", "toggle_save": "Save 20%",
   "popular": "POPULAR", "cta_free": "Open the app", "cta_paid": "Start free trial",
   "per_month": "/month", "per_year": "/year",
   "tier_free_subtitle": "Everything you need to start budgeting",
   "tier_free_features": ["Full expense & budget tracking", "Voice and receipt capture", "Bank statement import",
                            "Telegram, WhatsApp & Slack bots", "Up to 3 accounts", "1 member per account", "50 AI requests/month"],
   "tier_pro_subtitle": "For power users and small families", "tier_pro_intro": "Everything in Free, plus:",
   "tier_pro_features": ["300 AI requests/month", "Up to 5 accounts", "Up to 5 members per account",
                           "Predictive analytics", "Spending anomaly detection", "Unlimited currencies"],
   "tier_biz_subtitle": "For larger households and teams", "tier_biz_intro": "Everything in Pro, plus:",
   "tier_biz_features": ["Unlimited AI requests", "Unlimited accounts", "Unlimited members", "Advanced reporting"],
   "faq_title": "Pricing questions",
   "faq": [
     ("Is the app free?", "Yes, the core features are free forever. Pro and Business unlock higher AI limits, more accounts and advanced analytics."),
     ("Can I cancel anytime?", "Yes. Cancel anytime from Settings — you'll keep access until the end of your current billing period."),
     ("What happens after the free trial?", "If you don't cancel, your card is charged automatically at the end of the 7-day trial. You'll get a reminder before it starts."),
     ("Which currencies can I pay in?", "Prices are shown in your local currency automatically (USD, EUR, PLN, GBP, UAH or RUB) when you upgrade in the app."),
   ],
 },
 "pl": {
   "title": "Cennik - AI Budget Assistant",
   "meta": "Proste, przejrzyste ceny AI Budget Assistant. Darmowy na zawsze, albo przejdź na Pro lub Business po więcej zapytań AI, kont i analiz.",
   "h1": "Proste, przejrzyste ceny",
   "sub": "Zacznij za darmo. Plany Pro i Business mają 7-dniowy bezpłatny okres próbny — bez podawania karty.",
   "toggle_monthly": "Miesięcznie", "toggle_yearly": "Rocznie", "toggle_save": "Oszczędź 20%",
   "popular": "POPULARNY", "cta_free": "Otwórz aplikację", "cta_paid": "Rozpocznij okres próbny",
   "per_month": "/miesiąc", "per_year": "/rok",
   "tier_free_subtitle": "Wszystko, czego potrzebujesz, aby zacząć budżetować",
   "tier_free_features": ["Pełne śledzenie wydatków i budżetów", "Dodawanie głosem i skan paragonów", "Import wyciągów bankowych",
                            "Boty Telegram, WhatsApp i Slack", "Do 3 kont", "1 członek na konto", "50 zapytań AI miesięcznie"],
   "tier_pro_subtitle": "Dla zaawansowanych użytkowników i mniejszych rodzin", "tier_pro_intro": "Wszystko z Free, plus:",
   "tier_pro_features": ["300 zapytań AI miesięcznie", "Do 5 kont", "Do 5 członków na konto",
                           "Analizy predykcyjne", "Wykrywanie nietypowych wydatków", "Nielimitowane waluty"],
   "tier_biz_subtitle": "Dla większych gospodarstw domowych i zespołów", "tier_biz_intro": "Wszystko z Pro, plus:",
   "tier_biz_features": ["Nielimitowane zapytania AI", "Nielimitowane konta", "Nielimitowani członkowie", "Zaawansowane raportowanie"],
   "faq_title": "Pytania o ceny",
   "faq": [
     ("Czy aplikacja jest darmowa?", "Tak, podstawowe funkcje są darmowe na zawsze. Pro i Business odblokowują wyższe limity AI, więcej kont i zaawansowane analizy."),
     ("Czy mogę zrezygnować w dowolnym momencie?", "Tak. Zrezygnuj w dowolnym momencie w Ustawieniach — zachowasz dostęp do końca opłaconego okresu."),
     ("Co się dzieje po okresie próbnym?", "Jeśli nie zrezygnujesz, karta zostanie obciążona automatycznie po zakończeniu 7-dniowego okresu próbnego. Przypomnimy Ci przed jego startem."),
     ("W jakiej walucie płacę?", "Ceny są pokazywane automatycznie w Twojej lokalnej walucie (USD, EUR, PLN, GBP, UAH lub RUB) podczas ulepszania planu w aplikacji."),
   ],
 },
 "de": {
   "title": "Preise - AI Budget Assistant",
   "meta": "Einfache, transparente Preise für AI Budget Assistant. Für immer kostenlos, oder upgrade auf Pro oder Business für mehr KI-Anfragen, Konten und Analysen.",
   "h1": "Einfache, transparente Preise",
   "sub": "Kostenlos starten. Pro und Business haben eine 7-tägige kostenlose Testphase — keine Kreditkarte nötig.",
   "toggle_monthly": "Monatlich", "toggle_yearly": "Jährlich", "toggle_save": "20 % sparen",
   "popular": "BELIEBT", "cta_free": "App öffnen", "cta_paid": "Testphase starten",
   "per_month": "/Monat", "per_year": "/Jahr",
   "tier_free_subtitle": "Alles, was du zum Budgetieren brauchst",
   "tier_free_features": ["Vollständige Ausgaben- und Budgetverfolgung", "Erfassung per Sprache und Beleg-Scan", "Bankauszug-Import",
                            "Telegram-, WhatsApp- und Slack-Bots", "Bis zu 3 Konten", "1 Mitglied pro Konto", "50 KI-Anfragen pro Monat"],
   "tier_pro_subtitle": "Für Power-User und kleinere Familien", "tier_pro_intro": "Alles aus Free, plus:",
   "tier_pro_features": ["300 KI-Anfragen pro Monat", "Bis zu 5 Konten", "Bis zu 5 Mitglieder pro Konto",
                           "Vorausschauende Analysen", "Erkennung ungewöhnlicher Ausgaben", "Unbegrenzte Währungen"],
   "tier_biz_subtitle": "Für größere Haushalte und Teams", "tier_biz_intro": "Alles aus Pro, plus:",
   "tier_biz_features": ["Unbegrenzte KI-Anfragen", "Unbegrenzte Konten", "Unbegrenzte Mitglieder", "Erweiterte Berichte"],
   "faq_title": "Fragen zu den Preisen",
   "faq": [
     ("Ist die App kostenlos?", "Ja, die Kernfunktionen sind für immer kostenlos. Pro und Business schalten höhere KI-Limits, mehr Konten und erweiterte Analysen frei."),
     ("Kann ich jederzeit kündigen?", "Ja. Kündige jederzeit in den Einstellungen — du behältst den Zugriff bis zum Ende deines aktuellen Abrechnungszeitraums."),
     ("Was passiert nach der Testphase?", "Wenn du nicht kündigst, wird deine Karte am Ende der 7-tägigen Testphase automatisch belastet. Du bekommst vorher eine Erinnerung."),
     ("In welcher Währung zahle ich?", "Die Preise werden beim Upgrade in der App automatisch in deiner lokalen Währung angezeigt (USD, EUR, PLN, GBP, UAH oder RUB)."),
   ],
 },
 "es": {
   "title": "Precios - AI Budget Assistant",
   "meta": "Precios simples y transparentes de AI Budget Assistant. Gratis para siempre, o actualiza a Pro o Business para más solicitudes de IA, cuentas y análisis.",
   "h1": "Precios simples y transparentes",
   "sub": "Empieza gratis. Pro y Business incluyen una prueba gratuita de 7 días, sin tarjeta.",
   "toggle_monthly": "Mensual", "toggle_yearly": "Anual", "toggle_save": "Ahorra 20%",
   "popular": "POPULAR", "cta_free": "Abrir la app", "cta_paid": "Iniciar prueba gratis",
   "per_month": "/mes", "per_year": "/año",
   "tier_free_subtitle": "Todo lo que necesitas para empezar a presupuestar",
   "tier_free_features": ["Seguimiento completo de gastos y presupuestos", "Captura por voz y escaneo de recibos", "Importación de extractos bancarios",
                            "Bots de Telegram, WhatsApp y Slack", "Hasta 3 cuentas", "1 miembro por cuenta", "50 solicitudes de IA al mes"],
   "tier_pro_subtitle": "Para usuarios avanzados y familias pequeñas", "tier_pro_intro": "Todo lo de Free, más:",
   "tier_pro_features": ["300 solicitudes de IA al mes", "Hasta 5 cuentas", "Hasta 5 miembros por cuenta",
                           "Análisis predictivo", "Detección de gastos anómalos", "Monedas ilimitadas"],
   "tier_biz_subtitle": "Para hogares y equipos más grandes", "tier_biz_intro": "Todo lo de Pro, más:",
   "tier_biz_features": ["Solicitudes de IA ilimitadas", "Cuentas ilimitadas", "Miembros ilimitados", "Informes avanzados"],
   "faq_title": "Preguntas sobre precios",
   "faq": [
     ("¿La app es gratis?", "Sí, las funciones básicas son gratis para siempre. Pro y Business desbloquean más límites de IA, más cuentas y análisis avanzados."),
     ("¿Puedo cancelar cuando quiera?", "Sí. Cancela cuando quieras desde Ajustes — mantendrás el acceso hasta el final del periodo de facturación actual."),
     ("¿Qué pasa después de la prueba gratuita?", "Si no cancelas, tu tarjeta se cobrará automáticamente al terminar los 7 días de prueba. Te avisaremos antes de que empiece el cobro."),
     ("¿En qué moneda pago?", "Los precios se muestran automáticamente en tu moneda local (USD, EUR, PLN, GBP, UAH o RUB) al mejorar tu plan en la app."),
   ],
 },
 "fr": {
   "title": "Tarifs - AI Budget Assistant",
   "meta": "Tarifs simples et transparents pour AI Budget Assistant. Gratuit pour toujours, ou passez à Pro ou Business pour plus de requêtes IA, comptes et analyses.",
   "h1": "Des tarifs simples et transparents",
   "sub": "Commencez gratuitement. Pro et Business incluent un essai gratuit de 7 jours, sans carte bancaire.",
   "toggle_monthly": "Mensuel", "toggle_yearly": "Annuel", "toggle_save": "Économisez 20 %",
   "popular": "POPULAIRE", "cta_free": "Ouvrir l'appli", "cta_paid": "Démarrer l'essai gratuit",
   "per_month": "/mois", "per_year": "/an",
   "tier_free_subtitle": "Tout ce qu'il faut pour commencer à budgétiser",
   "tier_free_features": ["Suivi complet des dépenses et budgets", "Saisie vocale et scan de reçus", "Import des relevés bancaires",
                            "Bots Telegram, WhatsApp et Slack", "Jusqu'à 3 comptes", "1 membre par compte", "50 requêtes IA par mois"],
   "tier_pro_subtitle": "Pour les utilisateurs avancés et les petites familles", "tier_pro_intro": "Tout ce qui est dans Free, plus :",
   "tier_pro_features": ["300 requêtes IA par mois", "Jusqu'à 5 comptes", "Jusqu'à 5 membres par compte",
                           "Analyses prédictives", "Détection des dépenses anormales", "Devises illimitées"],
   "tier_biz_subtitle": "Pour les foyers et équipes plus grands", "tier_biz_intro": "Tout ce qui est dans Pro, plus :",
   "tier_biz_features": ["Requêtes IA illimitées", "Comptes illimités", "Membres illimités", "Rapports avancés"],
   "faq_title": "Questions sur les tarifs",
   "faq": [
     ("L'appli est-elle gratuite ?", "Oui, les fonctions de base sont gratuites pour toujours. Pro et Business débloquent plus de requêtes IA, plus de comptes et des analyses avancées."),
     ("Puis-je annuler à tout moment ?", "Oui. Annulez à tout moment depuis les Paramètres — vous gardez l'accès jusqu'à la fin de la période de facturation en cours."),
     ("Que se passe-t-il après l'essai gratuit ?", "Si vous n'annulez pas, votre carte est débitée automatiquement à la fin des 7 jours d'essai. Vous recevrez un rappel avant le début du prélèvement."),
     ("Dans quelle devise vais-je payer ?", "Les prix s'affichent automatiquement dans votre devise locale (USD, EUR, PLN, GBP, UAH ou RUB) lors de la mise à niveau dans l'appli."),
   ],
 },
 "ru": {
   "title": "Тарифы - AI Budget Assistant",
   "meta": "Простые и понятные тарифы AI Budget Assistant. Бесплатно навсегда, либо перейдите на Pro или Business — больше ИИ-запросов, счетов и аналитики.",
   "h1": "Простые и понятные тарифы",
   "sub": "Начните бесплатно. В Pro и Business есть 7-дневный бесплатный пробный период — без привязки карты.",
   "toggle_monthly": "Помесячно", "toggle_yearly": "Ежегодно", "toggle_save": "Экономия 20%",
   "popular": "ПОПУЛЯРНЫЙ", "cta_free": "Открыть приложение", "cta_paid": "Начать бесплатный период",
   "per_month": "/мес.", "per_year": "/год",
   "tier_free_subtitle": "Всё, что нужно, чтобы начать вести бюджет",
   "tier_free_features": ["Полный учёт расходов и бюджетов", "Добавление голосом и сканирование чеков", "Импорт банковских выписок",
                            "Боты Telegram, WhatsApp и Slack", "До 3 счетов", "1 участник на счёт", "50 ИИ-запросов в месяц"],
   "tier_pro_subtitle": "Для активных пользователей и небольших семей", "tier_pro_intro": "Всё из Free, плюс:",
   "tier_pro_features": ["300 ИИ-запросов в месяц", "До 5 счетов", "До 5 участников на счёт",
                           "Предиктивная аналитика", "Обнаружение аномальных трат", "Неограниченное количество валют"],
   "tier_biz_subtitle": "Для больших семей и команд", "tier_biz_intro": "Всё из Pro, плюс:",
   "tier_biz_features": ["Неограниченные ИИ-запросы", "Неограниченное количество счетов", "Неограниченное количество участников", "Расширенная отчётность"],
   "faq_title": "Вопросы о тарифах",
   "faq": [
     ("Приложение бесплатное?", "Да, базовые функции бесплатны навсегда. Pro и Business открывают больше лимитов ИИ, счетов и расширенную аналитику."),
     ("Можно отменить подписку в любой момент?", "Да. Отмените в любой момент в Настройках — доступ сохранится до конца оплаченного периода."),
     ("Что будет после пробного периода?", "Если вы не отмените подписку, карта будет списана автоматически по окончании 7-дневного пробного периода. Мы напомним вам заранее."),
     ("В какой валюте я плачу?", "Цены автоматически показываются в вашей локальной валюте (USD, EUR, PLN, GBP, UAH или RUB) при оформлении подписки в приложении."),
   ],
 },
 "ua": {
   "title": "Тарифи - AI Budget Assistant",
   "meta": "Прості й прозорі тарифи AI Budget Assistant. Безкоштовно назавжди, або перейдіть на Pro чи Business — більше ШІ-запитів, рахунків і аналітики.",
   "h1": "Прості й прозорі тарифи",
   "sub": "Почніть безкоштовно. У Pro та Business є 7-денний безкоштовний пробний період — без прив'язки картки.",
   "toggle_monthly": "Щомісяця", "toggle_yearly": "Щороку", "toggle_save": "Економія 20%",
   "popular": "ПОПУЛЯРНИЙ", "cta_free": "Відкрити застосунок", "cta_paid": "Почати пробний період",
   "per_month": "/міс.", "per_year": "/рік",
   "tier_free_subtitle": "Усе, що потрібно, щоб почати вести бюджет",
   "tier_free_features": ["Повний облік витрат і бюджетів", "Додавання голосом і сканування чеків", "Імпорт банківських виписок",
                            "Боти Telegram, WhatsApp і Slack", "До 3 рахунків", "1 учасник на рахунок", "50 ШІ-запитів на місяць"],
   "tier_pro_subtitle": "Для активних користувачів і невеликих родин", "tier_pro_intro": "Усе з Free, плюс:",
   "tier_pro_features": ["300 ШІ-запитів на місяць", "До 5 рахунків", "До 5 учасників на рахунок",
                           "Предиктивна аналітика", "Виявлення аномальних витрат", "Необмежена кількість валют"],
   "tier_biz_subtitle": "Для більших родин і команд", "tier_biz_intro": "Усе з Pro, плюс:",
   "tier_biz_features": ["Необмежені ШІ-запити", "Необмежена кількість рахунків", "Необмежена кількість учасників", "Розширена звітність"],
   "faq_title": "Питання про тарифи",
   "faq": [
     ("Застосунок безкоштовний?", "Так, базові функції безкоштовні назавжди. Pro та Business відкривають більше лімітів ШІ, рахунків і розширену аналітику."),
     ("Чи можна скасувати підписку в будь-який момент?", "Так. Скасуйте в будь-який момент у Налаштуваннях — доступ збережеться до кінця оплаченого періоду."),
     ("Що станеться після пробного періоду?", "Якщо ви не скасуєте підписку, картку буде автоматично списано після закінчення 7-денного пробного періоду. Ми нагадаємо заздалегідь."),
     ("У якій валюті я плачу?", "Ціни автоматично показуються у вашій локальній валюті (USD, EUR, PLN, GBP, UAH або RUB) під час оновлення плану в застосунку."),
   ],
 },
 "be": {
   "title": "Тарыфы - AI Budget Assistant",
   "meta": "Простыя і празрыстыя тарыфы AI Budget Assistant. Бясплатна назаўжды, або перайдзіце на Pro ці Business — больш ШІ-запытаў, рахункаў і аналітыкі.",
   "h1": "Простыя і празрыстыя тарыфы",
   "sub": "Пачніце бясплатна. У Pro і Business ёсць 7-дзённы бясплатны пробны перыяд — без прывязкі карты.",
   "toggle_monthly": "Штомесяц", "toggle_yearly": "Штогод", "toggle_save": "Эканомія 20%",
   "popular": "ПАПУЛЯРНЫ", "cta_free": "Адкрыць дадатак", "cta_paid": "Пачаць пробны перыяд",
   "per_month": "/мес.", "per_year": "/год",
   "tier_free_subtitle": "Усё, што трэба, каб пачаць весці бюджэт",
   "tier_free_features": ["Поўны ўлік выдаткаў і бюджэтаў", "Дадаванне голасам і сканаванне чэкаў", "Імпарт банкаўскіх выпісак",
                            "Боты Telegram, WhatsApp і Slack", "Да 3 рахункаў", "1 удзельнік на рахунак", "50 ШІ-запытаў у месяц"],
   "tier_pro_subtitle": "Для актыўных карыстальнікаў і невялікіх сем'яў", "tier_pro_intro": "Усё з Free, плюс:",
   "tier_pro_features": ["300 ШІ-запытаў у месяц", "Да 5 рахункаў", "Да 5 удзельнікаў на рахунак",
                           "Прэдыктыўная аналітыка", "Выяўленне анамальных выдаткаў", "Неабмежаваная колькасць валют"],
   "tier_biz_subtitle": "Для большых сем'яў і каманд", "tier_biz_intro": "Усё з Pro, плюс:",
   "tier_biz_features": ["Неабмежаваныя ШІ-запыты", "Неабмежаваная колькасць рахункаў", "Неабмежаваная колькасць удзельнікаў", "Пашыраная справаздачнасць"],
   "faq_title": "Пытанні пра тарыфы",
   "faq": [
     ("Дадатак бясплатны?", "Так, базавыя функцыі бясплатныя назаўжды. Pro і Business адкрываюць больш лімітаў ШІ, рахункаў і пашыраную аналітыку."),
     ("Ці можна адмяніць падпіску ў любы момант?", "Так. Адмяніце ў любы момант у Налады — доступ захаваецца да канца аплачанага перыяду."),
     ("Што адбудзецца пасля пробнага перыяду?", "Калі вы не адмовіцеся ад падпіскі, картка будзе аўтаматычна спісана пасля заканчэння 7-дзённага пробнага перыяду. Мы нагадаем загадзя."),
     ("У якой валюце я плачу?", "Цэны аўтаматычна паказваюцца ў вашай лакальнай валюце (USD, EUR, PLN, GBP, UAH або RUB) падчас абнаўлення плана ў дадатку."),
   ],
 },
 "nl": {
   "title": "Prijzen - AI Budget Assistant",
   "meta": "Eenvoudige, transparante prijzen voor AI Budget Assistant. Voor altijd gratis, of upgrade naar Pro of Business voor meer AI-verzoeken, accounts en analyses.",
   "h1": "Eenvoudige, transparante prijzen",
   "sub": "Begin gratis. Pro en Business hebben een gratis proefperiode van 7 dagen — geen creditcard nodig.",
   "toggle_monthly": "Maandelijks", "toggle_yearly": "Jaarlijks", "toggle_save": "Bespaar 20%",
   "popular": "POPULAIR", "cta_free": "App openen", "cta_paid": "Start gratis proefperiode",
   "per_month": "/maand", "per_year": "/jaar",
   "tier_free_subtitle": "Alles wat je nodig hebt om te beginnen met budgetteren",
   "tier_free_features": ["Volledig bijhouden van uitgaven en budgetten", "Vastleggen via spraak en bonscan", "Bankafschrift importeren",
                            "Telegram-, WhatsApp- en Slack-bots", "Tot 3 accounts", "1 lid per account", "50 AI-verzoeken per maand"],
   "tier_pro_subtitle": "Voor poweruser en kleinere gezinnen", "tier_pro_intro": "Alles uit Free, plus:",
   "tier_pro_features": ["300 AI-verzoeken per maand", "Tot 5 accounts", "Tot 5 leden per account",
                           "Voorspellende analyses", "Detectie van afwijkende uitgaven", "Onbeperkt aantal valuta's"],
   "tier_biz_subtitle": "Voor grotere huishoudens en teams", "tier_biz_intro": "Alles uit Pro, plus:",
   "tier_biz_features": ["Onbeperkt AI-verzoeken", "Onbeperkt aantal accounts", "Onbeperkt aantal leden", "Geavanceerde rapportage"],
   "faq_title": "Vragen over prijzen",
   "faq": [
     ("Is de app gratis?", "Ja, de kernfuncties zijn voor altijd gratis. Pro en Business ontgrendelen hogere AI-limieten, meer accounts en geavanceerde analyses."),
     ("Kan ik op elk moment opzeggen?", "Ja. Zeg op elk moment op via Instellingen — je houdt toegang tot het einde van je huidige factureringsperiode."),
     ("Wat gebeurt er na de gratis proefperiode?", "Als je niet opzegt, wordt je kaart automatisch belast aan het einde van de proefperiode van 7 dagen. Je krijgt vooraf een herinnering."),
     ("In welke valuta betaal ik?", "Prijzen worden automatisch getoond in je lokale valuta (USD, EUR, PLN, GBP, UAH of RUB) wanneer je in de app upgradet."),
   ],
 },
}
```

- [ ] **Step 2: Verify all 9 languages are present with matching keys**

Run:
```bash
cd "D:\Work\micode\ai-budget-assistant\docs\marketing\landing" && python -c "
import build_landing as b
assert set(b.PRICING.keys()) == set(b.LANG_NAMES.keys()), set(b.LANG_NAMES.keys()) - set(b.PRICING.keys())
required = {'title','meta','h1','sub','toggle_monthly','toggle_yearly','toggle_save','popular','cta_free','cta_paid',
            'per_month','per_year','tier_free_subtitle','tier_free_features','tier_pro_subtitle','tier_pro_intro',
            'tier_pro_features','tier_biz_subtitle','tier_biz_intro','tier_biz_features','faq_title','faq'}
for lang, t in b.PRICING.items():
    missing = required - set(t.keys())
    assert not missing, f'{lang} missing {missing}'
    assert len(t['faq']) >= 3, f'{lang} faq too short'
print('OK', len(b.PRICING), 'languages')
"
```
Expected: `OK 9 languages`, no `AssertionError`.

- [ ] **Step 3: Commit**

```bash
cd "D:\Work\micode\ai-budget-assistant" && git add docs/marketing/landing/build_landing.py && git commit -m "Add PRICING content dict for all 9 landing languages"
```

---

### Task 3: CSS for pricing cards + Monthly/Yearly toggle

**Files:**
- Modify: `docs/marketing/landing/build_landing.py:523` (append inside the `CSS = """ ... """` block, right after the line `.legal strong{color:#1a1a1d}` and before the closing `"""`)

**Interfaces:**
- Consumes: nothing (pure CSS text appended to the existing `CSS` string).
- Produces: CSS classes `.pricing-grid`, `.pcard`, `.pcard.pop`, `.pop-badge`, `.psub`, `.price`, `.price-m`, `.price-y`, `.pfull`, `.pfeat`, `.billcb`, `.billwrap`, `.billswitch` — Task 4's `pricing_page()` HTML must use these exact class names.

- [ ] **Step 1: Append the pricing CSS**

In `docs/marketing/landing/build_landing.py`, find this line near the end of the `CSS` block:

```python
.legal strong{color:#1a1a1d}
"""
```

Replace it with (adds new rules before the closing `"""`):

```python
.legal strong{color:#1a1a1d}
.pricing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:8px}
@media(max-width:760px){.pricing-grid{grid-template-columns:1fr}}
.pcard{position:relative;padding:28px 24px;border:1px solid #ececf0;border-radius:16px;background:#fff}
.pcard.pop{border-color:#F58320;box-shadow:0 8px 24px rgba(245,131,42,.16)}
.pop-badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:#F58320;color:#fff;font-size:12px;font-weight:800;letter-spacing:.4px;padding:5px 14px;border-radius:999px}
.pcard h3{margin:0 0 4px;font-size:20px}
.psub{margin:0 0 18px;color:#5b5b66;font-size:14px}
.price{margin:0 0 20px}
.price-m,.price-y{font-size:34px;font-weight:800}
.price-y{display:none}
.price small{font-size:15px;font-weight:600;color:#9a9aa3;margin-left:4px}
.pfull{display:block;text-align:center;margin-bottom:20px}
.pfeat{list-style:none;margin:0;padding:0}
.pfeat li{position:relative;padding:7px 0 7px 28px;font-size:15px;color:#3a3a42}
.pfeat li:before{content:"✓";position:absolute;left:0;top:7px;width:18px;height:18px;border-radius:50%;background:#fff3e6;color:#F58320;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}
.billcb{position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none}
.billwrap{text-align:center;margin-bottom:34px}
.billswitch{display:inline-flex;padding:4px;background:#f3f3f5;border-radius:999px}
.billswitch label{padding:9px 18px;border-radius:999px;font-weight:700;font-size:14px;color:#5b5b66;cursor:pointer}
.billswitch .save{color:#1f9d55;font-weight:700}
#bm:checked ~ .billwrap .billswitch label[for=bm],#by:checked ~ .billwrap .billswitch label[for=by]{background:#fff;color:#1a1a1d;box-shadow:0 2px 8px rgba(0,0,0,.08)}
#by:checked ~ .pricing-grid .price-m{display:none}
#by:checked ~ .pricing-grid .price-y{display:inline}
"""
```

- [ ] **Step 2: Verify the CSS block still parses as valid Python and contains the new classes**

Run:
```bash
cd "D:\Work\micode\ai-budget-assistant\docs\marketing\landing" && python -c "
import build_landing as b
for cls in ('.pricing-grid', '.pcard', '.pop-badge', '.billswitch', '.billcb', '#by:checked ~ .pricing-grid .price-y'):
    assert cls in b.CSS, f'missing {cls}'
print('OK')
"
```
Expected: `OK`, no `AssertionError`, no `SyntaxError` importing the module.

- [ ] **Step 3: Commit**

```bash
cd "D:\Work\micode\ai-budget-assistant" && git add docs/marketing/landing/build_landing.py && git commit -m "Add pricing card and billing-toggle CSS to landing generator"
```

---

### Task 4: `pricing_page(lang)` render function

**Files:**
- Modify: `docs/marketing/landing/build_landing.py` (insert immediately after the `about_page(lang)` function, i.e. right before `def jsonld(lang, langs):`)

**Interfaces:**
- Consumes: `PRICING`, `TIER_KEYS`, `TIER_NAMES`, `tier_amounts`, `tier_price_display`, `pricing_url`, `PRICING_LABELS` (Tasks 1-2), CSS classes from Task 3, and existing globals `SITE`, `APP`, `ROBOTS`, `LANG_NAMES`, `C`, `footer_html`, `consent_html`.
- Produces: `pricing_page(lang: str) -> str` (full HTML document string) — Task 5's `build()` loop calls this directly, same shape as `about_page(lang)`.

- [ ] **Step 1: Add the render function**

Insert immediately after the `about_page(lang)` function (right before `def jsonld(lang, langs):`):

```python
def pricing_page(lang):
    t = PRICING[lang]
    cards = ""
    for i, key in enumerate(TIER_KEYS):
        name = TIER_NAMES[key]
        subtitle = t[f"tier_{'biz' if key == 'business' else key}_subtitle"]
        intro = t.get(f"tier_{'biz' if key == 'business' else key}_intro")
        features = t[f"tier_{'biz' if key == 'business' else key}_features"]
        price_m, price_y = tier_price_display(lang, key)
        cta = t["cta_free"] if key == "free" else t["cta_paid"]
        pop = key == "pro"
        feat_items = (f'<li>{html.escape(intro)}</li>' if intro else '') + \
            "".join(f'<li>{html.escape(f)}</li>' for f in features)
        cards += (
            f'<div class="pcard{" pop" if pop else ""}">'
            + (f'<span class="pop-badge">{html.escape(t["popular"])}</span>' if pop else '')
            + f'<div class="ic"><b>{i+1}</b></div><h3>{html.escape(name)}</h3>'
            + f'<p class="psub">{html.escape(subtitle)}</p>'
            + f'<div class="price"><span class="price-m">{price_m}<small>{html.escape(t["per_month"])}</small></span>'
            + f'<span class="price-y">{price_y}<small>{html.escape(t["per_year"])}</small></span></div>'
            + f'<a class="btn p pfull" href="{APP}">{html.escape(cta)}</a>'
            + f'<ul class="pfeat">{feat_items}</ul></div>'
        )
    faq = "".join(f'<div class="qa"><h3>{html.escape(q)}</h3><p>{html.escape(a)}</p></div>' for q, a in t["faq"])
    url = SITE + pricing_url(lang)
    alts = [(l, SITE + pricing_url(l)) for l in LANG_NAMES if l in PRICING] + [("x-default", SITE + pricing_url("en"))]
    alt_tags = "".join(f'<link rel="alternate" hreflang="{hl}" href="{href}">' for hl, href in alts)
    og = f"{SITE}/blog/{lang}/assets/og-default.png"
    offers_jsonld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Product", "name": f"AI Budget Assistant {TIER_NAMES[k]}",
         "offers": {"@type": "Offer", "price": f"{tier_amounts(lang, k)[0]:.2f}",
                    "priceCurrency": LANG_CURRENCY[lang], "url": url}}
        for k in TIER_KEYS
    ]}
    return (f'<!DOCTYPE html><html lang="{lang}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>{html.escape(t["title"])}</title><meta name="description" content="{html.escape(t["meta"])}">'
            f'<link rel="canonical" href="{url}"><meta name="robots" content="{ROBOTS}">{alt_tags}'
            f'<meta property="og:type" content="website"><meta property="og:title" content="{html.escape(t["title"])}">'
            f'<meta property="og:description" content="{html.escape(t["meta"])}"><meta property="og:url" content="{url}">'
            f'<meta property="og:image" content="{og}">'
            f'<script type="application/ld+json">{json.dumps(offers_jsonld, ensure_ascii=False)}</script>'
            f'<style>{CSS}</style></head><body>'
            f'<header><div class="wrap"><a class="brand" href="{lp(lang)}">AI <span>Budget</span> Assistant</a>'
            f'<nav class="nav"><a href="{pricing_url(lang)}">{PRICING_LABELS[lang]}</a>'
            f'<a class="btn p" href="{APP}">{C[lang]["nav_login"]}</a></nav></div></header>'
            f'<section class="hero"><div class="wrap"><h1>{html.escape(t["h1"])}</h1><p>{html.escape(t["sub"])}</p></div></section>'
            f'<section class="sec"><div class="wrap">'
            f'<input type="radio" name="bill" id="bm" class="billcb" checked>'
            f'<input type="radio" name="bill" id="by" class="billcb">'
            f'<div class="billwrap"><div class="billswitch"><label for="bm">{html.escape(t["toggle_monthly"])}</label>'
            f'<label for="by">{html.escape(t["toggle_yearly"])} <span class="save">{html.escape(t["toggle_save"])}</span></label></div></div>'
            f'<div class="pricing-grid">{cards}</div></div></section>'
            f'<section class="sec"><div class="wrap"><h2>{html.escape(t["faq_title"])}</h2><div class="faq">{faq}</div></div></section>'
            + f'<section class="band"><div class="wrap"><h2>{html.escape(C[lang]["cta_band"])}</h2>'
              f'<a class="btn p" href="{APP}">{html.escape(C[lang]["cta_band_btn"])}</a></div></section>'
            + footer_html(lang) + consent_html(lang) + '</body></html>')
```

Note: the closing CTA band reuses `C[lang]["cta_band"]`/`cta_band_btn` (the homepage's dict, already defined per language) rather than duplicating the same generic call-to-action copy inside `PRICING` — this mirrors how `about_page()`/`cookies_page()` reuse `C[lang]["nav_login"]` for the header button instead of redefining it.

- [ ] **Step 2: Verify it renders valid-looking HTML for one language**

Run:
```bash
cd "D:\Work\micode\ai-budget-assistant\docs\marketing\landing" && python -c "
import build_landing as b
html_out = b.pricing_page('en')
assert '<h1>Simple, transparent pricing</h1>' in html_out
assert html_out.count('class=\"pcard') == 3, html_out.count('class=\"pcard')
assert 'POPULAR' in html_out
assert '\$9.99' in html_out and '\$95.88' in html_out
assert 'id=\"bm\"' in html_out and 'id=\"by\"' in html_out
assert 'class=\"band\"' in html_out, 'missing closing CTA band'
print('OK', len(html_out), 'chars')
"
```
Expected: `OK <some length> chars`, no `AssertionError`, no `KeyError`.

- [ ] **Step 3: Commit**

```bash
cd "D:\Work\micode\ai-budget-assistant" && git add docs/marketing/landing/build_landing.py && git commit -m "Add pricing_page render function to landing generator"
```

---

### Task 5: Wire into `build()` — page loop, footer nav link, sitemap

**Files:**
- Modify: `docs/marketing/landing/build_landing.py` — `footer_html(lang)` function, the `build()` function's page-generation section, and the sitemap-generation section near the end of `build()`.

**Interfaces:**
- Consumes: `pricing_page(lang)`, `pricing_url(lang)`, `PRICING`, `PRICING_LABELS`, `LANG_NAMES` (all from Tasks 1-4).
- Produces: `site/pricing/index.html` (pl) + `site/{lang}/pricing/index.html` (8 other langs) on running `build()`; a "Pricing" link in every page's footer; pricing URLs included in `sitemap.xml` on the apex cutover build.

- [ ] **Step 1: Add the footer nav link**

In `footer_html(lang)`, find:

```python
    return (f'<footer><div class="wrap"><div class="f-links">'
            f'<a href="{blog}">{t["nav_blog"]}</a>'
            f'<a href="/help/{lang}/">{HELP_LABELS[lang]}</a>'
            f'<a href="{about_url(lang)}">{ABOUT_LABELS[lang]}</a>'
```

Replace with:

```python
    return (f'<footer><div class="wrap"><div class="f-links">'
            f'<a href="{blog}">{t["nav_blog"]}</a>'
            f'<a href="{pricing_url(lang)}">{PRICING_LABELS[lang]}</a>'
            f'<a href="/help/{lang}/">{HELP_LABELS[lang]}</a>'
            f'<a href="{about_url(lang)}">{ABOUT_LABELS[lang]}</a>'
```

- [ ] **Step 2: Add the page-generation loop in `build()`**

In `build()`, find the About page loop:

```python
    # About page (all 9 languages)
    for lang in [l for l in LANG_NAMES if l in ABOUT]:
        sub = "about" if lang == "pl" else os.path.join(lang, "about")
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(about_page(lang))
```

Add immediately after it:

```python
    # Pricing page (all 9 languages)
    for lang in [l for l in LANG_NAMES if l in PRICING]:
        sub = "pricing" if lang == "pl" else os.path.join(lang, "pricing")
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(pricing_page(lang))
```

- [ ] **Step 3: Add pricing URLs to the sitemap**

In `build()`, find (inside the `if not BASE:` apex-cutover block):

```python
        urls += [SITE + about_url(l) for l in LANG_NAMES if l in ABOUT]  # About (9 langs)
```

Add immediately after it:

```python
        urls += [SITE + pricing_url(l) for l in LANG_NAMES if l in PRICING]  # Pricing (9 langs)
```

- [ ] **Step 4: Run the full build and verify output**

Run:
```bash
cd "D:\Work\micode\ai-budget-assistant\docs\marketing\landing" && python build_landing.py
```
Expected: prints `built SEO landing for 9 langs (...) BASE='/preview' ROBOTS='noindex,follow' -> .../site`, no traceback.

Then verify the generated files:
```bash
cd "D:\Work\micode\ai-budget-assistant\docs\marketing\landing" && python -c "
import os
langs = ['pl','en','de','es','fr','ru','ua','be','nl']
for lang in langs:
    sub = 'pricing' if lang == 'pl' else os.path.join(lang, 'pricing')
    p = os.path.join('site', sub, 'index.html')
    assert os.path.exists(p), f'missing {p}'
    content = open(p, encoding='utf-8').read()
    assert 'pcard' in content, f'{lang} missing pricing cards'
    assert 'billswitch' in content, f'{lang} missing billing toggle'
print('OK all 9 pricing pages generated')
"
```
Expected: `OK all 9 pricing pages generated`.

- [ ] **Step 5: Commit**

```bash
cd "D:\Work\micode\ai-budget-assistant" && git add docs/marketing/landing/build_landing.py && git commit -m "Wire pricing page into landing build, footer nav and sitemap"
```

---

### Task 6: Visual QA and CLAUDE.md / docs update

**Files:**
- Read-only check: `docs/marketing/landing/site/pricing/index.html` and 1-2 other language variants (open in a browser)
- Modify: `CLAUDE.md` (append a line to the "Static web hosting" bullet under Mobile React Native/Expo section)

**Interfaces:**
- Consumes: the build output from Task 5.
- Produces: no new code — a documentation update and a manual visual pass.

- [ ] **Step 1: Open the generated page in a browser and visually check it**

Run (Windows):
```bash
start "" "D:\Work\micode\ai-budget-assistant\docs\marketing\landing\site\pricing\index.html"
```
Check by eye: 3 cards (Free/Pro/Business) in a row on desktop width, Pro card has an orange border + "POPULARNY" badge, clicking "Rocznie" (Yearly) swaps every card's price to the yearly amount and back when clicking "Miesięcznie" (Monthly), checkmark bullets render, header/footer match the rest of the site's light theme, and the "Cennik" (Pricing) link works from the homepage footer (`docs/marketing/landing/site/index.html`).

If anything looks wrong (e.g. cards not evenly spaced, badge overlapping the border oddly, toggle not switching), fix the specific CSS rule in Task 3's block and re-run `python build_landing.py`.

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`, find this sentence inside the "Static web hosting (ABA-213)" bullet:

```
**Static SEO blog (ABA-267)**: `ai-budget.pl/blog` is real crawlable HTML
```

Add a new sentence immediately before it (same bullet paragraph), documenting the new page:

```
**Pricing page**: `docs/marketing/landing/build_landing.py` also builds a static `/pricing/` page (all 9 languages, `pricing_url(lang)`) showing the real Free/Pro/Business tiers from `subscriptions.service.ts`'s `PRICING` table (`CURRENCY_PRICING`/`LANG_CURRENCY` constants in the generator — en/be→USD, pl→PLN, de/es/fr/nl→EUR, ru→RUB, ua→UAH; `be` has no BYN support so it falls back to USD) with a pure-CSS Monthly/Yearly toggle (same `:checked` sibling-selector trick as the feature-card lightbox). Linked from every page's footer (`PRICING_LABELS`) and included in the apex sitemap. Regenerate after editing: `python docs/marketing/landing/build_landing.py`.
```

- [ ] **Step 3: Commit**

```bash
cd "D:\Work\micode\ai-budget-assistant" && git add CLAUDE.md && git commit -m "Document the new landing pricing page in CLAUDE.md"
```
