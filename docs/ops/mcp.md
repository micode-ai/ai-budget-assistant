# MCP connector: enable, smoke, roll back

Assistants (Claude, ChatGPT and others) read a user's budget through `https://api.ai-budget.pl/mcp`
(MCP Streamable HTTP, stateless, read-only tools), authorised by the same OAuth server as the public API.
They find it on their own: `/.well-known/oauth-protected-resource/mcp` → `/.well-known/oauth-authorization-server`
→ dynamic client registration at `POST /oauth/register` → the consent page `app.ai-budget.pl/authorize`
(with `resource=https://api.ai-budget.pl/mcp`) → `/oauth/token`. A token bound to `/mcp` is refused by
`/public/v1`, and a public API token is refused by `/mcp`.

Flag: **`MCP_ENABLED`**, effective only when **`PUBLIC_API_ENABLED`** is also `true` (both trimmed, any case).
With either off, `/mcp`, `/oauth/register` and the three `/.well-known/oauth-*` documents answer 404 and the
public API is unchanged. Public API runbook: `docs/ops/public-api.md`. Design:
`docs/superpowers/specs/2026-11-12-mcp-connector-design.md`.

**Steps 1 and 2 were applied on 2026-11-13** (backups `ai-budget.conf.bak-mcp-202611131343` and
`.env.production.bak-mcp-*`). Step 3 (smoke) is not run; step 4 was run with Claude Code only (see the
wiki page's Known gaps); the launch gate and step 5 (help text) are still open.

## Prerequisites

- The release containing the MCP work is deployed (migrations applied by `scripts/deploy.sh`; the flag is still off).
- The public API is enabled and its nginx part is live (`docs/ops/public-api.md` steps 1–3): the `budget_public`
  zone exists and the `api.ai-budget.pl` server has `location /public/` and `location /oauth/`.
- A **test user** in production who owns (or edits) one non-encrypted account (E2EE tier below 2), not a real
  customer's account. You need its app JWT (`APP_TOKEN`; sign in on `app.ai-budget.pl`, copy the access token from
  the browser's storage) and the account id (`ACCOUNT_ID`). Each smoke run e-mails that user "app connected".
- Node 20+ on the machine that runs the smoke (no dependencies).
- A fresh `.env.production` backup.

## Enable sequence

### 1. nginx (shared-nginx; owner's OK required)

`shared-nginx` serves every project on the box. **Get the owner's explicit OK first, and only ever reload
gracefully — never recreate the container.** The snippet is `docker/nginx/api-mcp.conf`; read its header first.

Without it, `/mcp` most likely already reaches the API through the catch-all `location /` (zone `budget_api`,
10 MB body cap) and the `.well-known` paths may be swallowed by a dotfile rule. The snippet puts `/mcp` and the
discovery documents on the `budget_public` zone with a small body cap, and makes the `.well-known/oauth-` prefix
final (`^~`) so no regex location can catch it. `/oauth/register` is already covered by `location /oauth/`; do not
add a block for it.

1. Back up: `cp /opt/shared-nginx/conf.d/ai-budget.conf /opt/shared-nginx/conf.d/ai-budget.conf.bak-mcp-$(date +%Y%m%d%H%M)`.
2. Look at what is there: `grep -n 'location' /opt/shared-nginx/conf.d/ai-budget.conf` — confirm `location /public/`
   and `location /oauth/` exist in the `api.ai-budget.pl` server, and note any `well-known` or `location ~` lines.
3. Add the two blocks from `docker/nginx/api-mcp.conf` next to `location /public/`, above `location /`, **copying the
   proxy lines from the live `location /public/`** (keep only `limit_req` and `client_max_body_size` from the
   snippet). Edit in place (`cat new > file`), never `sed -i` (`docs/ops/api-rate-limit.md`).
4. `docker exec shared-nginx nginx -t` — must say `syntax is ok` and `test is successful`.
5. `docker exec shared-nginx nginx -s reload`; confirm the workers cycled (`docker exec shared-nginx ps` before and after).
6. Re-check every site on the box, and (flag still off) that the new paths reach the API:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://api.ai-budget.pl/.well-known/oauth-authorization-server   # 404 from the API (JSON body)
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.ai-budget.pl/mcp                              # 404 from the API
   curl -s -o /dev/null -w '%{http_code}\n' https://api.ai-budget.pl/api/v1/health                            # 200
   ```
   A 404 with an HTML body is nginx, not the API: the block is not matching.

Rollback of this step: copy the `.bak-mcp-*` file back, `nginx -t`, reload.

### 2. Flag

In `/opt/ai-budget/.env.production` set `MCP_ENABLED=true`. Leave `MCP_RESOURCE_URL`, `OAUTH_ISSUER` and
`OAUTH_AUTHORIZE_URL` unset unless the hostnames change (defaults: `https://api.ai-budget.pl/mcp`,
`https://api.ai-budget.pl`, `https://app.ai-budget.pl/authorize`; an invalid value is logged and the default used).
Then (`docker restart` does not reload `env_file`):

