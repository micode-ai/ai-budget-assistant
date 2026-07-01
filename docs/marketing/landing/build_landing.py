# -*- coding: utf-8 -*-
"""
Build the static, SEO-optimized multi-language marketing landing for ai-budget.pl.

apex = this static landing (Polish default; others at /<lang>/). The Expo app
moves to https://app.ai-budget.pl. Blog stays at /blog.

Features:
- SEO: keyword-rich title/H1/intro per market, hreflang (+x-default=en), JSON-LD
  @graph (WebSite + Organization + SoftwareApplication + FAQPage), heading
  hierarchy, internal link to blog, static HTML + inline CSS.
- Clickable feature cards -> pure-CSS (:target) lightbox showing the per-language
  app screenshot (from feature_graphics/marketing/<lang>/, resized for web).
- Footer with the MICODE sp. z o.o. company logo + copyright (like eksiegowyai.pl).

BASE/ROBOTS gate the noindex /preview build vs the apex cutover:
  preview: LANDING_BASE=preview ROBOTS="noindex,follow"
  cutover: LANDING_BASE=""      ROBOTS="index,follow,max-image-preview:large"
"""
import os, re, json, html, glob, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "site")
FEAT = os.path.join(ROOT, "..", "feature_graphics", "by-language")  # clean raw screenshots (no headline plaque)
SITE = "https://ai-budget.pl"
APP = "https://app.ai-budget.pl"
PLAY = "https://play.google.com/store/apps/details?id=com.budget.assistant"
COMPANY = "MICODE sp. z o.o."
COMPANY_URL = "https://mi-code.pl/"
YEAR = "2026"
SAMEAS = [
    "https://www.facebook.com/profile.php?id=61570771625318",
    "https://t.me/aibudgetassistant",
    "https://t.me/aibudgetassistantEn",
    "https://t.me/aibudgetassistantBy",
    "https://play.google.com/store/apps/details?id=com.budget.assistant",
]
GA_ID = "G-WMEFHYETVX"
CONSENT = {
 "en": ("We use cookies to measure traffic and improve the site.", "Accept", "Decline"),
 "pl": ("Używamy plików cookie do analizy ruchu i ulepszania strony.", "Akceptuję", "Odrzuć"),
 "de": ("Wir verwenden Cookies, um den Traffic zu messen und die Seite zu verbessern.", "Akzeptieren", "Ablehnen"),
 "es": ("Usamos cookies para medir el tráfico y mejorar el sitio.", "Aceptar", "Rechazar"),
 "fr": ("Nous utilisons des cookies pour mesurer le trafic et améliorer le site.", "Accepter", "Refuser"),
 "ru": ("Мы используем файлы cookie для анализа трафика и улучшения сайта.", "Принять", "Отклонить"),
 "ua": ("Ми використовуємо файли cookie для аналізу трафіку та покращення сайту.", "Прийняти", "Відхилити"),
 "be": ("Мы выкарыстоўваем файлы cookie для аналізу трафіку і паляпшэння сайта.", "Прыняць", "Адхіліць"),
 "nl": ("We gebruiken cookies om verkeer te meten en de site te verbeteren.", "Accepteren", "Weigeren"),
}
MORE = {"en": "Learn more", "pl": "Więcej", "de": "Mehr", "es": "Más", "fr": "En savoir plus",
        "ru": "Подробнее", "ua": "Докладніше", "be": "Падрабязней", "nl": "Meer"}
FROM_BLOG_TITLE = {"en": "From the blog", "pl": "Z bloga", "de": "Aus dem Blog", "es": "Del blog",
                   "fr": "Du blog", "ru": "Из блога", "ua": "З блогу", "be": "З блога", "nl": "Uit de blog"}
LEGAL_BASE = "https://micode-ai.github.io/ai-budget-assistant"
SUPPORT_EMAIL = "perevertkinma@gmail.com"
LEGAL_LABELS = {  # (privacy, terms, cookies)
 "en": ("Privacy", "Terms", "Cookies"), "pl": ("Prywatność", "Regulamin", "Cookie"),
 "de": ("Datenschutz", "AGB", "Cookies"), "es": ("Privacidad", "Términos", "Cookies"),
 "fr": ("Confidentialité", "Conditions", "Cookies"), "ru": ("Конфиденциальность", "Условия", "Cookie"),
 "ua": ("Конфіденційність", "Умови", "Cookie"), "be": ("Прыватнасць", "Умовы", "Cookie"),
 "nl": ("Privacy", "Voorwaarden", "Cookies")}
# Cookie Policy page content (pl + en; other langs link to the en page)
COOKIES = {
 "en": ("Cookie Policy - AI Budget Assistant",
        "How ai-budget.pl uses cookies and Google Analytics, and how to manage your consent.",
        "Cookie Policy",
        "<h2>What cookies we use</h2><p>This website uses <strong>Google Analytics 4</strong> to measure traffic and improve the site. "
        "GA4 sets analytics cookies (such as <code>_ga</code>) to count visits and understand how pages are used. We do not use advertising or cross-site tracking cookies.</p>"
        "<h2>Your consent</h2><p>Analytics is off by default. GA4 loads <strong>only after you click Accept</strong> on the cookie banner. "
        "If you Decline, no analytics cookies are set. To change your choice, clear this site's data in your browser and the banner will appear again.</p>"
        "<h2>What is collected</h2><p>Analytics data is aggregated and does not identify you. This website does not collect your name, email or financial data.</p>"
        "<h2>More information</h2><p>For how the AI Budget Assistant app handles your account and financial data, see the full "
        "<a href=\"__PRIV__\">Privacy Policy</a> and <a href=\"__TERMS__\">Terms of Service</a>. "
        "Data controller: MICODE Sp. z o.o. Contact: <a href=\"mailto:__MAIL__\">__MAIL__</a>.</p><p><em>Last updated: June 2026.</em></p>"),
 "pl": ("Polityka cookie - AI Budget Assistant",
        "Jak ai-budget.pl używa plików cookie i Google Analytics oraz jak zarządzać zgodą.",
        "Polityka cookie",
        "<h2>Jakie pliki cookie wykorzystujemy</h2><p>Ta strona używa <strong>Google Analytics 4</strong> do analizy ruchu i ulepszania serwisu. "
        "GA4 ustawia pliki cookie analityczne (np. <code>_ga</code>), aby liczyć wizyty i rozumieć, jak korzystasz ze stron. Nie używamy plików cookie reklamowych ani śledzących między witrynami.</p>"
        "<h2>Twoja zgoda</h2><p>Analityka jest domyślnie wyłączona. GA4 ładuje się <strong>dopiero po kliknięciu Akceptuję</strong> w banerze cookie. "
        "Jeśli klikniesz Odrzuć, żadne pliki cookie analityczne nie zostaną ustawione. Aby zmienić wybór, wyczyść dane tej strony w przeglądarce, a baner pojawi się ponownie.</p>"
        "<h2>Co zbieramy</h2><p>Dane analityczne są zagregowane i nie identyfikują Ciebie. Ta strona nie zbiera imienia, adresu e-mail ani danych finansowych.</p>"
        "<h2>Więcej informacji</h2><p>Jak aplikacja AI Budget Assistant przetwarza dane konta i finansowe, opisuje pełna "
        "<a href=\"__PRIV__\">Polityka prywatności</a> i <a href=\"__TERMS__\">Regulamin</a>. "
        "Administrator danych: MICODE Sp. z o.o. Kontakt: <a href=\"mailto:__MAIL__\">__MAIL__</a>.</p><p><em>Ostatnia aktualizacja: czerwiec 2026.</em></p>"),
}

def legal_lang(lang):
    return "pl" if lang == "pl" else "en"

def priv_url(lang):
    return "/privacy/" if lang == "pl" else "/en/privacy/"

def terms_url(lang):
    return "/terms/" if lang == "pl" else "/en/terms/"

def cookies_url(lang):
    return "/cookies/" if lang == "pl" else "/en/cookies/"

LEGAL_DIR = os.path.join(ROOT, "legal")
LEGAL_TITLES = {
 "privacy": {"en": "Privacy Policy - AI Budget Assistant", "pl": "Polityka prywatności - AI Budget Assistant"},
 "terms": {"en": "Terms of Service - AI Budget Assistant", "pl": "Regulamin - AI Budget Assistant"}}
LEGAL_DESC = {
 "privacy": {"en": "Privacy Policy for AI Budget Assistant by MICODE sp. z o.o.",
             "pl": "Polityka prywatności AI Budget Assistant, MICODE sp. z o.o."},
 "terms": {"en": "Terms of Service for AI Budget Assistant by MICODE sp. z o.o.",
           "pl": "Regulamin AI Budget Assistant, MICODE sp. z o.o."}}

def about_url(lang):
    return "/about/" if lang == "pl" else f"/{lang}/about/"

ABOUT_LABELS = {"en": "About", "pl": "O nas", "de": "Über uns", "es": "Acerca de", "fr": "À propos",
                "ru": "О нас", "ua": "Про нас", "be": "Пра нас", "nl": "Over ons"}
HELP_LABELS = {"en": "Help", "pl": "Pomoc", "de": "Hilfe", "es": "Ayuda", "fr": "Aide",
               "ru": "Помощь", "ua": "Довідка", "be": "Дапамога", "nl": "Help"}

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

