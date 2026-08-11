# -*- coding: utf-8 -*-
"""
Organize raw Play Store screenshots into per-language folders and render
2026-style marketing screenshots (headline + floating device + glow).

Usage:
    python build_store_assets.py organize
    python build_store_assets.py marketing en ru
    python build_store_assets.py all en
"""
import os, sys, shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # docs/marketing
SRC = os.path.join(ROOT, "feature_graphics")
BYLANG = os.path.join(SRC, "by-language")
OUT = os.path.join(SRC, "marketing")

SCREENS = ["01-home", "02-ai-chat", "03-receipt-scan", "04-analytics",
           "05-budget-detail", "06-bank-import", "07-subscriptions"]

# screen -> lang -> source filename
FILES = {
 "01-home": {
   "ru":"Screenshot_20260615_225051_AI Budget Assistant.jpg",
   "en":"Screenshot_20260615_225106_AI Budget Assistant.jpg",
   "pl":"Screenshot_20260615_225131_AI Budget Assistant.jpg",
   "es":"Screenshot_20260615_225142_AI Budget Assistant.jpg",
   "fr":"Screenshot_20260615_225155_AI Budget Assistant.jpg",
   "de":"Screenshot_20260615_225206_AI Budget Assistant.jpg",
   "be":"Screenshot_20260615_225217_AI Budget Assistant.jpg",
   "nl":"Screenshot_20260615_225225_AI Budget Assistant.jpg",
 },
 "02-ai-chat": {
   "en":"Screenshot_20260617_082732_AI Budget Assistant.jpg",
   "ru":"Screenshot_20260617_082804_AI Budget Assistant.jpg",
   "ua":"Screenshot_20260617_082849_AI Budget Assistant.jpg",
   "pl":"Screenshot_20260618_210037_AI Budget Assistant.jpg",
   "es":"Screenshot_20260618_210106_AI Budget Assistant.jpg",
   "fr":"Screenshot_20260618_210133_AI Budget Assistant.jpg",
   "de":"Screenshot_20260618_210200_AI Budget Assistant.jpg",
   "be":"Screenshot_20260618_210246_AI Budget Assistant.jpg",
   "nl":"Screenshot_20260618_211104_AI Budget Assistant.jpg",
 },
 "03-receipt-scan": {
   "en":"Screenshot_20260618_214400_AI Budget Assistant.jpg",
   "ru":"Screenshot_20260618_214422_AI Budget Assistant.jpg",
   "ua":"Screenshot_20260618_214435_AI Budget Assistant.jpg",
   "pl":"Screenshot_20260618_214449_AI Budget Assistant.jpg",
   "es":"Screenshot_20260618_214502_Photos & videos.jpg",
   "fr":"Screenshot_20260618_214520_AI Budget Assistant.jpg",
   "de":"Screenshot_20260618_214530_AI Budget Assistant.jpg",
   "be":"Screenshot_20260618_214544_AI Budget Assistant.jpg",
   "nl":"Screenshot_20260618_214555_AI Budget Assistant.jpg",
 },
 "04-analytics": {
   "en":"Screenshot_20260618_215433_AI Budget Assistant.jpg",
   "ru":"Screenshot_20260618_215449_AI Budget Assistant.jpg",
   "ua":"Screenshot_20260618_215504_AI Budget Assistant.jpg",
   "pl":"Screenshot_20260618_215518_AI Budget Assistant.jpg",
   "es":"Screenshot_20260618_215541_AI Budget Assistant.jpg",
   "fr":"Screenshot_20260618_215553_AI Budget Assistant.jpg",
   "de":"Screenshot_20260618_215607_AI Budget Assistant.jpg",
   "be":"Screenshot_20260618_215633_AI Budget Assistant.jpg",
   "nl":"Screenshot_20260618_215648_AI Budget Assistant.jpg",
 },
 "05-budget-detail": {
   "en":"Screenshot_20260618_215733_AI Budget Assistant.jpg",
   "ru":"Screenshot_20260618_215753_AI Budget Assistant.jpg",
   "ua":"Screenshot_20260618_215805_AI Budget Assistant.jpg",
   "pl":"Screenshot_20260618_215815_AI Budget Assistant.jpg",
   "es":"Screenshot_20260618_215840_AI Budget Assistant.jpg",
   "fr":"Screenshot_20260618_215851_AI Budget Assistant.jpg",
   "de":"Screenshot_20260618_215901_AI Budget Assistant.jpg",
   "be":"Screenshot_20260618_215914_AI Budget Assistant.jpg",
   "nl":"Screenshot_20260618_215925_AI Budget Assistant.jpg",
 },
 "06-bank-import": {
   "en":"Screenshot_20260618_215953_AI Budget Assistant.jpg",
   "ru":"Screenshot_20260618_220010_AI Budget Assistant.jpg",
   "ua":"Screenshot_20260618_220021_AI Budget Assistant.jpg",
   "pl":"Screenshot_20260618_220034_AI Budget Assistant.jpg",
   "es":"Screenshot_20260618_220053_AI Budget Assistant.jpg",
   "fr":"Screenshot_20260618_220107_AI Budget Assistant.jpg",
   "de":"Screenshot_20260618_220118_AI Budget Assistant.jpg",
   "be":"Screenshot_20260618_220137_AI Budget Assistant.jpg",
   "nl":"Screenshot_20260618_220151_AI Budget Assistant.jpg",
 },
 "07-subscriptions": {
   "en":"Screenshot_20260618_220234_AI Budget Assistant.jpg",
   "ru":"Screenshot_20260618_220309_AI Budget Assistant.jpg",
   "ua":"Screenshot_20260618_220322_AI Budget Assistant.jpg",
   "pl":"Screenshot_20260618_221817_AI Budget Assistant.jpg",
   "es":"Screenshot_20260618_221837_AI Budget Assistant.jpg",
   "fr":"Screenshot_20260618_221857_AI Budget Assistant.jpg",
   "de":"Screenshot_20260618_221909_AI Budget Assistant.jpg",
   "be":"Screenshot_20260618_221929_AI Budget Assistant.jpg",
   "nl":"Screenshot_20260618_221947_AI Budget Assistant.jpg",
 },
}