```bash
cd /opt/ai-budget
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
```

### 3. Smoke, both modes (from a workstation, not the VPS)

`scripts/mcp-smoke.mjs` takes credentials from the environment only and never prints a token, code or verifier.
Every step prints `PASS`/`FAIL` with the HTTP status (and at most an RFC error code); the exit code is 1 when any
step failed, and the summary names the failed steps. Unset `NODE_TLS_REJECT_UNAUTHORIZED` for the run (the script
refuses to send the JWT with certificate checks off). Keep the JWT out of shell history (leading space, or `read -s`).

```bash
export BASE=https://api.ai-budget.pl ACCOUNT_ID=<test account id>
read -rs APP_TOKEN && export APP_TOKEN          # paste the test user's app JWT

node scripts/mcp-smoke.mjs --public   # public API: no resource, against /public/v1/account
node scripts/mcp-smoke.mjs            # MCP: discovery, DCR, consent with resource, /mcp
unset APP_TOKEN
```

- `--public` creates a throwaway **public developer app** for the test user (a registered assistant may not be
  authorised without the MCP resource), approves with `expenses:read categories:read`, exchanges the code, reads
  `/public/v1/account`, checks `/mcp` refuses that token, refreshes, revokes, checks the token is dead, and deletes
  the developer app. This is the public API's first real end-to-end run in production.
- MCP mode fetches the three discovery documents, registers a client (`MCP smoke test`, loopback redirect), approves
  with `resource` and no scope (so the five default read scopes), exchanges the code, checks `/public/v1/account`
  refuses the MCP token (401), checks `/mcp` without a token answers 401 with the `resource_metadata` challenge, runs
  `initialize` + `tools/call list_accounts` (must contain `ACCOUNT_ID`), refreshes, repeats the call with the new
  token, revokes, and checks `/mcp` answers 401 `invalid_token`.
- Cleanup: the grant is always revoked, also after a failed step — including a failed token exchange after approve
  (the grant then exists with no token, so the script removes it through Connected apps) and Ctrl-C / SIGTERM (exit
  code 130 after cleanup). The DCR client stays: it cannot be deleted through the API. It is inert (no live token),
  and the daily cleanup cron soft-deletes it 30 days after its last grant was revoked (R8). The script prints its
  `client_id`; block it in admin, **API apps**, with reason "smoke test" if you want the list clean sooner.

The same flow runs in CI-less e2e form against a disposable database:
`cd apps/api && DATABASE_URL=... REDIS_URL=... npm run test:e2e -- mcp` (`apps/api/test/mcp.e2e-spec.ts`; skipped
without both URLs).

### 4. Manual check in two real clients — and the registration-IP launch gate

- **Claude** (claude.ai, Settings, Connectors, add a custom connector): URL `https://api.ai-budget.pl/mcp`. Claude
  registers itself, opens our consent page, and after approval lists the tools. Ask "what did I spend on groceries
  last month" and check the answer against the app.