ABOUT = {
 "en": ("About - AI Budget Assistant",
        "About AI Budget Assistant, a personal and family finance app with an AI assistant, built by MICODE sp. z o.o.",
        "About AI Budget Assistant",
        "<h2>What is AI Budget Assistant</h2><p>AI Budget Assistant is a personal and family finance app that brings expenses, budgets, savings goals, debts and bank import into one place, with an AI assistant that does the tedious data entry for you. Add expenses by voice or a photo of a receipt, ask questions in plain language, and share one budget with your family in real time. It works on Android and on the web, in 9 languages.</p>"
        "<h2>Who is behind it</h2><p>The app is built and operated by <strong>MICODE sp. z o.o.</strong>, a software company based in Poland (see <a href=\"https://mi-code.pl/\">mi-code.pl</a>). We build practical, privacy-respecting tools that help people manage money without spreadsheets.</p>"
        "<h2>Our approach</h2><p>We focus on three things: making data entry effortless with AI, letting families budget together in real time, and keeping your financial data private. The core features are free; advanced tools are available on Pro.</p>"
        "<h2>Contact</h2><p>Questions or feedback: <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Get the app on <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> or open the <a href=\"https://app.ai-budget.pl\">web version</a>. Read our <a href=\"/blog/en/\">blog</a> for budgeting guides.</p>"),
 "pl": ("O nas - AI Budget Assistant",
        "O AI Budget Assistant, aplikacji do finansów osobistych i rodzinnych z asystentem AI, stworzonej przez MICODE sp. z o.o.",
        "O AI Budget Assistant",
        "<h2>Czym jest AI Budget Assistant</h2><p>AI Budget Assistant to aplikacja do finansów osobistych i rodzinnych, która łączy wydatki, budżety, cele oszczędnościowe, długi i import z banku w jednym miejscu, a asystent AI wykonuje za Ciebie żmudne wpisywanie danych. Dodawaj wydatki głosem lub zdjęciem paragonu, pytaj zwykłym językiem i prowadź wspólny budżet z rodziną na żywo. Działa na Androidzie i w przeglądarce, w 9 językach.</p>"
        "<h2>Kto za tym stoi</h2><p>Aplikację tworzy i prowadzi <strong>MICODE sp. z o.o.</strong>, polska firma programistyczna (zobacz <a href=\"https://mi-code.pl/\">mi-code.pl</a>). Budujemy praktyczne narzędzia szanujące prywatność, które pomagają zarządzać pieniędzmi bez arkuszy kalkulacyjnych.</p>"
        "<h2>Nasze podejście</h2><p>Skupiamy się na trzech rzeczach: bezwysiłkowym wpisywaniu danych dzięki AI, wspólnym budżecie rodziny na żywo i prywatności Twoich danych finansowych. Podstawowe funkcje są darmowe; zaawansowane narzędzia dostępne są w planie Pro.</p>"
        "<h2>Kontakt</h2><p>Pytania lub opinie: <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Pobierz aplikację z <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> lub otwórz <a href=\"https://app.ai-budget.pl\">wersję webową</a>. Czytaj nasz <a href=\"/blog/pl/\">blog</a> z poradnikami.</p>"),
 "de": ("Über uns - AI Budget Assistant",
        "Über AI Budget Assistant, eine App für persönliche und Familienfinanzen mit KI-Assistent, von MICODE sp. z o.o.",
        "Über AI Budget Assistant",
        "<h2>Was ist AI Budget Assistant</h2><p>AI Budget Assistant ist eine App für persönliche und Familienfinanzen, die Ausgaben, Budgets, Sparziele, Schulden und Bankimport an einem Ort vereint, mit einem KI-Assistenten, der die mühsame Dateneingabe für dich übernimmt. Erfasse Ausgaben per Sprache oder Beleg-Foto, stelle Fragen in normaler Sprache und führe ein gemeinsames Budget mit deiner Familie in Echtzeit. Verfügbar auf Android und im Web, in 9 Sprachen.</p>"
        "<h2>Wer dahintersteht</h2><p>Die App wird von <strong>MICODE sp. z o.o.</strong> entwickelt und betrieben, einem Softwareunternehmen aus Polen (siehe <a href=\"https://mi-code.pl/\">mi-code.pl</a>). Wir bauen praktische, datenschutzfreundliche Werkzeuge, die beim Geldmanagement ohne Tabellen helfen.</p>"
        "<h2>Unser Ansatz</h2><p>Wir konzentrieren uns auf drei Dinge: müheloses Erfassen von Daten mit KI, gemeinsames Budgetieren der Familie in Echtzeit und den Schutz deiner Finanzdaten. Die Kernfunktionen sind kostenlos; erweiterte Werkzeuge gibt es mit Pro.</p>"
        "<h2>Kontakt</h2><p>Fragen oder Feedback: <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Hol dir die App bei <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> oder öffne die <a href=\"https://app.ai-budget.pl\">Web-Version</a>. Lies unseren <a href=\"/blog/de/\">Blog</a> mit Budget-Ratgebern.</p>"),
 "es": ("Acerca de - AI Budget Assistant",
        "Acerca de AI Budget Assistant, una app de finanzas personales y familiares con asistente de IA, de MICODE sp. z o.o.",
        "Acerca de AI Budget Assistant",
        "<h2>Qué es AI Budget Assistant</h2><p>AI Budget Assistant es una app de finanzas personales y familiares que reúne gastos, presupuestos, metas de ahorro, deudas e importación bancaria en un solo lugar, con un asistente de IA que hace por ti el tedioso registro de datos. Añade gastos por voz o con una foto del recibo, pregunta en lenguaje natural y gestiona un presupuesto compartido con tu familia en tiempo real. Funciona en Android y en la web, en 9 idiomas.</p>"
        "<h2>Quién está detrás</h2><p>La app está desarrollada y operada por <strong>MICODE sp. z o.o.</strong>, una empresa de software de Polonia (ver <a href=\"https://mi-code.pl/\">mi-code.pl</a>). Creamos herramientas prácticas y respetuosas con la privacidad que ayudan a gestionar el dinero sin hojas de cálculo.</p>"
        "<h2>Nuestro enfoque</h2><p>Nos centramos en tres cosas: registrar datos sin esfuerzo con IA, presupuestar en familia en tiempo real y mantener privados tus datos financieros. Las funciones básicas son gratuitas; las herramientas avanzadas están en Pro.</p>"
        "<h2>Contacto</h2><p>Preguntas o comentarios: <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Consigue la app en <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> o abre la <a href=\"https://app.ai-budget.pl\">versión web</a>. Lee nuestro <a href=\"/blog/es/\">blog</a> con guías de presupuesto.</p>"),
 "fr": ("À propos - AI Budget Assistant",
        "À propos d'AI Budget Assistant, une appli de finances personnelles et familiales avec assistant IA, de MICODE sp. z o.o.",
        "À propos d'AI Budget Assistant",
        "<h2>Qu'est-ce qu'AI Budget Assistant</h2><p>AI Budget Assistant est une appli de finances personnelles et familiales qui réunit dépenses, budgets, objectifs d'épargne, dettes et import bancaire au même endroit, avec un assistant IA qui se charge de la saisie fastidieuse à votre place. Ajoutez des dépenses à la voix ou par photo de reçu, posez des questions en langage courant et gérez un budget partagé avec votre famille en temps réel. Disponible sur Android et sur le web, en 9 langues.</p>"
        "<h2>Qui est derrière</h2><p>L'appli est développée et exploitée par <strong>MICODE sp. z o.o.</strong>, une société de logiciels basée en Pologne (voir <a href=\"https://mi-code.pl/\">mi-code.pl</a>). Nous créons des outils pratiques et respectueux de la vie privée pour gérer son argent sans tableur.</p>"
        "<h2>Notre approche</h2><p>Nous nous concentrons sur trois choses : une saisie sans effort grâce à l'IA, un budget familial partagé en temps réel et la confidentialité de vos données financières. Les fonctions de base sont gratuites ; les outils avancés sont disponibles avec Pro.</p>"
        "<h2>Contact</h2><p>Questions ou retours : <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Téléchargez l'appli sur <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> ou ouvrez la <a href=\"https://app.ai-budget.pl\">version web</a>. Lisez notre <a href=\"/blog/fr/\">blog</a> avec des guides budgétaires.</p>"),
 "ru": ("О нас - AI Budget Assistant",
        "О приложении AI Budget Assistant - финансы для себя и семьи с ИИ-ассистентом, от MICODE sp. z o.o.",
        "О AI Budget Assistant",
        "<h2>Что такое AI Budget Assistant</h2><p>AI Budget Assistant - приложение для личных и семейных финансов, которое объединяет расходы, бюджеты, цели накоплений, долги и импорт из банка в одном месте, а ИИ-ассистент берёт на себя рутинный ввод данных. Добавляйте траты голосом или фото чека, задавайте вопросы обычным языком и ведите общий бюджет с семьёй в реальном времени. Работает на Android и в вебе, на 9 языках.</p>"
        "<h2>Кто за этим стоит</h2><p>Приложение разрабатывает и поддерживает <strong>MICODE sp. z o.o.</strong>, софтверная компания из Польши (см. <a href=\"https://mi-code.pl/\">mi-code.pl</a>). Мы делаем практичные инструменты с уважением к приватности, которые помогают управлять деньгами без таблиц.</p>"
        "<h2>Наш подход</h2><p>Мы сосредоточены на трёх вещах: лёгкий ввод данных с помощью ИИ, общий семейный бюджет в реальном времени и приватность ваших финансовых данных. Базовые функции бесплатны; продвинутые инструменты доступны в Pro.</p>"
        "<h2>Контакт</h2><p>Вопросы или отзывы: <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Скачайте приложение в <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> или откройте <a href=\"https://app.ai-budget.pl\">веб-версию</a>. Читайте наш <a href=\"/blog/ru/\">блог</a> с гайдами по бюджету.</p>"),
 "ua": ("Про нас - AI Budget Assistant",
        "Про застосунок AI Budget Assistant - фінанси для себе та родини з ШІ-асистентом, від MICODE sp. z o.o.",
        "Про AI Budget Assistant",
        "<h2>Що таке AI Budget Assistant</h2><p>AI Budget Assistant - застосунок для особистих і сімейних фінансів, який поєднує витрати, бюджети, цілі заощаджень, борги та імпорт із банку в одному місці, а ШІ-асистент бере на себе рутинне введення даних. Додавайте витрати голосом або фото чека, ставте запитання звичайною мовою та ведіть спільний бюджет із родиною в реальному часі. Працює на Android і у вебі, 9 мовами.</p>"
        "<h2>Хто за цим стоїть</h2><p>Застосунок розробляє та підтримує <strong>MICODE sp. z o.o.</strong>, софтверна компанія з Польщі (див. <a href=\"https://mi-code.pl/\">mi-code.pl</a>). Ми створюємо практичні інструменти з повагою до приватності, які допомагають керувати грошима без таблиць.</p>"
        "<h2>Наш підхід</h2><p>Ми зосереджені на трьох речах: легке введення даних за допомогою ШІ, спільний сімейний бюджет у реальному часі та приватність ваших фінансових даних. Базові функції безкоштовні; розширені інструменти доступні в Pro.</p>"
        "<h2>Контакт</h2><p>Запитання чи відгуки: <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Завантажте застосунок у <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> або відкрийте <a href=\"https://app.ai-budget.pl\">веб-версію</a>. Читайте наш <a href=\"/blog/ua/\">блог</a> з гайдами щодо бюджету.</p>"),
 "be": ("Пра нас - AI Budget Assistant",
        "Пра дадатак AI Budget Assistant - фінансы для сябе і сям'і з ШІ-памочнікам, ад MICODE sp. z o.o.",
        "Пра AI Budget Assistant",
        "<h2>Што такое AI Budget Assistant</h2><p>AI Budget Assistant - дадатак для асабістых і сямейных фінансаў, які аб'ядноўвае выдаткі, бюджэты, мэты зберажэнняў, даўгі і імпарт з банка ў адным месцы, а ШІ-памочнік бярэ на сябе руцінны ўвод даных. Дадавайце выдаткі голасам або фота чэка, задавайце пытанні звычайнай мовай і вядзіце агульны бюджэт з сям'ёй у рэальным часе. Працуе на Android і ў вебе, на 9 мовах.</p>"
        "<h2>Хто за гэтым стаіць</h2><p>Дадатак распрацоўвае і падтрымлівае <strong>MICODE sp. z o.o.</strong>, софтверная кампанія з Польшчы (гл. <a href=\"https://mi-code.pl/\">mi-code.pl</a>). Мы ствараем практычныя інструменты з павагай да прыватнасці, якія дапамагаюць кіраваць грашыма без табліц.</p>"
        "<h2>Наш падыход</h2><p>Мы засяроджаны на трох рэчах: лёгкі ўвод даных з дапамогай ШІ, агульны сямейны бюджэт у рэальным часе і прыватнасць вашых фінансавых даных. Базавыя функцыі бясплатныя; пашыраныя інструменты даступныя ў Pro.</p>"
        "<h2>Кантакт</h2><p>Пытанні ці водгукі: <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Спампуйце дадатак у <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> або адкрыйце <a href=\"https://app.ai-budget.pl\">веб-версію</a>. Чытайце наш <a href=\"/blog/be/\">блог</a> з гайдамі па бюджэце.</p>"),
 "nl": ("Over ons - AI Budget Assistant",
        "Over AI Budget Assistant, een app voor persoonlijke en gezinsfinanciën met een AI-assistent, van MICODE sp. z o.o.",
        "Over AI Budget Assistant",
        "<h2>Wat is AI Budget Assistant</h2><p>AI Budget Assistant is een app voor persoonlijke en gezinsfinanciën die uitgaven, budgetten, spaardoelen, schulden en bankimport op één plek samenbrengt, met een AI-assistent die het saaie invoeren voor je doet. Voeg uitgaven toe met spraak of een bonfoto, stel vragen in gewone taal en beheer een gedeeld budget met je gezin in realtime. Werkt op Android en op het web, in 9 talen.</p>"
        "<h2>Wie erachter zit</h2><p>De app wordt gebouwd en beheerd door <strong>MICODE sp. z o.o.</strong>, een softwarebedrijf uit Polen (zie <a href=\"https://mi-code.pl/\">mi-code.pl</a>). We bouwen praktische, privacyvriendelijke tools die helpen geld te beheren zonder spreadsheets.</p>"
        "<h2>Onze aanpak</h2><p>We richten ons op drie dingen: moeiteloos gegevens invoeren met AI, samen met het gezin budgetteren in realtime en de privacy van je financiële gegevens. De kernfuncties zijn gratis; geavanceerde tools zijn beschikbaar met Pro.</p>"
        "<h2>Contact</h2><p>Vragen of feedback: <a href=\"mailto:perevertkinma@gmail.com\">perevertkinma@gmail.com</a>. Download de app in <a href=\"https://play.google.com/store/apps/details?id=com.budget.assistant\">Google Play</a> of open de <a href=\"https://app.ai-budget.pl\">webversie</a>. Lees onze <a href=\"/blog/nl/\">blog</a> met budgetgidsen.</p>"),
}
_b = os.environ.get("LANDING_BASE", "preview").strip("/")
BASE = ("/" + _b) if _b else ""
ROBOTS = os.environ.get("ROBOTS", "noindex,follow")
PUBLISH_DATE = "2026-06-19"
DEFAULT_LANG = "pl"
LOCALE = {"pl": "pl_PL", "en": "en_US", "de": "de_DE", "es": "es_ES", "fr": "fr_FR",
          "ru": "ru_RU", "ua": "uk_UA", "be": "be_BY", "nl": "nl_NL"}