# lang -> screen -> (headline, subtitle)
COPY = {
 "en": {
   "01-home":        ("Your whole financial life, one app", "Expenses, budgets, goals - together with family"),
   "02-ai-chat":     ("Just ask. The AI answers", "Questions in plain language, instant answers"),
   "03-receipt-scan":("Snap a receipt - done", "AI reads the items, total and merchant"),
   "04-analytics":   ("See where your money goes", "Trends, categories and AI insights"),
   "05-budget-detail":("Budgets you actually keep", "Track every budget with full history"),
   "06-bank-import": ("Import your bank in seconds", "Wise and Polish banks - CSV or PDF"),
   "07-subscriptions":("Never miss a renewal", "A calendar that keeps your subscriptions in check"),
 },
 "ru": {
   "01-home":        ("Все финансы - в одном приложении", "Расходы, бюджеты и цели - вместе с семьёй"),
   "02-ai-chat":     ("Просто спросите - AI ответит", "Вопрос обычными словами - мгновенный ответ"),
   "03-receipt-scan":("Сфотографировал чек - готово", "AI распознает товары, сумму и продавца"),
   "04-analytics":   ("Видно, куда уходят деньги", "Тренды, категории и AI-инсайты"),
   "05-budget-detail":("Бюджеты под контролем", "История по каждому периоду"),
   "06-bank-import": ("Импорт из банка за секунды", "Wise и польские банки - CSV или PDF"),
   "07-subscriptions":("Не пропустите ни одного списания", "Календарь подписок всегда впереди"),
 },
 "pl": {
   "01-home":        ("Całe Twoje finanse w jednej aplikacji", "Wydatki, budżety i cele - razem z rodziną"),
   "02-ai-chat":     ("Po prostu zapytaj - AI odpowie", "Pytania zwykłym językiem, natychmiastowe odpowiedzi"),
   "03-receipt-scan":("Zeskanuj paragon - gotowe", "AI odczyta pozycje, kwotę i sprzedawcę"),
   "04-analytics":   ("Zobacz, na co idą pieniądze", "Trendy, kategorie i analizy AI"),
   "05-budget-detail":("Budżety, których naprawdę pilnujesz", "Śledź każdy budżet z pełną historią"),
   "06-bank-import": ("Zaimportuj bank w kilka sekund", "Wise i polskie banki - CSV lub PDF"),
   "07-subscriptions":("Nie przegap żadnej płatności", "Kalendarz subskrypcji trzyma rękę na pulsie"),
 },
 "ua": {
   "01-home":        ("Усі фінанси в одному застосунку", "Витрати, бюджети й цілі - разом із родиною"),
   "02-ai-chat":     ("Просто запитайте - AI відповість", "Запитання звичайною мовою, миттєві відповіді"),
   "03-receipt-scan":("Сфотографуй чек - готово", "AI розпізнає товари, суму та продавця"),
   "04-analytics":   ("Видно, куди йдуть гроші", "Тренди, категорії та AI-аналітика"),
   "05-budget-detail":("Бюджети під контролем", "Стежте за кожним бюджетом з повною історією"),
   "06-bank-import": ("Імпорт із банку за секунди", "Wise і польські банки - CSV або PDF"),
   "07-subscriptions":("Не пропустіть жодного списання", "Календар підписок завжди напоготові"),
 },
 "es": {
   "01-home":        ("Toda tu vida financiera en una app", "Gastos, presupuestos y metas - en familia"),
   "02-ai-chat":     ("Solo pregunta - la IA responde", "Preguntas en lenguaje natural, respuestas al instante"),
   "03-receipt-scan":("Escanea un recibo y listo", "La IA lee los artículos, el total y el comercio"),
   "04-analytics":   ("Mira en qué se va tu dinero", "Tendencias, categorías e insights con IA"),
   "05-budget-detail":("Presupuestos que sí cumples", "Controla cada presupuesto con historial completo"),
   "06-bank-import": ("Importa tu banco en segundos", "Wise y bancos polacos - CSV o PDF"),
   "07-subscriptions":("No te pierdas ninguna renovación", "Un calendario que controla tus suscripciones"),
 },
 "fr": {
   "01-home":        ("Toute votre vie financière, une appli", "Dépenses, budgets et objectifs - en famille"),
   "02-ai-chat":     ("Demandez, l'IA répond", "Des questions en langage courant, des réponses instantanées"),
   "03-receipt-scan":("Scannez un reçu, c'est fait", "L'IA lit les articles, le total et le commerçant"),
   "04-analytics":   ("Voyez où part votre argent", "Tendances, catégories et analyses IA"),
   "05-budget-detail":("Des budgets que vous tenez vraiment", "Suivez chaque budget avec un historique complet"),
   "06-bank-import": ("Importez votre banque en quelques secondes", "Wise et banques polonaises - CSV ou PDF"),
   "07-subscriptions":("Ne manquez aucun renouvellement", "Un calendrier qui gère vos abonnements"),
 },
 "de": {
   "01-home":        ("Dein ganzes Finanzleben in einer App", "Ausgaben, Budgets und Ziele - mit der Familie"),
   "02-ai-chat":     ("Einfach fragen - die KI antwortet", "Fragen in normaler Sprache, sofortige Antworten"),
   "03-receipt-scan":("Beleg scannen - fertig", "Die KI erkennt Artikel, Betrag und Händler"),
   "04-analytics":   ("Sieh, wohin dein Geld fließt", "Trends, Kategorien und KI-Einblicke"),
   "05-budget-detail":("Budgets, die du wirklich einhältst", "Verfolge jedes Budget mit voller Historie"),
   "06-bank-import": ("Importiere deine Bank in Sekunden", "Wise und polnische Banken - CSV oder PDF"),
   "07-subscriptions":("Verpasse keine Abbuchung", "Ein Kalender, der deine Abos im Blick behält"),
 },
 "be": {
   "01-home":        ("Усе фінансы ў адным дадатку", "Выдаткі, бюджэты і мэты - разам з сям'ёй"),
   "02-ai-chat":     ("Проста спытайце - AI адкажа", "Пытанні звычайнай мовай, імгненныя адказы"),
   "03-receipt-scan":("Сфатаграфуй чэк - гатова", "AI распазнае тавары, суму і прадаўца"),
   "04-analytics":   ("Відаць, куды ідуць грошы", "Тэндэнцыі, катэгорыі і AI-аналітыка"),
   "05-budget-detail":("Бюджэты пад кантролем", "Сачыце за кожным бюджэтам з поўнай гісторыяй"),
   "06-bank-import": ("Імпарт з банка за секунды", "Wise і польскія банкі - CSV або PDF"),
   "07-subscriptions":("Не прапусціце ніводнага спісання", "Каляндар падпісак заўсёды напагатове"),
 },
 "nl": {
   "01-home":        ("Je hele financiële leven in één app", "Uitgaven, budgetten en doelen - samen met je gezin"),
   "02-ai-chat":     ("Vraag het gewoon - de AI antwoordt", "Vragen in gewone taal, directe antwoorden"),
   "03-receipt-scan":("Scan een bon - klaar", "De AI leest de items, het totaal en de winkel"),
   "04-analytics":   ("Zie waar je geld heen gaat", "Trends, categorieën en AI-inzichten"),
   "05-budget-detail":("Budgetten die je echt volhoudt", "Volg elk budget met volledige historie"),
   "06-bank-import": ("Importeer je bank in seconden", "Wise en Poolse banken - CSV of PDF"),
   "07-subscriptions":("Mis nooit een verlenging", "Een agenda die je abonnementen bewaakt"),
 },
}