- **ChatGPT** (a connector / developer-mode app with URL `https://api.ai-budget.pl/mcp`): the same.
- For each: the consent page shows the assistant's own name, the "registered by the assistant" note, the generic icon
  (never the assistant's logo) and **"Access will be sent to <host>"** naming the platform's own host; the account
  picker works at phone width and at ≥ 1024 on web; and disconnecting in the app's Connected apps cuts the assistant
  off on its next call. Record which redirect URIs each platform registered (admin, API apps).

**Launch gate (R12) — do not announce until this is settled.** Registration is limited to 10 per hour per client IP
(IPv6 per /64). If Claude or ChatGPT register from a shared platform egress rather than from the user's browser, every
user of that platform shares one bucket and the 11th connection in an hour gets a 429. During the two checks above,
record the **source IP of each registration** — from the shared-nginx access log, the requests to
`POST /oauth/register` at the time of the check:

```bash
docker logs --since 1h shared-nginx 2>&1 | grep 'POST /oauth/register' | awk '{print $1}' | sort | uniq -c
```

- If the IP is your own (the registration came from your browser or machine), the per-IP limit is fine as it is.
- If it is a platform's address (a cloud range, not yours), **raise the per-IP DCR limit or allow-list that platform's
  egress before announcing** — a code change to `DCR_REGISTRATIONS_PER_HOUR` in `apps/api/src/modules/oauth/oauth-register.service.ts`, shipped and
  verified like any other — and write the observed ranges into this runbook. The global ceiling (300/hour) still
  applies to everyone.

### 5. Publish the help section (paste the text below first)

The "Connect an AI assistant (MCP)" section is deliberately **not** in `user_docs/` while MCP is dark (R9):
`45-connected-apps` is registered and live, so the next `npm run generate:help` by any task would publish
instructions for a feature that answers 404. Paste it now, at launch:

1. In each of the nine files below, insert the section **immediately before the `## For developers` heading** (its
   translated equivalent: the last `##` section of the page), with one blank line before and after it.
2. If the consent page has changed since this text was written, bring step 2 of the text in line with what the page
   now shows (it currently also shows "Access will be sent to <host>").
3. Regenerate the in-app help and the public help center:

```bash
npm run generate:help
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/help/build_help.py
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
git add -f docs/marketing/help/site docs/marketing/landing/site   # docs/marketing is gitignored
```

Never run the two builders without those variables (the env-less build emits a `noindex` preview).

#### `user_docs/en/45-connected-apps.md` (English)

````markdown
## Connect an AI assistant (MCP)

You can let an AI assistant such as Claude or ChatGPT read your AI Budget data and answer questions like "what did I spend on groceries last month?".

1. In the assistant, add a custom connector (in Claude: **Settings → Connectors → Add custom connector**) and enter the address `https://api.ai-budget.pl/mcp`.
2. The assistant opens an AI Budget page where you sign in as usual. It shows the assistant's own name and the note **registered automatically by an AI assistant** — we have not checked such an assistant, so only connect one you started yourself. Tick the accounts it may use and tap **Allow**.
3. Ask your question in the assistant.

An assistant has **read-only** access: it can read expenses, income, categories, budgets and spending totals, but it cannot add, change or delete anything and it cannot download receipt photos. Accounts with full encryption cannot be connected, and text-encrypted accounts hide their encrypted text, exactly as for any connected app.

To cut an assistant off, open **Settings → Connected apps** and tap **Disconnect** next to it. It loses access at once.
````

#### `user_docs/pl/45-connected-apps.md` (Polish)

````markdown
## Połącz asystenta AI (MCP)

Możesz pozwolić asystentowi AI, takiemu jak Claude czy ChatGPT, czytać Twoje dane z AI Budżet i odpowiadać na pytania typu „ile wydałem na zakupy spożywcze w zeszłym miesiącu?”.

1. W asystencie dodaj własny konektor (w Claude: **Ustawienia → Konektory → Dodaj własny konektor**) i wpisz adres `https://api.ai-budget.pl/mcp`.
2. Asystent otworzy stronę AI Budżet, na której zalogujesz się jak zwykle. Zobaczysz na niej nazwę asystenta i dopisek **zarejestrowany automatycznie przez asystenta AI** — takiego asystenta nie sprawdzaliśmy, więc łącz tylko tego, którego sam uruchomiłeś. Zaznacz konta, z których może korzystać, i dotknij **Zezwól**.
3. Zadaj pytanie w asystencie.

Asystent ma dostęp **tylko do odczytu**: czyta wydatki, przychody, kategorie, budżety i podsumowania wydatków, ale nie może niczego dodawać, zmieniać ani usuwać i nie pobiera zdjęć paragonów. Konta z pełnym szyfrowaniem nie da się połączyć, a konta z szyfrowaniem tekstów ukrywają zaszyfrowane teksty — tak samo jak w każdej połączonej aplikacji.

Aby odciąć asystenta, otwórz **Ustawienia → Połączone aplikacje** i dotknij **Rozłącz** przy nim. Traci dostęp natychmiast.
````

#### `user_docs/de/45-connected-apps.md` (German)

````markdown
## KI-Assistenten verbinden (MCP)

Du kannst einem KI-Assistenten wie Claude oder ChatGPT erlauben, deine AI-Budget-Daten zu lesen und Fragen zu beantworten wie „Wie viel habe ich letzten Monat für Lebensmittel ausgegeben?“.

1. Füge im Assistenten einen eigenen Connector hinzu (in Claude: **Einstellungen → Connectors → Eigenen Connector hinzufügen**) und gib die Adresse `https://api.ai-budget.pl/mcp` ein.
2. Der Assistent öffnet eine AI-Budget-Seite, auf der du dich wie gewohnt anmeldest. Sie zeigt den Namen des Assistenten und den Hinweis **automatisch von einem KI-Assistenten registriert** — einen solchen Assistenten haben wir nicht geprüft, verbinde also nur einen, den du selbst gestartet hast. Wähle die Konten, die er nutzen darf, und tippe auf **Erlauben**.
3. Stelle deine Frage im Assistenten.

Der Assistent hat **nur Lesezugriff**: Er liest Ausgaben, Einnahmen, Kategorien, Budgets und Ausgabensummen, kann aber nichts hinzufügen, ändern oder löschen und lädt keine Belegfotos herunter. Konten mit voller Verschlüsselung lassen sich nicht verbinden, und bei Konten mit Textverschlüsselung bleiben verschlüsselte Texte verborgen — wie bei jeder verbundenen App.

Um einen Assistenten zu trennen, öffne **Einstellungen → Verbundene Apps** und tippe daneben auf **Trennen**. Er verliert den Zugriff sofort.
````

#### `user_docs/es/45-connected-apps.md` (Spanish)

````markdown
## Conectar un asistente de IA (MCP)

Puedes permitir que un asistente de IA como Claude o ChatGPT lea tus datos de AI Budget y responda preguntas como «¿cuánto gasté en comida el mes pasado?».

1. En el asistente, añade un conector personalizado (en Claude: **Ajustes → Conectores → Añadir conector personalizado**) e introduce la dirección `https://api.ai-budget.pl/mcp`.
2. El asistente abre una página de AI Budget en la que inicias sesión como siempre. Muestra el nombre del asistente y la nota **registrado automáticamente por un asistente de IA**: no hemos verificado a ese asistente, así que conecta solo uno que hayas iniciado tú. Marca las cuentas que puede usar y toca **Permitir**.
3. Haz tu pregunta en el asistente.

El asistente tiene acceso **de solo lectura**: lee gastos, ingresos, categorías, presupuestos y totales de gasto, pero no puede añadir, cambiar ni borrar nada ni descargar fotos de recibos. Las cuentas con cifrado completo no se pueden conectar, y las cuentas con cifrado de texto ocultan sus textos cifrados, igual que con cualquier app conectada.

Para desconectar un asistente, abre **Ajustes → Apps conectadas** y toca **Desconectar** junto a él. Pierde el acceso al instante.
````

#### `user_docs/fr/45-connected-apps.md` (French)

````markdown
## Connecter un assistant IA (MCP)

Vous pouvez autoriser un assistant IA comme Claude ou ChatGPT à lire vos données AI Budget et à répondre à des questions comme « combien ai-je dépensé en courses le mois dernier ? ».

1. Dans l'assistant, ajoutez un connecteur personnalisé (dans Claude : **Paramètres → Connecteurs → Ajouter un connecteur personnalisé**) et saisissez l'adresse `https://api.ai-budget.pl/mcp`.
2. L'assistant ouvre une page AI Budget où vous vous connectez comme d'habitude. Elle affiche le nom de l'assistant et la mention **enregistré automatiquement par un assistant IA** : nous n'avons pas vérifié cet assistant, ne connectez donc que celui que vous avez lancé vous-même. Cochez les comptes qu'il peut utiliser et touchez **Autoriser**.
3. Posez votre question dans l'assistant.

L'assistant a un accès **en lecture seule** : il lit les dépenses, revenus, catégories, budgets et totaux de dépenses, mais ne peut rien ajouter, modifier ni supprimer, et ne télécharge pas les photos de reçus. Les comptes à chiffrement complet ne peuvent pas être connectés, et les comptes à chiffrement du texte masquent leurs textes chiffrés, comme pour toute application connectée.

Pour déconnecter un assistant, ouvrez **Paramètres → Applications connectées** et touchez **Déconnecter** à côté de lui. Il perd l'accès immédiatement.
````

#### `user_docs/nl/45-connected-apps.md` (Dutch)

````markdown
## Een AI-assistent koppelen (MCP)

Je kunt een AI-assistent zoals Claude of ChatGPT toestaan je AI Budget-gegevens te lezen en vragen te beantwoorden zoals "hoeveel heb ik vorige maand aan boodschappen uitgegeven?".

1. Voeg in de assistent een eigen connector toe (in Claude: **Instellingen → Connectors → Eigen connector toevoegen**) en voer het adres `https://api.ai-budget.pl/mcp` in.
2. De assistent opent een AI Budget-pagina waar je zoals gewoonlijk inlogt. Daarop staan de naam van de assistent en de opmerking **automatisch geregistreerd door een AI-assistent** — zo'n assistent hebben we niet gecontroleerd, koppel dus alleen een assistent die je zelf hebt gestart. Vink de rekeningen aan die hij mag gebruiken en tik op **Toestaan**.
3. Stel je vraag in de assistent.

De assistent heeft **alleen leestoegang**: hij leest uitgaven, inkomsten, categorieën, budgetten en uitgavetotalen, maar kan niets toevoegen, wijzigen of verwijderen en downloadt geen bonfoto's. Rekeningen met volledige versleuteling kunnen niet worden gekoppeld, en bij rekeningen met tekstversleuteling blijven versleutelde teksten verborgen, net als bij elke gekoppelde app.

Om een assistent los te koppelen open je **Instellingen → Gekoppelde apps** en tik je ernaast op **Ontkoppelen**. Hij verliest direct de toegang.
````

#### `user_docs/ru/45-connected-apps.md` (Russian)

````markdown
## Подключить ИИ-ассистента (MCP)

Вы можете разрешить ИИ-ассистенту, например Claude или ChatGPT, читать ваши данные в AI Budget и отвечать на вопросы вроде «сколько я потратил на продукты в прошлом месяце?».

1. В ассистенте добавьте собственный коннектор (в Claude: **Настройки → Коннекторы → Добавить свой коннектор**) и введите адрес `https://api.ai-budget.pl/mcp`.
2. Ассистент откроет страницу AI Budget, где вы войдёте как обычно. На ней видно имя ассистента и пометку **зарегистрирован автоматически ИИ-ассистентом** — такого ассистента мы не проверяли, поэтому подключайте только того, которого запустили сами. Отметьте счета, которые он может использовать, и нажмите **Разрешить**.
3. Задайте вопрос в ассистенте.

У ассистента доступ **только на чтение**: он читает расходы, доходы, категории, бюджеты и итоги трат, но не может ничего добавлять, менять или удалять и не скачивает фото чеков. Счета с полным шифрованием подключить нельзя, а у счетов с шифрованием текста зашифрованные тексты скрыты — как в любом подключённом приложении.

Чтобы отключить ассистента, откройте **Настройки → Подключённые приложения** и нажмите **Отключить** рядом с ним. Доступ пропадает сразу.
````

#### `user_docs/ua/45-connected-apps.md` (Ukrainian)

````markdown
## Підключити ШІ-асистента (MCP)

Ви можете дозволити ШІ-асистенту, наприклад Claude або ChatGPT, читати ваші дані в AI Budget і відповідати на питання на кшталт «скільки я витратив на продукти минулого місяця?».

1. В асистенті додайте власний конектор (у Claude: **Налаштування → Конектори → Додати власний конектор**) і введіть адресу `https://api.ai-budget.pl/mcp`.
2. Асистент відкриє сторінку AI Budget, де ви увійдете як зазвичай. На ній видно ім'я асистента та примітку **зареєстровано автоматично ШІ-асистентом** — такого асистента ми не перевіряли, тож підключайте лише того, якого запустили самі. Позначте рахунки, які він може використовувати, і натисніть **Дозволити**.
3. Поставте питання в асистенті.

У асистента доступ **лише для читання**: він читає витрати, доходи, категорії, бюджети та підсумки витрат, але не може нічого додавати, змінювати чи видаляти й не завантажує фото чеків. Рахунки з повним шифруванням підключити не можна, а в рахунків із шифруванням тексту зашифровані тексти приховані — як у будь-якому підключеному застосунку.

Щоб відключити асистента, відкрийте **Налаштування → Підключені застосунки** і натисніть **Відключити** поруч із ним. Доступ зникає одразу.
````

#### `user_docs/be/45-connected-apps.md` (Belarusian)

````markdown
## Падключыць ШІ-асістэнта (MCP)

Вы можаце дазволіць ШІ-асістэнту, напрыклад Claude або ChatGPT, чытаць вашы даныя ў AI Budget і адказваць на пытанні кшталту «колькі я патраціў на прадукты ў мінулым месяцы?».

1. У асістэнце дадайце ўласны канектар (у Claude: **Налады → Канектары → Дадаць уласны канектар**) і ўвядзіце адрас `https://api.ai-budget.pl/mcp`.
2. Асістэнт адкрые старонку AI Budget, дзе вы ўвойдзеце як звычайна. На ёй бачна імя асістэнта і прыпіска **зарэгістраваны аўтаматычна ШІ-асістэнтам** — такога асістэнта мы не правяралі, таму падключайце толькі таго, якога запусцілі самі. Адзначце рахункі, якія ён можа выкарыстоўваць, і націсніце **Дазволіць**.
3. Задайце пытанне ў асістэнце.

У асістэнта доступ **толькі для чытання**: ён чытае выдаткі, даходы, катэгорыі, бюджэты і вынікі выдаткаў, але не можа нічога дадаваць, змяняць або выдаляць і не спампоўвае фота чэкаў. Рахункі з поўным шыфраваннем падключыць нельга, а ў рахункаў з шыфраваннем тэксту зашыфраваныя тэксты схаваныя — як у любой падключанай праграме.

Каб адключыць асістэнта, адкрыйце **Налады → Падключаныя праграмы** і націсніце **Адключыць** побач з ім. Доступ знікае адразу.
````

### 6. Announce

Only after steps 3–5 have passed and the step 4 launch gate is settled:

1. Ship the help section from step 5 (the commit with the regenerated `content.ts` and sites, deployed).
2. Add a release-notes line in `docs/release-notes/CHANGELOG.md` and `CHANGELOG.ru.md` for the next release, and
   consider a "What's New" spotlight entry (`docs/wiki/features/whats-new-spotlight.md`; nine locales).
3. Marketing posts (Polish first, per the marketing rule) link the help page, not `/mcp` itself.
4. Watch the first days with the commands under **What to watch** below.

## Rollback

Set `MCP_ENABLED=false` (or remove it) in `.env.production` and force-recreate `api` with the command in step 2.
`/mcp`, `/oauth/register` and the discovery documents answer 404; assistants lose access on their next call; the
public API is unaffected. Grants, tokens and DCR clients stay in the database untouched — unused DCR clients are
soft-deleted later by the cleanup cron. The nginx blocks can stay (with the flag off they proxy to 404s); remove them
only from the `.bak-mcp-*` backup, with the owner's OK. To cut off one misbehaving assistant without turning the
feature off, block its client in admin, **API apps**.

## What to watch

- **Registrations.** Each `POST /oauth/register` logs `registered MCP client <client_id>` (nothing else about the
  request). The API allows 10 per hour per client IP (IPv6 grouped by /64) and 300 per hour overall, both failing
  closed (429 with `Retry-After: 3600`). A steady stream from many IPs means the global ceiling will start refusing
  real assistants: look at admin, API apps (assistant-registered clients), block the obvious junk.
  ```bash
  docker logs --since 24h budget-api-prod 2>&1 | grep -c 'registered MCP client'
  ```
- **429s.** nginx `limiting requests ... zone "budget_public"` in the shared-nginx error log means the edge backstop
  (50 r/s, burst 200, shared with the public API) is being hit. API-side limits per connection surface inside MCP as
  a tool error with a retry hint, not as an HTTP 429.
  ```bash
  docker logs --since 24h shared-nginx 2>&1 | grep -c 'zone "budget_public"'
  ```
- **Tool calls.** MCP logs carry only `tool=<name> outcome=<ok | an error code such as rate_limited | internal_error> ms=<n>`;
  a rising `outcome=internal_error` count is the first sign of a broken tool, and its line ends with `err=<class name>`
  (for example `err=PrismaClientKnownRequestError`; never the message). Sentry gets unhandled errors as usual.
  ```bash
  docker logs --since 24h budget-api-prod 2>&1 | grep -o 'tool=[a-z_]* outcome=[a-z_]*' | sort | uniq -c
  ```
- **Container memory.** Each `/mcp` request builds a server and transport and drops them; watch `docker stats
  budget-api-prod` against its 1G limit in the first days.

## Public API pilot checklist coverage

The smoke's `--public` mode is the public API's end-to-end check in production (authorize with PKCE → token →
`/public/v1/account` → refresh → revoke → dead token). See the corresponding item in the pilot checklist of
`docs/ops/public-api.md`; tick it there once `node scripts/mcp-smoke.mjs --public` has passed against production. The
other pilot items (consent rendering, sign-in redirects, settings panes, Swagger, receipts, the changes feed, framing
headers, 429 `Retry-After`) remain manual.