LANG_NAMES = {"pl": "Polski", "en": "English", "de": "Deutsch", "es": "Español", "fr": "Français",
              "ru": "Русский", "ua": "Українська", "be": "Беларуская", "nl": "Nederlands"}

# Each feature: (title, description, screenshot-file in feature_graphics/marketing/<lang>/)
C = {
 "pl": {
   "title": "AI Budget Assistant - budżet domowy z asystentem AI",
   "desc": "Aplikacja do budżetu domowego z AI: dodawaj wydatki głosem lub zdjęciem paragonu, kontroluj budżety i oszczędności, wspólnie z rodziną. Zacznij za darmo.",
   "nav_blog": "Blog", "nav_login": "Zaloguj się",
   "hero_h1": "Budżet domowy z asystentem AI",
   "hero_sub": "Wydatki, budżety, oszczędności i wspólne finanse rodziny w jednej aplikacji. AI zajmuje się żmudną robotą za Ciebie. Zacznij za darmo.",
   "cta_primary": "Otwórz aplikację", "cta_secondary": "Pobierz z Google Play",
   "intro_title": "Kontrola wydatków bez Excela",
   "intro": "AI Budget Assistant to aplikacja do budżetu domowego, która łączy wydatki, budżety, cele oszczędnościowe, długi i import z banku w jednym miejscu. Zamiast ręcznie wpisywać każdy paragon, dodajesz wydatek głosem albo zdjęciem, a asystent AI odpowiada na pytania o Twoje finanse zwykłym językiem. Prowadź budżet sam lub wspólnie z rodziną, na żywo, na telefonie, tablecie i w przeglądarce.",
   "features_title": "Wszystko w jednej aplikacji",
   "features_hint": "Kliknij funkcję, aby zobaczyć ją w aplikacji",
   "see": "Zobacz w aplikacji",
   "features": [
     ("Asystent AI", "Dodawaj wydatki głosem lub zdjęciem paragonu i pytaj zwykłym językiem, ile wydałeś.", "02-ai-chat.png"),
     ("Wspólny budżet", "Jedno konto, cała rodzina widzi te same wydatki i budżet domowy na żywo.", "01-home.png"),
     ("Skan paragonów", "Zrób zdjęcie paragonu, a AI odczyta pozycje, kwotę i sprzedawcę.", "03-receipt-scan.png"),
     ("Budżety i cele", "Elastyczne budżety z historią, cele oszczędnościowe i śledzenie długów.", "05-budget-detail.png"),
     ("Analizy wydatków", "Trendy, podział na kategorie i sprzedawców oraz analizy AI.", "04-analytics.png"),
     ("Import z banku", "Wczytaj transakcje z Wise i banków (CSV lub PDF) z wykrywaniem duplikatów.", "06-bank-import.png"),
   ],
   "faq_title": "Najczęstsze pytania",
   "faq": [
     ("Czy aplikacja do budżetu jest darmowa?", "Tak, podstawowe funkcje są darmowe. Plan Pro zwiększa limity AI i odblokowuje zaawansowane analizy."),
     ("Jak dodawać wydatki?", "Głosem, zdjęciem paragonu albo ręcznie. Asystent AI rozpoznaje pozycje, kwotę i sprzedawcę."),
     ("Czy mogę prowadzić budżet domowy z rodziną?", "Tak. Wspólne konto sprawia, że wszyscy widzą te same wydatki i budżet w czasie rzeczywistym."),
     ("Czy zaimportuję transakcje z banku?", "Tak, z Wise i banków przez CSV lub PDF, z automatycznym wykrywaniem duplikatów."),
   ],
   "cta_band": "Przejmij kontrolę nad pieniędzmi, sam lub z rodziną.",
   "cta_band_btn": "Zacznij za darmo",
   "blog_cta": "Czytaj poradniki na blogu",
   "footer": "AI Budget Assistant - aplikacja do budżetu domowego z asystentem AI.",
   "rights": "Wszelkie prawa zastrzeżone.",
 },
 "en": {
   "title": "AI Budget Assistant - budget app & expense tracker",
   "desc": "AI budget app and expense tracker: add expenses by voice or a receipt photo, plan budgets and save money, together with your family. Free to start.",
   "nav_blog": "Blog", "nav_login": "Log in",
   "hero_h1": "Budget app and expense tracker with AI",
   "hero_sub": "Track expenses, plan budgets, hit savings goals and manage money together with your family, in one app. The AI does the boring work. Start free.",
   "cta_primary": "Open the app", "cta_secondary": "Get it on Google Play",
   "intro_title": "Expense tracking without spreadsheets",
   "intro": "AI Budget Assistant is an all-in-one budget app that brings expenses, budgets, savings goals, debts and bank import into one place. Instead of typing in every receipt, you add an expense by voice or a photo, and the AI answers questions about your money in plain language. Track it on your own or share one budget with your family in real time, on phone, tablet and web.",
   "features_title": "Everything in one app",
   "features_hint": "Tap a feature to see it in the app",
   "see": "See in the app",
   "features": [
     ("AI assistant", "Add expenses by voice or a photo of a receipt, and ask in plain language how much you spent.", "02-ai-chat.png"),
     ("Shared budget", "One account, the whole family sees the same expenses and household budget in real time.", "01-home.png"),
     ("Scan receipts", "Snap a receipt and the AI reads the items, total and merchant.", "03-receipt-scan.png"),
     ("Budgets and goals", "Flexible budgets with history, savings goals and debt tracking.", "05-budget-detail.png"),
     ("Spending analytics", "Trends, category and merchant breakdowns, and AI insights.", "04-analytics.png"),
     ("Bank import", "Import transactions from Wise and banks (CSV or PDF) with duplicate detection.", "06-bank-import.png"),
   ],
   "faq_title": "Frequently asked questions",
   "faq": [
     ("Is the budget app free?", "Yes, the core features are free. Pro raises the AI limits and unlocks advanced analytics."),
     ("How do I add expenses?", "By voice, a photo of a receipt, or manually. The AI reads the items, total and merchant."),
     ("Can I budget with my family?", "Yes. A shared account lets everyone see the same expenses and budget in real time."),
     ("Can I import bank transactions?", "Yes, from Wise and banks via CSV or PDF, with automatic duplicate detection."),
   ],
   "cta_band": "Take control of your money, on your own or together.",
   "cta_band_btn": "Start free",
   "blog_cta": "Read guides on the blog",
   "footer": "AI Budget Assistant - all-in-one finance app with an AI assistant.",
   "rights": "All rights reserved.",
 },
 "de": {
   "title": "AI Budget Assistant - Haushaltsbuch mit KI",
   "desc": "Haushaltsbuch-App mit KI: Ausgaben per Sprache oder Beleg-Foto erfassen, Budgets und Sparen im Griff, gemeinsam mit der Familie. Kostenlos starten.",
   "nav_blog": "Blog", "nav_login": "Anmelden",
   "hero_h1": "Haushaltsbuch mit KI-Assistent",
   "hero_sub": "Ausgaben, Budgets, Sparziele und gemeinsame Familienfinanzen in einer App. Die KI übernimmt die Fleißarbeit. Kostenlos starten.",
   "cta_primary": "App öffnen", "cta_secondary": "Bei Google Play laden",
   "intro_title": "Ausgaben im Blick, ganz ohne Excel",
   "intro": "AI Budget Assistant ist eine Haushaltsbuch-App, die Ausgaben, Budgets, Sparziele, Schulden und Bankimport an einem Ort vereint. Statt jeden Beleg manuell einzutippen, erfasst du eine Ausgabe per Sprache oder Foto, und die KI beantwortet Fragen zu deinen Finanzen in normaler Sprache. Führe dein Budget allein oder gemeinsam mit der Familie, in Echtzeit, auf Smartphone, Tablet und im Web.",
   "features_title": "Alles in einer App", "features_hint": "Tippe auf eine Funktion, um sie in der App zu sehen", "see": "In der App ansehen",
   "features": [
     ("KI-Assistent", "Ausgaben per Sprache oder Beleg-Foto erfassen und in normaler Sprache fragen, wie viel du ausgegeben hast.", "02-ai-chat.png"),
     ("Gemeinsames Budget", "Ein Konto, die ganze Familie sieht dieselben Ausgaben und das Haushaltsbudget in Echtzeit.", "01-home.png"),
     ("Belege scannen", "Beleg fotografieren, die KI liest Artikel, Betrag und Händler.", "03-receipt-scan.png"),
     ("Budgets und Ziele", "Flexible Budgets mit Verlauf, Sparziele und Schuldenverwaltung.", "05-budget-detail.png"),
     ("Ausgaben-Analysen", "Trends, Aufschlüsselung nach Kategorie und Händler sowie KI-Einblicke.", "04-analytics.png"),
     ("Bankimport", "Transaktionen aus Wise und Banken (CSV oder PDF) mit Dublettenerkennung importieren.", "06-bank-import.png"),
   ],
   "faq_title": "Häufige Fragen",
   "faq": [
     ("Ist die Haushaltsbuch-App kostenlos?", "Ja, die Kernfunktionen sind kostenlos. Pro erhöht die KI-Limits und schaltet erweiterte Analysen frei."),
     ("Wie erfasse ich Ausgaben?", "Per Sprache, Beleg-Foto oder manuell. Die KI erkennt Artikel, Betrag und Händler."),
     ("Kann ich mein Budget mit der Familie führen?", "Ja. Ein geteiltes Konto zeigt allen dieselben Ausgaben und Budgets in Echtzeit."),
     ("Kann ich Banktransaktionen importieren?", "Ja, aus Wise und Banken per CSV oder PDF, mit automatischer Dublettenerkennung."),
   ],
   "cta_band": "Übernimm die Kontrolle über dein Geld, allein oder gemeinsam.", "cta_band_btn": "Kostenlos starten",
   "blog_cta": "Ratgeber im Blog lesen",
   "footer": "AI Budget Assistant - All-in-one Finanz-App mit KI-Assistent.", "rights": "Alle Rechte vorbehalten.",
 },
 "es": {
   "title": "AI Budget Assistant - control de gastos con IA",
   "desc": "App de control de gastos con IA: añade gastos por voz o foto del recibo, controla presupuestos y ahorro, en familia. Empieza gratis.",
   "nav_blog": "Blog", "nav_login": "Iniciar sesión",
   "hero_h1": "Control de gastos con asistente de IA",
   "hero_sub": "Gastos, presupuestos, metas de ahorro y finanzas familiares compartidas en una app. La IA hace el trabajo aburrido. Empieza gratis.",
   "cta_primary": "Abrir la app", "cta_secondary": "Descargar en Google Play",
   "intro_title": "Controla tus gastos sin hojas de cálculo",
   "intro": "AI Budget Assistant es una app de control de gastos que reúne gastos, presupuestos, metas de ahorro, deudas e importación bancaria en un solo lugar. En lugar de teclear cada recibo, añades un gasto por voz o con una foto, y la IA responde preguntas sobre tu dinero en lenguaje natural. Gestiona tu presupuesto solo o en familia, en tiempo real, en el móvil, la tablet y la web.",
   "features_title": "Todo en una app", "features_hint": "Toca una función para verla en la app", "see": "Ver en la app",
   "features": [
     ("Asistente de IA", "Añade gastos por voz o con una foto del recibo y pregunta en lenguaje natural cuánto gastaste.", "02-ai-chat.png"),
     ("Presupuesto compartido", "Una cuenta, toda la familia ve los mismos gastos y el presupuesto en tiempo real.", "01-home.png"),
     ("Escanear recibos", "Haz una foto del recibo y la IA lee los artículos, el total y el comercio.", "03-receipt-scan.png"),
     ("Presupuestos y metas", "Presupuestos flexibles con historial, metas de ahorro y seguimiento de deudas.", "05-budget-detail.png"),
     ("Análisis de gastos", "Tendencias, desglose por categoría y comercio, e insights con IA.", "04-analytics.png"),
     ("Importación bancaria", "Importa transacciones de Wise y bancos (CSV o PDF) con detección de duplicados.", "06-bank-import.png"),
   ],
   "faq_title": "Preguntas frecuentes",
   "faq": [
     ("¿La app de gastos es gratis?", "Sí, las funciones básicas son gratuitas. Pro aumenta los límites de IA y desbloquea análisis avanzados."),
     ("¿Cómo añado gastos?", "Por voz, foto del recibo o manualmente. La IA lee los artículos, el total y el comercio."),
     ("¿Puedo gestionar el presupuesto en familia?", "Sí. Una cuenta compartida permite que todos vean los mismos gastos y presupuestos en tiempo real."),
     ("¿Puedo importar transacciones del banco?", "Sí, de Wise y bancos por CSV o PDF, con detección automática de duplicados."),
   ],
   "cta_band": "Toma el control de tu dinero, solo o en equipo.", "cta_band_btn": "Empieza gratis",
   "blog_cta": "Lee las guías del blog",
   "footer": "AI Budget Assistant - app de finanzas todo en uno con asistente de IA.", "rights": "Todos los derechos reservados.",
 },
 "fr": {
   "title": "AI Budget Assistant - suivi des depenses avec IA",
   "desc": "Appli de suivi des dépenses avec IA : ajoutez des dépenses à la voix ou par photo de reçu, gérez budgets et épargne, en famille. Gratuit.",
   "nav_blog": "Blog", "nav_login": "Se connecter",
   "hero_h1": "Suivi des dépenses avec un assistant IA",
   "hero_sub": "Dépenses, budgets, objectifs d'épargne et finances familiales partagées dans une appli. L'IA fait le travail ennuyeux. Commencez gratuitement.",
   "cta_primary": "Ouvrir l'appli", "cta_secondary": "Télécharger sur Google Play",
   "intro_title": "Suivez vos dépenses sans tableur",
   "intro": "AI Budget Assistant est une appli de gestion de budget qui réunit dépenses, budgets, objectifs d'épargne, dettes et import bancaire au même endroit. Au lieu de saisir chaque reçu, vous ajoutez une dépense à la voix ou par photo, et l'IA répond à vos questions sur vos finances en langage courant. Gérez votre budget seul ou en famille, en temps réel, sur mobile, tablette et web.",
   "features_title": "Tout dans une seule appli", "features_hint": "Touchez une fonction pour la voir dans l'appli", "see": "Voir dans l'appli",
   "features": [
     ("Assistant IA", "Ajoutez des dépenses à la voix ou par photo de reçu et demandez en langage courant combien vous avez dépensé.", "02-ai-chat.png"),
     ("Budget partagé", "Un compte, toute la famille voit les mêmes dépenses et le budget en temps réel.", "01-home.png"),
     ("Scanner les reçus", "Photographiez un reçu, l'IA lit les articles, le total et le commerçant.", "03-receipt-scan.png"),
     ("Budgets et objectifs", "Budgets flexibles avec historique, objectifs d'épargne et suivi des dettes.", "05-budget-detail.png"),
     ("Analyses des dépenses", "Tendances, répartition par catégorie et commerçant, et analyses IA.", "04-analytics.png"),
     ("Import bancaire", "Importez les transactions de Wise et des banques (CSV ou PDF) avec détection des doublons.", "06-bank-import.png"),
   ],
   "faq_title": "Questions fréquentes",
   "faq": [
     ("L'appli de budget est-elle gratuite ?", "Oui, les fonctions de base sont gratuites. Pro augmente les limites IA et débloque les analyses avancées."),
     ("Comment ajouter des dépenses ?", "À la voix, par photo de reçu ou manuellement. L'IA lit les articles, le total et le commerçant."),
     ("Puis-je gérer le budget en famille ?", "Oui. Un compte partagé permet à tous de voir les mêmes dépenses et budgets en temps réel."),
     ("Puis-je importer mes opérations bancaires ?", "Oui, depuis Wise et les banques via CSV ou PDF, avec détection automatique des doublons."),
   ],
   "cta_band": "Reprenez le contrôle de votre argent, seul ou à plusieurs.", "cta_band_btn": "Commencer gratuitement",
   "blog_cta": "Lire les guides du blog",
   "footer": "AI Budget Assistant - appli de finances tout-en-un avec assistant IA.", "rights": "Tous droits réservés.",
 },
 "ru": {
   "title": "AI Budget Assistant - учёт расходов с ИИ",
   "desc": "Приложение для учёта расходов с ИИ: добавляйте траты голосом или фото чека, контролируйте бюджеты и накопления, вместе с семьёй. Бесплатно.",
   "nav_blog": "Блог", "nav_login": "Войти",
   "hero_h1": "Учёт расходов с ИИ-ассистентом",
   "hero_sub": "Расходы, бюджеты, цели накоплений и общие финансы семьи в одном приложении. ИИ берёт рутину на себя. Начните бесплатно.",
   "cta_primary": "Открыть приложение", "cta_secondary": "Скачать в Google Play",
   "intro_title": "Контроль расходов без Excel",
   "intro": "AI Budget Assistant - приложение для учёта расходов, которое объединяет траты, бюджеты, цели накоплений, долги и импорт из банка в одном месте. Вместо ручного ввода каждого чека вы добавляете расход голосом или фото, а ИИ отвечает на вопросы о ваших финансах обычным языком. Ведите бюджет сами или вместе с семьёй, в реальном времени, на телефоне, планшете и в вебе.",
   "features_title": "Всё в одном приложении", "features_hint": "Нажмите на функцию, чтобы увидеть её в приложении", "see": "Посмотреть в приложении",
   "features": [
     ("ИИ-ассистент", "Добавляйте траты голосом или фото чека и спрашивайте обычным языком, сколько вы потратили.", "02-ai-chat.png"),
     ("Общий бюджет", "Один счёт, вся семья видит одни и те же расходы и бюджет в реальном времени.", "01-home.png"),
     ("Сканирование чеков", "Сфотографируйте чек - ИИ распознает позиции, сумму и продавца.", "03-receipt-scan.png"),
     ("Бюджеты и цели", "Гибкие бюджеты с историей, цели накоплений и учёт долгов.", "05-budget-detail.png"),
     ("Аналитика трат", "Тренды, разбивка по категориям и продавцам, ИИ-инсайты.", "04-analytics.png"),
     ("Импорт из банка", "Импорт транзакций из Wise и банков (CSV или PDF) с поиском дубликатов.", "06-bank-import.png"),
   ],
   "faq_title": "Частые вопросы",
   "faq": [
     ("Приложение для бюджета бесплатное?", "Да, базовые функции бесплатны. Pro увеличивает лимиты ИИ и открывает расширенную аналитику."),
     ("Как добавлять расходы?", "Голосом, фото чека или вручную. ИИ распознаёт позиции, сумму и продавца."),
     ("Можно вести бюджет с семьёй?", "Да. Общий счёт показывает всем одни и те же расходы и бюджеты в реальном времени."),
     ("Можно импортировать транзакции из банка?", "Да, из Wise и банков через CSV или PDF, с автоматическим поиском дубликатов."),
   ],
   "cta_band": "Возьмите финансы под контроль, сами или вместе.", "cta_band_btn": "Начать бесплатно",
   "blog_cta": "Читать гайды в блоге",
   "footer": "AI Budget Assistant - всё-в-одном приложение для финансов с ИИ-ассистентом.", "rights": "Все права защищены.",
 },
 "ua": {
   "title": "AI Budget Assistant - облік витрат з ШІ",
   "desc": "Застосунок для обліку витрат з ШІ: додавайте витрати голосом або фото чека, контролюйте бюджети та заощадження, разом із родиною. Безкоштовно.",
   "nav_blog": "Блог", "nav_login": "Увійти",
   "hero_h1": "Облік витрат з ШІ-асистентом",
   "hero_sub": "Витрати, бюджети, цілі заощаджень і спільні фінанси родини в одному застосунку. ШІ бере рутину на себе. Почніть безкоштовно.",
   "cta_primary": "Відкрити застосунок", "cta_secondary": "Завантажити в Google Play",
   "intro_title": "Контроль витрат без Excel",
   "intro": "AI Budget Assistant - застосунок для обліку витрат, який поєднує витрати, бюджети, цілі заощаджень, борги та імпорт із банку в одному місці. Замість ручного введення кожного чека ви додаєте витрату голосом або фото, а ШІ відповідає на запитання про ваші фінанси звичайною мовою. Ведіть бюджет самі або разом із родиною, у реальному часі, на телефоні, планшеті та у вебі.",
   "features_title": "Усе в одному застосунку", "features_hint": "Натисніть на функцію, щоб побачити її в застосунку", "see": "Подивитися в застосунку",
   "features": [
     ("ШІ-асистент", "Додавайте витрати голосом або фото чека та запитуйте звичайною мовою, скільки ви витратили.", "02-ai-chat.png"),
     ("Спільний бюджет", "Один рахунок, уся родина бачить ті самі витрати та бюджет у реальному часі.", "01-home.png"),
     ("Сканування чеків", "Сфотографуйте чек - ШІ розпізнає позиції, суму та продавця.", "03-receipt-scan.png"),
     ("Бюджети та цілі", "Гнучкі бюджети з історією, цілі заощаджень і облік боргів.", "05-budget-detail.png"),
     ("Аналітика витрат", "Тренди, розподіл за категоріями та продавцями, ШІ-аналітика.", "04-analytics.png"),
     ("Імпорт із банку", "Імпорт транзакцій із Wise і банків (CSV або PDF) з пошуком дублікатів.", "06-bank-import.png"),
   ],
   "faq_title": "Часті запитання",
   "faq": [
     ("Застосунок для бюджету безкоштовний?", "Так, базові функції безкоштовні. Pro збільшує ліміти ШІ та відкриває розширену аналітику."),
     ("Як додавати витрати?", "Голосом, фото чека або вручну. ШІ розпізнає позиції, суму та продавця."),
     ("Чи можна вести бюджет з родиною?", "Так. Спільний рахунок показує всім ті самі витрати та бюджети в реальному часі."),
     ("Чи можна імпортувати транзакції з банку?", "Так, із Wise і банків через CSV або PDF, з автоматичним пошуком дублікатів."),
   ],
   "cta_band": "Візьміть фінанси під контроль, самі або разом.", "cta_band_btn": "Почати безкоштовно",
   "blog_cta": "Читати гайди в блозі",
   "footer": "AI Budget Assistant - все-в-одному застосунок для фінансів із ШІ-асистентом.", "rights": "Усі права захищено.",
 },
 "be": {
   "title": "AI Budget Assistant - улік выдаткаў з ШІ",
   "desc": "Дадатак для ўліку выдаткаў з ШІ: дадавайце выдаткі голасам або фота чэка, кантралюйце бюджэты і зберажэнні, разам з сям'ёй. Бясплатна.",
   "nav_blog": "Блог", "nav_login": "Увайсці",
   "hero_h1": "Улік выдаткаў з ШІ-памочнікам",
   "hero_sub": "Выдаткі, бюджэты, мэты зберажэнняў і агульныя фінансы сям'і ў адным дадатку. ШІ бярэ руціну на сябе. Пачніце бясплатна.",
   "cta_primary": "Адкрыць дадатак", "cta_secondary": "Спампаваць у Google Play",
   "intro_title": "Кантроль выдаткаў без Excel",
   "intro": "AI Budget Assistant - дадатак для ўліку выдаткаў, які аб'ядноўвае выдаткі, бюджэты, мэты зберажэнняў, даўгі і імпарт з банка ў адным месцы. Замест ручнога ўводу кожнага чэка вы дадаеце выдатак голасам або фота, а ШІ адказвае на пытанні пра вашы фінансы звычайнай мовай. Вядзіце бюджэт самі або разам з сям'ёй, у рэальным часе, на тэлефоне, планшэце і ў вебе.",
   "features_title": "Усё ў адным дадатку", "features_hint": "Націсніце на функцыю, каб убачыць яе ў дадатку", "see": "Паглядзець у дадатку",
   "features": [
     ("ШІ-памочнік", "Дадавайце выдаткі голасам або фота чэка і пытайцеся звычайнай мовай, колькі вы выдаткавалі.", "02-ai-chat.png"),
     ("Агульны бюджэт", "Адзін рахунак, уся сям'я бачыць тыя самыя выдаткі і бюджэт у рэальным часе.", "01-home.png"),
     ("Сканаванне чэкаў", "Сфатаграфуйце чэк - ШІ распазнае пазіцыі, суму і прадаўца.", "03-receipt-scan.png"),
     ("Бюджэты і мэты", "Гнуткія бюджэты з гісторыяй, мэты зберажэнняў і ўлік даўгоў.", "05-budget-detail.png"),
     ("Аналітыка выдаткаў", "Тэндэнцыі, размеркаванне па катэгорыях і прадаўцах, ШІ-аналітыка.", "04-analytics.png"),
     ("Імпарт з банка", "Імпарт транзакцый з Wise і банкаў (CSV або PDF) з пошукам дублікатаў.", "06-bank-import.png"),
   ],
   "faq_title": "Частыя пытанні",
   "faq": [
     ("Ці дадатак для бюджэту бясплатны?", "Так, базавыя функцыі бясплатныя. Pro павялічвае ліміты ШІ і адкрывае пашыраную аналітыку."),
     ("Як дадаваць выдаткі?", "Голасам, фота чэка або ўручную. ШІ распазнае пазіцыі, суму і прадаўца."),
     ("Ці можна весці бюджэт з сям'ёй?", "Так. Агульны рахунак паказвае ўсім тыя самыя выдаткі і бюджэты ў рэальным часе."),
     ("Ці можна імпартаваць транзакцыі з банка?", "Так, з Wise і банкаў праз CSV або PDF, з аўтаматычным пошукам дублікатаў."),
   ],
   "cta_band": "Вазьміце фінансы пад кантроль, самі або разам.", "cta_band_btn": "Пачаць бясплатна",
   "blog_cta": "Чытаць гайды ў блогу",
   "footer": "AI Budget Assistant - усё-ў-адным дадатак для фінансаў з ШІ-памочнікам.", "rights": "Усе правы абаронены.",
 },
 "nl": {
   "title": "AI Budget Assistant - huishoudboekje met AI",
   "desc": "Huishoudboekje-app met AI: voeg uitgaven toe met spraak of een bonfoto, beheer budgetten en sparen, samen met je gezin. Gratis te starten.",
   "nav_blog": "Blog", "nav_login": "Inloggen",
   "hero_h1": "Huishoudboekje met AI-assistent",
   "hero_sub": "Uitgaven, budgetten, spaardoelen en gedeelde gezinsfinancien in een app. De AI doet het saaie werk. Gratis te starten.",
   "cta_primary": "App openen", "cta_secondary": "Download in Google Play",
   "intro_title": "Uitgaven bijhouden zonder spreadsheets",
   "intro": "AI Budget Assistant is een huishoudboekje-app die uitgaven, budgetten, spaardoelen, schulden en bankimport op een plek samenbrengt. In plaats van elke bon in te typen, voeg je een uitgave toe met spraak of een foto, en de AI beantwoordt vragen over je geld in gewone taal. Beheer je budget alleen of samen met je gezin, in realtime, op telefoon, tablet en web.",
   "features_title": "Alles in een app", "features_hint": "Tik op een functie om die in de app te zien", "see": "Bekijk in de app",
   "features": [
     ("AI-assistent", "Voeg uitgaven toe met spraak of een bonfoto en vraag in gewone taal hoeveel je hebt uitgegeven.", "02-ai-chat.png"),
     ("Gedeeld budget", "Een account, het hele gezin ziet dezelfde uitgaven en het huishoudbudget in realtime.", "01-home.png"),
     ("Bonnen scannen", "Maak een foto van de bon en de AI leest de items, het totaal en de winkel.", "03-receipt-scan.png"),
     ("Budgetten en doelen", "Flexibele budgetten met historie, spaardoelen en schuldenbeheer.", "05-budget-detail.png"),
     ("Uitgaven-analyses", "Trends, uitsplitsing per categorie en winkel, en AI-inzichten.", "04-analytics.png"),
     ("Bankimport", "Importeer transacties van Wise en banken (CSV of PDF) met duplicaatdetectie.", "06-bank-import.png"),
   ],
   "faq_title": "Veelgestelde vragen",
   "faq": [
     ("Is de budget-app gratis?", "Ja, de kernfuncties zijn gratis. Pro verhoogt de AI-limieten en ontgrendelt geavanceerde analyses."),
     ("Hoe voeg ik uitgaven toe?", "Met spraak, een bonfoto of handmatig. De AI leest de items, het totaal en de winkel."),
     ("Kan ik samen met mijn gezin budgetteren?", "Ja. Een gedeeld account laat iedereen dezelfde uitgaven en budgetten in realtime zien."),
     ("Kan ik banktransacties importeren?", "Ja, van Wise en banken via CSV of PDF, met automatische duplicaatdetectie."),
   ],
   "cta_band": "Neem de controle over je geld, alleen of samen.", "cta_band_btn": "Gratis starten",
   "blog_cta": "Lees gidsen op de blog",
   "footer": "AI Budget Assistant - alles-in-een finance-app met een AI-assistent.", "rights": "Alle rechten voorbehouden.",
 },
}