# ---------- design ----------
W, H = 1080, 1920
MARGIN = 84
HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"
ORANGE = (245, 131, 42)
WHITE  = (250, 250, 252)
GREY   = (210, 212, 218)
DEV_W  = 752
DEV_TOP = 536
RADIUS = 58

def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def vgradient(c0, c1):
    base = Image.new("RGB", (W, H), c0)
    d = ImageDraw.Draw(base)
    for y in range(H):
        t = y / (H - 1)
        col = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=col)
    return base.convert("RGBA")

def glow(canvas, center, radii, color, alpha, blur):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center; rx, ry = radii
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(canvas, layer)

def round_img(img, r):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0]-1, img.size[1]-1], radius=r, fill=255)
    img = img.convert("RGBA"); img.putalpha(mask)
    return img

def build_one(src_path, headline, subtitle, out_path):
    canvas = vgradient((44, 28, 15), (11, 11, 14))
    canvas = glow(canvas, (540, 690), (560, 520), ORANGE, 165, 200)
    canvas = glow(canvas, (150, 1500), (380, 360), (255, 90, 60), 60, 220)
    draw = ImageDraw.Draw(canvas)

    # accent bar
    draw.rounded_rectangle([MARGIN, 120, MARGIN + 96, 130], radius=5, fill=ORANGE)

    # headline
    hf = ImageFont.truetype(HEAD_FONT, 76)
    y = 156
    for line in wrap(draw, headline, hf, W - 2*MARGIN):
        draw.text((MARGIN, y), line, font=hf, fill=WHITE)
        y += 90
    # subtitle
    sf = ImageFont.truetype(SUB_FONT, 34)
    y += 6
    for line in wrap(draw, subtitle, sf, W - 2*MARGIN - 40):
        draw.text((MARGIN, y), line, font=sf, fill=GREY)
        y += 46

    # device
    shot = Image.open(src_path).convert("RGB")
    dev_h = round(shot.height * DEV_W / shot.width)
    shot = shot.resize((DEV_W, dev_h), Image.LANCZOS)
    shot = round_img(shot, RADIUS)
    dx = (W - DEV_W) // 2
    dy = DEV_TOP

    # shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    blk = Image.new("RGBA", (DEV_W, dev_h), (0, 0, 0, 0))
    ImageDraw.Draw(blk).rounded_rectangle([0, 0, DEV_W-1, dev_h-1], radius=RADIUS, fill=(0, 0, 0, 170))
    shadow.alpha_composite(blk, (dx, dy + 34))
    shadow = shadow.filter(ImageFilter.GaussianBlur(48))
    canvas = Image.alpha_composite(canvas, shadow)

    canvas.alpha_composite(shot, (dx, dy))
    # device border
    ImageDraw.Draw(canvas).rounded_rectangle(
        [dx, dy, dx + DEV_W - 1, dy + dev_h - 1], radius=RADIUS, outline=(255, 255, 255, 48), width=4)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.convert("RGB").save(out_path, "PNG")

# ---------- commands ----------
def organize():
    n = 0
    for screen in SCREENS:
        for lang, fname in FILES[screen].items():
            src = os.path.join(SRC, fname)
            if not os.path.exists(src):
                print("  MISSING", fname); continue
            dst = os.path.join(BYLANG, lang, screen + ".jpg")
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst); n += 1
    print(f"organize: copied {n} files into {BYLANG}")

def marketing(langs):
    for lang in langs:
        if lang not in COPY:
            print(f"  no COPY for '{lang}', skipping"); continue
        for screen in SCREENS:
            if lang not in FILES[screen]:
                print(f"  {lang}/{screen}: no source, skipping"); continue
            src = os.path.join(SRC, FILES[screen][lang])
            head, sub = COPY[lang][screen]
            out = os.path.join(OUT, lang, screen + ".png")
            build_one(src, head, sub, out)
            print("  built", os.path.relpath(out, ROOT))

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    langs = sys.argv[2:] or ["en"]
    if cmd in ("organize", "all"):
        organize()
    if cmd in ("marketing", "all"):
        marketing(langs)
