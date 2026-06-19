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
import os, re, json, html, shutil
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
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1d;line-height:1.65}
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
@media(max-width:760px){.grid{grid-template-columns:1fr}.hero h1{font-size:34px}.hero p{font-size:17px}}
.card{display:block;padding:24px;border:1px solid #ececf0;border-radius:16px;background:#fff;transition:.15s;color:inherit;cursor:pointer}
.card:hover{border-color:#F58320;box-shadow:0 8px 24px rgba(245,131,42,.12);transform:translateY(-2px)}
.card .ic{width:42px;height:42px;border-radius:11px;background:#fff3e6;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.card .ic b{color:#F58320;font-size:20px}.card h3{margin:0 0 8px;font-size:18px}.card p{margin:0;color:#5b5b66;font-size:15px}
.card .see{display:inline-block;margin-top:12px;color:#c96a12;font-weight:700;font-size:14px}
.faq{max-width:760px;margin:30px auto 0}.faq .qa{padding:18px 0;border-bottom:1px solid #ececf0}
.faq h3{margin:0 0 6px;font-size:18px}.faq p{margin:0;color:#5b5b66;font-size:16px}
.blogcta{text-align:center;padding:0 0 60px}.blogcta a{color:#c96a12;font-weight:700;font-size:16px}
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
"""

def lp(lang):
    if lang == DEFAULT_LANG:
        return f"{BASE}/" if BASE else "/"
    return f"{BASE}/{lang}/"

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
    blog = f"/blog/{lang if lang in ('en', 'pl') else 'en'}/"
    pl, tl, cl = LEGAL_LABELS[lang]
    return (f'<footer><div class="wrap"><div class="f-links">'
            f'<a href="{blog}">{t["nav_blog"]}</a>'
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
            f'<header><div class="wrap"><a class="brand" href="/">AI <span>Budget</span> Assistant</a>'
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
            f'<header><div class="wrap"><a class="brand" href="/">AI <span>Budget</span> Assistant</a>'
            f'<nav class="nav"><a href="{about_url(lang)}">{ABOUT_LABELS[lang]}</a>'
            f'<a class="btn p" href="{APP}">{C[lang]["nav_login"]}</a></nav></div></header>'
            f'<main class="wrap legal"><h1>{html.escape(h1)}</h1>{body}</main>'
            + footer_html(lang) + consent_html(lang) + '</body></html>')

def jsonld(lang, langs):
    t = C[lang]; url = SITE + lp(lang)
    og = f"{SITE}/blog/{lang if lang in ('en','pl') else 'en'}/assets/og-default.png"
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "WebSite", "name": "AI Budget Assistant", "url": url, "inLanguage": lang},
        {"@type": "Organization", "name": COMPANY, "url": COMPANY_URL,
         "logo": {"@type": "ImageObject", "url": f"{SITE}{BASE}/assets/mi_code_logo.svg"}, "sameAs": SAMEAS},
        {"@type": "SoftwareApplication", "name": "AI Budget Assistant", "applicationCategory": "FinanceApplication",
         "operatingSystem": "Android, Web", "inLanguage": lang, "url": url, "image": og,
         "downloadUrl": PLAY, "sameAs": [PLAY],
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in t["faq"]]},
    ]}

def head(lang, langs):
    t = C[lang]; url = SITE + lp(lang)
    alts = "".join(f'<link rel="alternate" hreflang="{l}" href="{SITE+lp(l)}">' for l in langs)
    alts += f'<link rel="alternate" hreflang="x-default" href="{SITE + (lp("en") if "en" in langs else lp(lang))}">'
    og = f"{SITE}/blog/{lang if lang in ('en','pl') else 'en'}/assets/og-default.png"
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
    blog = f"/blog/{lang if lang in ('en','pl') else 'en'}/"
    langlinks = "".join(f'<a class="{"active" if l==lang else ""}" href="{lp(l)}">{LANG_NAMES[l]}</a>' for l in langs)
    langmenu = f'<details class="langmenu"><summary>{LANG_NAMES[lang]} &#9662;</summary><div class="langlist">{langlinks}</div></details>'
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
            f'<header><div class="wrap"><a class="brand" href="/">AI <span>Budget</span> Assistant</a>'
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
    # Privacy + Terms pages (pl + en), copied on-domain from the GitHub Pages legal docs
    for kind in ("privacy", "terms"):
        for lang in ("pl", "en"):
            sub = kind if lang == "pl" else os.path.join("en", kind)
            d = os.path.join(OUT, sub)
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(legal_page(lang, kind))

    # apex cutover build (BASE==""): emit sitemap.xml (landing + blog) + robots.txt
    if not BASE:
        urls = [SITE + lp(l) for l in langs]
        blog_sm = os.path.join(ROOT, "..", "seo", "site", "sitemap.xml")
        if os.path.exists(blog_sm):
            for loc in re.findall(r"<loc>([^<]+)</loc>", open(blog_sm, encoding="utf-8").read()):
                if "/blog/" in loc:
                    urls.append(loc)
        sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for u in urls:
            sm.append(f'<url><loc>{u}</loc><lastmod>{PUBLISH_DATE}</lastmod>'
                      f'<priority>{"1.0" if u == SITE + "/" else "0.7"}</priority></url>')
        sm.append('</urlset>')
        open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(sm))
        open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8", newline="\n").write(
            f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
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