CSS = """
*{box-sizing:border-box}html,body{overflow-x:hidden}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1d;line-height:1.65}
a{text-decoration:none}.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
header{position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #ececf0;z-index:10}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-weight:800;font-size:19px;color:#1a1a1d}.brand span{color:#F58320}
.nav{display:flex;align-items:center;gap:18px}.nav a{color:#5b5b66;font-weight:600;font-size:15px}
.langs{display:flex;gap:8px}.langs a{font-size:13px;color:#9a9aa3}.langs a.active{color:#1a1a1d;font-weight:700}
.btn{display:inline-block;padding:11px 20px;border-radius:10px;font-weight:700;font-size:15px}
.btn.p{background:#F58320;color:#fff}.btn.s{background:#fff;color:#1a1a1d;border:1px solid #e3e3e8}
.hero{background:radial-gradient(900px 400px at 80% -10%,rgba(245,131,42,.18),transparent),linear-gradient(180deg,#fffaf4,#fff)}
.hero .wrap{padding:78px 22px 60px;text-align:center}
.hero h1{font-size:46px;line-height:1.12;margin:0 0 18px;letter-spacing:-.5px}
.hero p{font-size:20px;color:#4b4b55;max-width:700px;margin:0 auto 30px}.hero .btn{margin:6px}
.sec{padding:60px 0}.sec h2{text-align:center;font-size:30px;margin:0 0 8px}
.hint{text-align:center;color:#9a9aa3;font-size:14px;margin:0 0 30px}
.intro p{font-size:18px;color:#3a3a42;max-width:760px;margin:18px auto 0;text-align:center}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.lang-short{display:none}
@media(max-width:760px){.grid{grid-template-columns:1fr}.hero h1{font-size:34px}.hero p{font-size:17px}header .wrap{padding:0 16px}.brand{font-size:16px;white-space:nowrap}.nav{gap:10px}.nav .btn{padding:9px 14px;font-size:14px}}
@media(max-width:480px){.lang-full{display:none}.lang-short{display:inline}}
.card{display:block;padding:24px;border:1px solid #ececf0;border-radius:16px;background:#fff;transition:.15s;color:inherit;cursor:pointer}
.card:hover{border-color:#F58320;box-shadow:0 8px 24px rgba(245,131,42,.12);transform:translateY(-2px)}
.card .ic,.pcard .ic{width:42px;height:42px;border-radius:11px;background:#fff3e6;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.card .ic b,.pcard .ic b{color:#F58320;font-size:20px}.card h3{margin:0 0 8px;font-size:18px}.card p{margin:0;color:#5b5b66;font-size:15px}
.card .see{display:inline-block;margin-top:12px;color:#c96a12;font-weight:700;font-size:14px}
.faq{max-width:760px;margin:30px auto 0}.faq .qa{padding:18px 0;border-bottom:1px solid #ececf0}
.faq h3{margin:0 0 6px;font-size:18px}.faq p{margin:0;color:#5b5b66;font-size:16px}
.blogcta{text-align:center;padding:0 0 60px}.blogcta a{color:#c96a12;font-weight:700;font-size:16px}
.fromblog{list-style:none;max-width:760px;margin:0 auto;padding:0}.fromblog li{border-bottom:1px solid #ececf0}
.fromblog a{display:block;padding:15px 2px;color:#1a1a1d;font-weight:600;font-size:17px}.fromblog a:hover{color:#F58320}
.band{background:#1a1a1d;color:#fff;text-align:center}.band .wrap{padding:56px 22px}.band h2{font-size:28px;margin:0 0 22px}
footer{border-top:1px solid #ececf0;background:#fafafb;color:#8a8a93;font-size:14px;text-align:center}
footer .wrap{padding:30px 22px;display:flex;flex-direction:column;align-items:center;gap:16px}
.f-links{display:flex;gap:18px;flex-wrap:wrap;justify-content:center}.f-links a{color:#5b5b66;font-weight:600}
.f-co{display:flex;align-items:center;justify-content:center;gap:12px;border-top:1px solid #ececf0;padding-top:16px;width:100%}
.f-co img{height:30px;width:30px}
.langmenu{position:relative}.langmenu>summary{list-style:none;cursor:pointer;color:#5b5b66;font-weight:600;font-size:15px}
.langmenu>summary::-webkit-details-marker{display:none}
.langlist{position:absolute;top:150%;right:0;background:#fff;border:1px solid #ececf0;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.12);padding:6px;min-width:170px;z-index:20}
.langlist a{display:block;padding:9px 12px;border-radius:8px;color:#3a3a42;font-size:14px;font-weight:600}
.langlist a:hover{background:#fff3e6}.langlist a.active{color:#F58320}
.lbcb{position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none}
.lb{display:none;position:fixed;inset:0;background:rgba(10,10,12,.82);z-index:50;align-items:center;justify-content:center;padding:24px}
.lbcb:checked + .lb{display:flex}.lb .bg{position:absolute;inset:0;cursor:default}
.lb img{position:relative;max-height:86vh;max-width:360px;width:100%;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.lb .x{position:absolute;top:16px;right:22px;color:#fff;font-size:34px;font-weight:700;z-index:2;cursor:pointer;line-height:1}
.cc{position:fixed;left:16px;right:16px;bottom:16px;max-width:560px;margin:0 auto;background:#1a1a1d;color:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.35);z-index:60;font-size:14px;display:none}
.cc.show{display:block}.cc p{margin:0 0 12px;line-height:1.5}
.cc .row{display:flex;gap:10px;justify-content:flex-end}
.cc button{cursor:pointer;border:0;border-radius:8px;padding:9px 16px;font-weight:700;font-size:14px}
.cc .ok{background:#F58320;color:#fff}.cc .no{background:#2e2e33;color:#cfcfd6}
.legal{max-width:760px;padding:34px 22px 56px}.legal h1{font-size:34px;margin:0 0 18px}
.legal h2{font-size:20px;margin:28px 0 8px}.legal p{font-size:16px;color:#3a3a42;margin:0 0 12px;line-height:1.7}
.legal a{color:#c96a12}.legal code{background:#f3f3f5;padding:1px 5px;border-radius:4px;font-size:14px}
.legal h3{font-size:17px;margin:20px 0 6px}.legal ul{padding-left:22px;margin:0 0 12px}
.legal li{font-size:16px;color:#3a3a42;margin:4px 0}.legal .updated{color:#888;font-size:14px;margin:-8px 0 24px}
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

def lp(lang):
    if lang == DEFAULT_LANG:
        return f"{BASE}/" if BASE else "/"
    return f"{BASE}/{lang}/"

BLOG_SRC = os.path.join(ROOT, "..", "seo")
FROM_BLOG_PAIRS = ["budget", "ai-budget", "family", "shared-budget", "bank-import", "best-apps", "saving"]  # curated homepage -> article internal links (USP + high-intent topics first)

def _blog_front(path):
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---", raw, re.S)
    meta = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta

def read_blog_index():
    """Map (lang, pair) -> (slug, title) from the blog markdown so the landing can link real articles."""
    idx = {}
    for p in glob.glob(os.path.join(BLOG_SRC, "*.md")) + glob.glob(os.path.join(BLOG_SRC, "*", "*.md")):
        if os.sep + "site" + os.sep in p:
            continue
        m = _blog_front(p)
        if m.get("slug") and m.get("lang") and m.get("pair"):
            idx[(m["lang"], m["pair"])] = (m["slug"], m.get("title", m["slug"]))
    return idx

BLOG_IDX = read_blog_index()

_CONSENT_TPL = ('<div class="cc" id="cc"><p>__TXT__</p><div class="row">'
                '<button class="no" id="cc-no">__NO__</button>'
                '<button class="ok" id="cc-ok">__OK__</button></div></div>\n'
                '<script>(function(){var ID="__GA__",K="cc-consent";'
                'function L(){var s=document.createElement("script");s.async=1;'
                's.src="https://www.googletagmanager.com/gtag/js?id="+ID;document.head.appendChild(s);'
                'window.dataLayer=window.dataLayer||[];function g(){dataLayer.push(arguments);}'
                'window.gtag=g;g("js",new Date());g("config",ID);}'
                'var v=localStorage.getItem(K),b=document.getElementById("cc");'
                'if(v==="granted"){L();}else if(!v&&b){b.classList.add("show");'
                'document.getElementById("cc-ok").onclick=function(){localStorage.setItem(K,"granted");b.classList.remove("show");L();};'
                'document.getElementById("cc-no").onclick=function(){localStorage.setItem(K,"denied");b.classList.remove("show");};}'
                '})();</script>')

def consent_html(lang):
    txt, ok, no = CONSENT.get(lang, CONSENT["en"])
    txt_html = (html.escape(txt) + f' <a href="{cookies_url(lang)}" style="color:#F58320">'
                f'{html.escape(MORE.get(lang, MORE["en"]))}</a>')
    return (_CONSENT_TPL.replace("__TXT__", txt_html).replace("__OK__", html.escape(ok))
            .replace("__NO__", html.escape(no)).replace("__GA__", GA_ID))

def footer_html(lang):
    t = C[lang]
    blog = f"/blog/{lang}/"
    pl, tl, cl = LEGAL_LABELS[lang]
    return (f'<footer><div class="wrap"><div class="f-links">'
            f'<a href="{blog}">{t["nav_blog"]}</a>'
            f'<a href="{pricing_url(lang)}">{PRICING_LABELS[lang]}</a>'
            f'<a href="/help/{lang}/">{HELP_LABELS[lang]}</a>'
            f'<a href="{about_url(lang)}">{ABOUT_LABELS[lang]}</a>'
            f'<a href="{priv_url(lang)}">{pl}</a><a href="{terms_url(lang)}">{tl}</a>'
            f'<a href="{cookies_url(lang)}">{cl}</a>'
            f'<a href="{APP}">{t["nav_login"]}</a><a href="{PLAY}">Google Play</a></div>'
            f'<div class="f-co"><a href="{COMPANY_URL}" target="_blank" rel="noopener">'
            f'<img src="{BASE}/assets/mi_code_logo.svg" alt="{COMPANY}" width="30" height="30"></a>'
            f'<span>&copy; {YEAR} AI Budget Assistant &mdash; '
            f'<a href="{COMPANY_URL}" target="_blank" rel="noopener" style="color:inherit">{COMPANY}</a>. '
            f'{html.escape(t["rights"])}</span></div></div></footer>')

def cookies_page(lang):
    L = lang if lang in COOKIES else "en"
    title, meta, h1, body = COOKIES[L]
    body = body.replace("__PRIV__", priv_url(lang)).replace("__TERMS__", terms_url(lang)).replace("__MAIL__", SUPPORT_EMAIL)
    url = SITE + cookies_url(lang)
    alts = [("pl", f"{SITE}/cookies/"), ("en", f"{SITE}/en/cookies/"), ("x-default", f"{SITE}/en/cookies/")]
    alt_tags = "".join(f'<link rel="alternate" hreflang="{hl}" href="{href}">' for hl, href in alts)
    return (f'<!DOCTYPE html><html lang="{lang}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>{html.escape(title)}</title><meta name="description" content="{html.escape(meta)}">'
            f'<link rel="canonical" href="{url}"><meta name="robots" content="{ROBOTS}">{alt_tags}'
            f'<style>{CSS}</style></head><body>'
            f'<header><div class="wrap"><a class="brand" href="{lp(lang)}">AI <span>Budget</span> Assistant</a>'
            f'<nav class="nav"><a href="{cookies_url(lang)}">{LEGAL_LABELS[lang][2]}</a>'
            f'<a class="btn p" href="{APP}">{C[lang]["nav_login"]}</a></nav></div></header>'
            f'<main class="wrap legal"><h1>{html.escape(h1)}</h1>{body}</main>'
            + footer_html(lang) + consent_html(lang) + '</body></html>')

def about_page(lang):
    L = lang if lang in ABOUT else "en"
    title, meta, h1, body = ABOUT[L]
    url = SITE + about_url(lang)
    alts = [(l, SITE + about_url(l)) for l in LANG_NAMES if l in ABOUT] + [("x-default", SITE + about_url("en"))]
    alt_tags = "".join(f'<link rel="alternate" hreflang="{hl}" href="{href}">' for hl, href in alts)
    return (f'<!DOCTYPE html><html lang="{lang}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>{html.escape(title)}</title><meta name="description" content="{html.escape(meta)}">'
            f'<link rel="canonical" href="{url}"><meta name="robots" content="{ROBOTS}">{alt_tags}'
            f'<style>{CSS}</style></head><body>'
            f'<header><div class="wrap"><a class="brand" href="{lp(lang)}">AI <span>Budget</span> Assistant</a>'
            f'<nav class="nav"><a href="{about_url(lang)}">{ABOUT_LABELS[lang]}</a>'
            f'<a class="btn p" href="{APP}">{C[lang]["nav_login"]}</a></nav></div></header>'
            f'<main class="wrap legal"><h1>{html.escape(h1)}</h1>{body}</main>'
            + footer_html(lang) + consent_html(lang) + '</body></html>')

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

def jsonld(lang, langs):
    t = C[lang]; url = SITE + lp(lang)
    og = f"{SITE}/blog/{lang}/assets/og-default.png"
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "WebSite", "name": "AI Budget Assistant", "url": url, "inLanguage": lang},
        {"@type": "Organization", "name": COMPANY, "url": COMPANY_URL,
         "logo": {"@type": "ImageObject", "url": f"{SITE}{BASE}/assets/mi_code_logo.svg"}, "sameAs": SAMEAS},
        {"@type": "SoftwareApplication", "name": "AI Budget Assistant", "applicationCategory": "FinanceApplication",
         "operatingSystem": "Android, Web", "inLanguage": lang, "url": url, "image": og,
         "downloadUrl": PLAY, "sameAs": [PLAY],
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
         "featureList": [
             "Voice expense capture via AI transcription",
             "Receipt scanning with OCR",
             "Bank notification auto-capture (Android, 40+ European banks)",
             "Bank statement import: Wise, mBank, PKO BP, Revolut, Erste, Alior, CSV",
             "AI chat assistant for natural language financial questions",
             "Shared family accounts with role-based access",
             "Category budgets with period tracking and overspend alerts",
             "Savings goals with contribution history",
             "Subscription manager with renewal reminders",
             "Telegram, WhatsApp and Slack bots",
             "Offline-first with end-to-end encryption",
             "Multi-currency: USD, EUR, PLN, GBP, UAH, RUB",
             "9 interface languages",
             "Safe-to-spend daily limit calculation",
             "Spending anomaly detection",
         ],
         "screenshot": [
             {"@type": "ImageObject", "url": f"{SITE}/assets/screens/{lang}/01-home.png", "name": "Home dashboard"},
             {"@type": "ImageObject", "url": f"{SITE}/assets/screens/{lang}/02-ai-chat.png", "name": "AI assistant"},
             {"@type": "ImageObject", "url": f"{SITE}/assets/screens/{lang}/03-receipt-scan.png", "name": "Receipt scanning"},
             {"@type": "ImageObject", "url": f"{SITE}/assets/screens/{lang}/04-analytics.png", "name": "Spending analytics"},
             {"@type": "ImageObject", "url": f"{SITE}/assets/screens/{lang}/05-budget-detail.png", "name": "Budget tracking"},
             {"@type": "ImageObject", "url": f"{SITE}/assets/screens/{lang}/06-bank-import.png", "name": "Bank import"},
         ]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in t["faq"]]},
    ]}

def head(lang, langs):
    t = C[lang]; url = SITE + lp(lang)
    alts = "".join(f'<link rel="alternate" hreflang="{l}" href="{SITE+lp(l)}">' for l in langs)
    alts += f'<link rel="alternate" hreflang="x-default" href="{SITE + (lp("en") if "en" in langs else lp(lang))}">'
    og = f"{SITE}/blog/{lang}/assets/og-default.png"
    return f"""<!DOCTYPE html><html lang="{lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(t['title'])}</title>
<meta name="description" content="{html.escape(t['desc'])}">
<link rel="canonical" href="{url}"><meta name="robots" content="{ROBOTS}">
<meta property="og:type" content="website"><meta property="og:site_name" content="AI Budget Assistant">
<meta property="og:locale" content="{LOCALE[lang]}"><meta property="og:title" content="{html.escape(t['title'])}">
<meta property="og:description" content="{html.escape(t['desc'])}"><meta property="og:url" content="{url}"><meta property="og:image" content="{og}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{html.escape(t['title'])}">
<meta name="twitter:description" content="{html.escape(t['desc'])}"><meta name="twitter:image" content="{og}">
{alts}
<script type="application/ld+json">{json.dumps(jsonld(lang, langs), ensure_ascii=False)}</script>
<style>{CSS}</style></head><body>"""

def page(lang, langs):
    t = C[lang]
    blog = f"/blog/{lang}/"
    langlinks = "".join(f'<a class="{"active" if l==lang else ""}" href="{lp(l)}">{LANG_NAMES[l]}</a>' for l in langs)
    langmenu = f'<details class="langmenu"><summary><span class="lang-full">{LANG_NAMES[lang]}</span><span class="lang-short">{lang.upper()}</span> &#9662;</summary><div class="langlist">{langlinks}</div></details>'
    cards, lbs = "", ""
    for i, (h, p, shot) in enumerate(t["features"]):
        cid = f"cb{i+1}"
        cards += (f'<label class="card" for="{cid}"><div class="ic"><b>{i+1}</b></div>'
                  f'<h3>{html.escape(h)}</h3><p>{html.escape(p)}</p>'
                  f'<span class="see">{html.escape(t["see"])} &rarr;</span></label>')
        lbs += (f'<input class="lbcb" type="checkbox" id="{cid}">'
                f'<div class="lb"><label class="bg" for="{cid}"></label><label class="x" for="{cid}">&times;</label>'
                f'<img loading="lazy" src="{BASE}/assets/screens/{lang}/{shot}" alt="{html.escape(h)} - AI Budget Assistant"></div>')
    faq = "".join(f'<div class="qa"><h3>{html.escape(q)}</h3><p>{html.escape(a)}</p></div>' for q, a in t["faq"])
    fb = "".join(
        f'<li><a href="/blog/{lang}/{BLOG_IDX[(lang, pr)][0]}/">{html.escape(BLOG_IDX[(lang, pr)][1])}</a></li>'
        for pr in FROM_BLOG_PAIRS if (lang, pr) in BLOG_IDX)
    fromblog_sec = (f'<section class="sec"><div class="wrap"><h2>{html.escape(FROM_BLOG_TITLE.get(lang, FROM_BLOG_TITLE["en"]))}</h2>'
                    f'<ul class="fromblog">{fb}</ul></div></section>') if fb else ""
    return (head(lang, langs)
        + f'<header><div class="wrap"><a class="brand" href="{lp(lang)}">AI <span>Budget</span> Assistant</a>'
          f'<nav class="nav">{langmenu}<a href="{blog}">{t["nav_blog"]}</a>'
          f'<a class="btn p" href="{APP}">{t["nav_login"]}</a></nav></div></header>'
        + f'<section class="hero"><div class="wrap"><h1>{html.escape(t["hero_h1"])}</h1>'
          f'<p>{html.escape(t["hero_sub"])}</p><a class="btn p" href="{APP}">{t["cta_primary"]}</a>'
          f'<a class="btn s" href="{PLAY}">{t["cta_secondary"]}</a></div></section>'
        + f'<section class="sec intro"><div class="wrap"><h2>{html.escape(t["intro_title"])}</h2>'
          f'<p>{html.escape(t["intro"])}</p></div></section>'
        + f'<section class="sec"><div class="wrap"><h2>{html.escape(t["features_title"])}</h2>'
          f'<p class="hint">{html.escape(t["features_hint"])}</p><div class="grid">{cards}</div></div></section>'
        + f'<section class="sec"><div class="wrap"><h2>{html.escape(t["faq_title"])}</h2><div class="faq">{faq}</div></div></section>'
        + fromblog_sec
        + f'<div class="blogcta"><a href="{blog}">{t["blog_cta"]} &rarr;</a></div>'
        + f'<section class="band"><div class="wrap"><h2>{html.escape(t["cta_band"])}</h2>'
          f'<a class="btn p" href="{APP}">{t["cta_band_btn"]}</a></div></section>'
        + footer_html(lang)
        + lbs + consent_html(lang) + '</body></html>')

def copy_assets(langs):
    shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(OUT, "assets"), dirs_exist_ok=True)
    for lang in langs:
        dst = os.path.join(OUT, "assets", "screens", lang)
        os.makedirs(dst, exist_ok=True)
        for shot in {s for _, _, s in C[lang]["features"]}:
            base = os.path.splitext(shot)[0]
            src = next((os.path.join(FEAT, L, base + ".jpg") for L in (lang, "en", "pl")
                        if os.path.exists(os.path.join(FEAT, L, base + ".jpg"))), None)
            if not src:
                print("  MISSING screenshot:", lang, shot); continue
            img = Image.open(src).convert("RGB")
            nw = 540; nh = round(img.height * nw / img.width)
            img.resize((nw, nh), Image.LANCZOS).save(os.path.join(dst, shot), "PNG", optimize=True)

def legal_page(lang, kind):
    L = "pl" if lang == "pl" else "en"
    body = open(os.path.join(LEGAL_DIR, L, kind + ".html"), encoding="utf-8").read()
    title, meta = LEGAL_TITLES[kind][L], LEGAL_DESC[kind][L]
    self_url = priv_url(lang) if kind == "privacy" else terms_url(lang)
    url = SITE + self_url
    pl_path = "/privacy/" if kind == "privacy" else "/terms/"
    en_path = "/en/privacy/" if kind == "privacy" else "/en/terms/"
    alts = [("pl", SITE + pl_path), ("en", SITE + en_path), ("x-default", SITE + en_path)]
    alt_tags = "".join(f'<link rel="alternate" hreflang="{hl}" href="{href}">' for hl, href in alts)
    return (f'<!DOCTYPE html><html lang="{lang}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>{html.escape(title)}</title><meta name="description" content="{html.escape(meta)}">'
            f'<link rel="canonical" href="{url}"><meta name="robots" content="{ROBOTS}">{alt_tags}'
            f'<style>{CSS}</style></head><body>'
            f'<header><div class="wrap"><a class="brand" href="{lp(lang)}">AI <span>Budget</span> Assistant</a>'
            f'<nav class="nav"><a class="btn p" href="{APP}">{C[lang]["nav_login"]}</a></nav></div></header>'
            f'<main class="wrap legal">{body}</main>'
            + footer_html(lang) + consent_html(lang) + '</body></html>')

def build():
    shutil.rmtree(OUT, ignore_errors=True)
    langs = list(C.keys())
    copy_assets(langs)
    for lang in langs:
        d = OUT if lang == DEFAULT_LANG else os.path.join(OUT, lang)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(page(lang, langs))
    # Cookie Policy pages (pl + en; other languages link to /en/cookies/)
    for lang in ("pl", "en"):
        d = os.path.join(OUT, "cookies") if lang == "pl" else os.path.join(OUT, "en", "cookies")
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(cookies_page(lang))
    # About page (all 9 languages)
    for lang in [l for l in LANG_NAMES if l in ABOUT]:
        sub = "about" if lang == "pl" else os.path.join(lang, "about")
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(about_page(lang))
    # Pricing page (all 9 languages)
    for lang in [l for l in LANG_NAMES if l in PRICING]:
        sub = "pricing" if lang == "pl" else os.path.join(lang, "pricing")
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(pricing_page(lang))
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(pricing_page(lang))
    # Privacy + Terms pages (pl + en), copied on-domain from the GitHub Pages legal docs
    for kind in ("privacy", "terms"):
        for lang in ("pl", "en"):
            sub = kind if lang == "pl" else os.path.join("en", kind)
            d = os.path.join(OUT, sub)
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(legal_page(lang, kind))

    # Google OAuth relay for native Android sign-in (ABA-282): Google Console only
    # accepts HTTPS redirect URIs, so Google redirects here, and this page JS-forwards
    # the id_token (returned in the URL fragment) to budget://oauth?... — a
    # navigation->intent that Chrome Custom Tab dispatches reliably. Always emitted
    # (the redirect_uri is hardcoded to https://ai-budget.pl/oauth/callback).
    d = os.path.join(OUT, "oauth", "callback")
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(
        '<!DOCTYPE html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="robots" content="noindex, nofollow"><title>Signing in...</title>'
        '<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;'
        'display:flex;flex-direction:column;align-items:center;justify-content:center;'
        'height:100vh;margin:0;background:#000;color:#fff;text-align:center}'
        'p{opacity:.7;font-size:16px}'
        'a{display:none;margin-top:18px;padding:12px 22px;background:#F58320;color:#fff;'
        'text-decoration:none;border-radius:10px;font-weight:700;font-size:16px}</style></head>'
        '<body><p id="m">Signing in, please wait...</p>'
        '<a id="b" href="#">Open the app</a><script>'
        "var h=window.location.hash.replace(/^#/,'');"
        "var s=window.location.search.replace(/^\\?/,'');"
        "var p=h||s;"
        "if(p){var t='budget://oauth?'+p;var b=document.getElementById('b');b.href=t;"
        # Auto-redirect first; if the Custom Tab blocks the JS navigation to the
        # custom scheme (some Chrome versions require a user gesture), reveal the
        # button so the user can tap to finish.
        "window.location.replace(t);"
        "setTimeout(function(){b.style.display='inline-block';"
        "document.getElementById('m').textContent='Tap to finish signing in';},1200);}"
        '</script></body></html>\n')

    # apex cutover build (BASE==""): emit sitemap.xml (landing + blog) + robots.txt
    if not BASE:
        urls = [SITE + lp(l) for l in langs]
        blog_sm = os.path.join(ROOT, "..", "seo", "site", "sitemap.xml")
        if os.path.exists(blog_sm):
            for loc in re.findall(r"<loc>([^<]+)</loc>", open(blog_sm, encoding="utf-8").read()):
                if "/blog/" in loc:
                    urls.append(loc)
        help_sm = os.path.join(ROOT, "..", "help", "site", "sitemap.xml")
        if os.path.exists(help_sm):
            for loc in re.findall(r"<loc>([^<]+)</loc>", open(help_sm, encoding="utf-8").read()):
                if "/help/" in loc:
                    urls.append(loc)
        urls += [SITE + about_url(l) for l in LANG_NAMES if l in ABOUT]  # About (9 langs)
        urls += [SITE + pricing_url(l) for l in LANG_NAMES if l in PRICING]  # Pricing (9 langs)
        for k in ("cookies", "privacy", "terms"):                        # legal (pl + en)
            urls += [f"{SITE}/{k}/", f"{SITE}/en/{k}/"]
        sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for u in urls:
            sm.append(f'<url><loc>{u}</loc><lastmod>{PUBLISH_DATE}</lastmod>'
                      f'<priority>{"1.0" if u == SITE + "/" else "0.7"}</priority></url>')
        sm.append('</urlset>')
        open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(sm))
        open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8", newline="\n").write(
            f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
        open(os.path.join(OUT, "llms.txt"), "w", encoding="utf-8", newline="\n").write(
            f"# AI Budget Assistant\n\n"
            f"> Free AI-powered budget app for individuals and families. "
            f"Track expenses by voice or receipt photo, plan budgets and savings goals, "
            f"manage subscriptions, import bank statements, and budget together in real time. "
            f"Multi-currency, 9 languages, Android and web.\n\n"
            f"## Product\n\n"
            f"- Name: AI Budget Assistant\n"
            f"- URL: {SITE}\n"
            f"- App: {APP}\n"
            f"- Google Play: {PLAY}\n"
            f"- Company: {COMPANY} ({COMPANY_URL})\n"
            f"- Launched: April 2026\n"
            f"- Pricing: Free core; Pro and Business subscription tiers\n"
            f"- Platforms: Android, Web\n"
            f"- Languages: English, Polish, German, Spanish, French, Russian, Ukrainian, Belarusian, Dutch\n"
            f"- Currencies: USD, EUR, PLN, GBP, UAH, RUB\n\n"
            f"## Key Features\n\n"
            f"- Voice expense capture: log expenses by speaking naturally, transcribed by AI\n"
            f"- Receipt scanning: photograph a receipt to extract amount, merchant and category via OCR\n"
            f"- Bank notification capture: Android app intercepts bank push notifications and creates expenses on-device (40+ European banks, no credentials required)\n"
            f"- Bank import: CSV and PDF statements from Wise, mBank, PKO BP, Revolut, Erste, Alior\n"
            f"- AI chat assistant: ask financial questions and give commands in natural language (GPT-4)\n"
            f"- Shared family accounts with owner/editor/viewer roles and live activity feed\n"
            f"- Group purchase voting and approval workflows\n"
            f"- Category budgets with history, alerts and period tracking\n"
            f"- Savings goals with contribution log\n"
            f"- Subscription manager with renewal reminders and auto-charge simulation\n"
            f"- Telegram, WhatsApp and Slack bots\n"
            f"- Offline-first architecture with end-to-end encryption\n"
            f"- Safe-to-spend engine: daily spendable amount from balance minus upcoming obligations\n"
            f"- Anomaly detection: duplicate charges, price increases, spending spikes\n\n"
            f"## Content\n\n"
            f"- Blog (9 languages): {SITE}/blog/en/\n"
            f"- Help center (9 languages): {SITE}/help/en/\n"
            f"- Sitemap: {SITE}/sitemap.xml\n"
        )
        open(os.path.join(OUT, "404.html"), "w", encoding="utf-8", newline="\n").write(
            '<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<meta name="robots" content="noindex"><title>404 - AI Budget Assistant</title>'
            '<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;'
            'min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;color:#1a1a1d}'
            '.box{padding:24px}h1{font-size:72px;margin:0;color:#F58320}p{color:#5b5b66;font-size:18px}'
            'a{color:#c96a12;font-weight:700;text-decoration:none;margin:0 10px}</style></head>'
            '<body><div class="box"><h1>404</h1><p>Strona nie znaleziona &middot; Page not found</p>'
            '<p><a href="/">Strona główna</a><a href="/blog/">Blog</a></p></div></body></html>\n')
    print(f"built SEO landing for {len(langs)} langs ({','.join(langs)}) BASE='{BASE}' ROBOTS='{ROBOTS}' -> {OUT}")

if __name__ == "__main__":
    build()
