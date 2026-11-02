import type { DocTexts } from './openapi';

/** Russian texts of the public API reference — the same keys as `texts.en.ts` (see `texts.spec.ts`). */
export const TEXTS_RU: DocTexts = {
  'ui.siteTitle': 'AI Budget API — справочник',
  'info.title': 'AI Budget API',
  'server.production': 'Продакшен',

  // ── security ─────────────────────────────────────────────────────────────
  'security.oauth2':
    'OAuth 2.0, поток authorization code с PKCE (только `S256`). Пользователь входит в AI Budget, выбирает ОДИН счёт и подтверждает разрешения; ваше приложение обменивает код на access-токен (живёт час) и refresh-токен (90 дней, меняется при каждом использовании). Access-токен передавайте в заголовке `Authorization: Bearer <access_token>`.',
  'scope.expenses:read': 'Чтение расходов: список, детали с позициями чека и лента изменений.',
  'scope.expenses:write': 'Создание, изменение и удаление расходов.',
  'scope.receipts:read': 'Скачивание исходного файла чека, прикреплённого к расходу.',
  'scope.categories:read': 'Чтение категорий расходов счёта.',

  // ── tags ─────────────────────────────────────────────────────────────────
  'tag.OAuth':
    'Обмен кода, обновление и отзыв токенов (RFC 6749 / RFC 7009). Ошибки этих эндпоинтов приходят в виде `{"error", "error_description"}`, а не в формате ошибок `/public/v1`.',
  'tag.Account': 'Счёт, к которому обращён запрос (`X-Account-Id`), один из счетов подключения.',
  'tag.Categories': 'Категории расходов счёта — значения для `category_id`.',
  'tag.Expenses': 'Расходы: чтение, инкрементальная синхронизация, чеки и запись.',

  // ── shared error responses ────────────────────────────────────────────────
  'error.public.400':
    '`validation_failed` — некорректный запрос (неизвестный параметр, неверный тип или формат, нет обязательного поля); `details.fields` перечисляет ошибки по полям. `invalid_cursor` — курсор взят не из предыдущего ответа или изменён. Корректный запрос, который ссылается на записи вне подключённого счёта или на поля, принадлежащие общей группе, получает `422`, а не `400`.',
  'error.public.401':
    '`invalid_token` — access-токен отсутствует, неверен, истёк или отозван. Обновите его один раз; если обновление вернуло `invalid_grant`, пользователю нужно заново подключить ваше приложение.',
  'error.public.403':
    '`insufficient_scope` (у подключения нет разрешения, нужного для запроса; недостающие — в `details.required`), `grant_inactive` (пользователь, подключивший приложение, больше не может редактировать этот счёт), `account_encrypted` (счёт со сквозным шифрованием: только чтение, без фильтров по продавцу и поиска, без чеков).',
  'error.public.404': '`not_found` — в подключённом счёте нет такой записи (или она удалена).',
  'error.public.429':
    '`rate_limited` — слишком много запросов. Подождите столько секунд, сколько указано в заголовке `Retry-After`.',
  'error.public.503': '`unavailable` — временный сбой на нашей стороне. Повторите запрос чуть позже, увеличивая паузу.',
  'error.oauth.400':
    '`invalid_request` (нет параметра или параметры противоречат друг другу), `invalid_grant` (код или refresh-токен неверен, истёк, уже использован, либо подключение больше не активно), `unsupported_grant_type`, `invalid_scope`.',
  'error.oauth.401':
    '`invalid_client` — неизвестный или заблокированный клиент, неверный секрет либо секрет, присланный публичным клиентом.',
  'error.oauth.404': 'Публичный API не включён.',
  'error.oauth.429': '`slow_down` — больше 30 запросов токена в минуту от этого клиента (публичный клиент учитывается только по запросам с его действительным кодом или refresh-токеном). Повторите через 60 секунд.',
  'error.oauth.503': '`temporarily_unavailable` — повторите чуть позже.',

  // ── OAuth ────────────────────────────────────────────────────────────────
  'op.issueToken.summary': 'Обменять код авторизации или обновить токен',
  'op.issueToken.description':
    'Принимает `application/x-www-form-urlencoded` (стандартный вариант) или JSON.\n\n' +
    'Аутентификация клиента: HTTP Basic (`client_id:client_secret`) или `client_id` + `client_secret` в теле запроса. Публичный клиент (без секрета) передаёт только `client_id` и полагается на PKCE.\n\n' +
    '- `grant_type=authorization_code`: обязательны `code`, `redirect_uri` (в точности как в запросе авторизации) и `code_verifier`. Код живёт 10 минут и одноразовый — неудачная попытка тоже его расходует.\n' +
    '- `grant_type=refresh_token`: обязателен `refresh_token`. В ответе приходит НОВЫЙ refresh-токен, старый перестаёт работать. Повторное предъявление уже использованного refresh-токена считается кражей и отзывает всё подключение — обновляйте токены только из одного места.\n\n' +
    'Лимит: 30 запросов в минуту на клиента.',
  'op.issueToken.body': 'Параметры запроса токена.',
  'op.issueToken.response.200': 'Новая пара: access-токен и refresh-токен.',
  'op.revokeToken.summary': 'Отозвать токен (отключить приложение)',
  'op.revokeToken.description':
    'RFC 7009. Отзыв access- или refresh-токена отзывает всё подключение (все его токены). После успешной аутентификации клиента ответ всегда `200 {}` — независимо от того, существовал ли токен.',
  'op.revokeToken.body': 'Отзываемый токен и аутентификация клиента.',
  'op.revokeToken.response.200': 'Отозвано (или отзывать было нечего).',

  // ── Account ──────────────────────────────────────────────────────────────
  'op.getAccount.summary': 'Подключённый счёт',
  'op.getAccount.description':
    'Счёт, указанный в `X-Account-Id` (или единственный счёт подключения), и пользователь, который его подключил. Работает с любым действующим токеном, независимо от разрешений; при нескольких счетах заголовок обязателен. `read_only: true` означает счёт со сквозным шифрованием: чтение работает, но часть полей скрыта, а запись возвращает `403 account_encrypted`.',
  'op.getAccount.response.200': 'Подключённый счёт.',
  'op.listAccounts.summary': 'Счета подключения',
  'op.listAccounts.description': 'Все счета, которые охватывает это подключение, пригодные и нет. Работает с любым действующим токеном и не требует `X-Account-Id`. `access` равен `read_write` только если у приложения есть разрешение `expenses:write` и счёт допускает запись; `active: false` с `reason` (`role`, `encrypted`) означает, что запросы к этому счёту отклоняются; `reason: archived` — архивная поездка (активна, только чтение). Выбранный `id` передавайте в заголовке `X-Account-Id` во всех остальных вызовах.',
  'param.X-Account-Id':
    'К какому счёту подключения относится вызов. Необязателен, если в подключении ровно один счёт; обязателен, если их несколько (`400 account_required`) — считаются предоставленные счета, а не только рабочие. Счёт вне подключения возвращает `403 account_not_granted`. Идентификаторы берите из `GET /public/v1/accounts`.',
  'op.listAccounts.response.200': 'Счета подключения.',
  'schema.PublicConnectedAccount': 'Один счёт подключения.',
  'schema.PublicConnectedAccount.id': 'Идентификатор счёта; передавайте его в `X-Account-Id`.',
  'schema.PublicConnectedAccount.name': 'Название счёта; `null`, если пользователь больше не участник счёта (`reason: role`).',
  'schema.PublicConnectedAccount.type': 'Тип счёта; `null`, если пользователь больше не участник счёта.',
  'schema.PublicConnectedAccount.base_currency': 'Базовая валюта счёта (ISO 4217); `null`, если пользователь больше не участник счёта.',
  'schema.PublicConnectedAccount.access': '`read_write`, если подключение может писать в счёт, иначе `read`.',
  'schema.PublicConnectedAccount.active': '`false`, если запросы к этому счёту отклоняются.',
  'schema.PublicConnectedAccount.reason': 'Почему счёт ограничен: `role` (пользователь потерял права владельца/редактора), `encrypted` (сквозное шифрование), `archived` (архивная поездка, только чтение); иначе `null`.',
  'schema.PublicConnectedAccountList': 'Счета подключения.',
  'schema.PublicConnectedAccountList.data': 'Счета в порядке подключения.',

  // ── Categories ───────────────────────────────────────────────────────────
  'op.listCategories.summary': 'Список категорий расходов',
  'op.listCategories.description':
    'Ровно те категории, которые запись расхода принимает в `category_id`: собственные категории расходов счёта. На счёте со сквозным шифрованием `name` равно `null` и указано в `encrypted_fields` этой категории.',
  'op.listCategories.response.200': 'Все категории расходов счёта (без пагинации).',

  // ── Expenses ─────────────────────────────────────────────────────────────
  'op.listExpenses.summary': 'Список расходов',
  'op.listExpenses.description':
    'Сначала новые (по `date`, затем по `id`), пагинация непрозрачным курсором: передавайте `next_cursor` в `cursor` с ТЕМИ ЖЕ фильтрами, пока `has_more` не станет `false`. В элементах списка нет `items` — позиции чека возвращает запрос одного расхода. Запланированные расходы не возвращаются никогда.\n\n' +
    'На счёте со сквозным шифрованием фильтры `merchant` и `search` возвращают `403 account_encrypted`.\n\n' +
    'Чтобы держать копию данных в актуальном состоянии, используйте `GET /public/v1/expenses/changes`, а не повторную выгрузку списка.',
  'op.listExpenses.param.date_from': 'Только расходы в эту дату и позже (`YYYY-MM-DD`, включительно).',
  'op.listExpenses.param.date_to': 'Только расходы в эту дату и раньше (`YYYY-MM-DD`, включительно).',
  'op.listExpenses.param.category_id': 'Только расходы, у которых собственный `category_id` равен этому (разбивка по категориям не учитывается).',
  'op.listExpenses.param.merchant': 'Продавец содержит указанную строку (без учёта регистра).',
  'op.listExpenses.param.project_id': 'Только расходы, привязанные к этому проекту.',
  'op.listExpenses.param.search': 'Описание или заметка содержит указанную строку (без учёта регистра).',
  'op.listExpenses.param.limit': 'Размер страницы, 1–200 (по умолчанию 50).',
  'op.listExpenses.param.cursor': '`next_cursor` предыдущей страницы, без изменений.',
  'op.listExpenses.response.200': 'Страница расходов.',

  'op.listExpenseChanges.summary': 'Лента изменений (инкрементальная синхронизация)',
  'op.listExpenseChanges.description':
    'Все изменения расходов счёта после позиции `cursor`, от старых к новым. Каждая запись — это `upsert` (расход целиком, с позициями чека) или `delete` (только `id`).\n\n' +
    '- Без `cursor` лента начинается с самого начала: все расходы плюс удаления из прошлого — удаление `id`, которого у вас нет, просто ничего не меняет.\n' +
    '- Удалённый расход, как и расход, ставший запланированным, приходит как `delete`.\n' +
    '- Расход, отредактированный ещё раз, перемещается в конец ленты и приходит снова — в актуальном виде.\n' +
    '- Изменение появляется в ленте примерно через 10 секунд после того, как его внесли.\n' +
    '- После обработки каждой страницы сохраняйте `next_cursor` (он есть и на пустой странице) и продолжайте с него; повторяйте, пока `has_more` равно `true`.\n\n' +
    'Известные ограничения: расход, перенесённый на другой счёт, не приходит как удалённый в этом счёте; переименование тега или проекта не переотправляет расходы с ним. Если названия важны, время от времени делайте полную пересинхронизацию.',
  'op.listExpenseChanges.param.limit': 'Размер страницы, 1–200 (по умолчанию 200).',
  'op.listExpenseChanges.param.cursor': '`next_cursor` предыдущей страницы, без изменений. Не передавайте, чтобы начать с самого начала.',
  'op.listExpenseChanges.response.200': 'Страница изменений.',

  'op.getExpenseReceipt.summary': 'Скачать файл чека',
  'op.getExpenseReceipt.description':
    'Исходное фото или PDF чека, прикреплённого к расходу (`has_receipt: true`). `Content-Type` определяется по содержимому файла. `404 not_found`, если у расхода нет чека; `403 account_encrypted` на счёте со сквозным шифрованием.',
  'op.getExpenseReceipt.param.id': 'Идентификатор расхода.',
  'op.getExpenseReceipt.response.200': 'Файл чека.',

  'op.getExpense.summary': 'Получить расход',
  'op.getExpense.description': 'Один расход вместе с позициями чека (`items`).',
  'op.getExpense.param.id': 'Идентификатор расхода.',
  'op.getExpense.response.200': 'Расход.',

  'op.createExpense.summary': 'Создать расход',
  'op.createExpense.description':
    'Нужен заголовок `Idempotency-Key`. Суммы передаются десятичными строками (`"42.50"`), а не числами JSON. Поле, которого нет в схеме, отклоняется с `400 validation_failed`.\n\n' +
    '`category_id`, `tag_ids` и `project_id` должны принадлежать подключённому счёту (иначе `422 validation_failed` с подробностями в `details.fields`). Валюта (`currency`) по умолчанию — базовая валюта счёта.',
  'op.createExpense.param.Idempotency-Key':
    'UUID, который вы генерируете для этого расхода и повторяете при каждой повторной отправке того же запроса. Повтор возвращает уже созданный расход (`200`, тело повтора игнорируется). Повторы отправляйте последовательно, а не параллельно. Ключ, уже занятый другой записью, даёт `409 idempotency_key_conflict`.',
  'op.createExpense.body': 'Новый расход.',
  'op.createExpense.response.200': 'Расход с этим `Idempotency-Key` уже создан ранее: возвращается исходный расход без изменений.',
  'op.createExpense.response.201': 'Создано.',
  'op.createExpense.response.409':
    '`idempotency_key_conflict` — ключ принадлежит записи, которую создало не ваше приложение, или расходу, который с тех пор удалён. Используйте новый UUID.',
  'op.createExpense.response.422':
    '`validation_failed` — `category_id`, `tag_ids` или `project_id` не указывает на действующую запись этого счёта; подробности в `details.fields`.',

  'op.updateExpense.summary': 'Изменить расход',
  'op.updateExpense.description':
    'Частичное обновление: не переданное поле не меняется. `null` очищает `time`, `category_id`, `description`, `merchant`, `notes`, `location` и `project_id`; `tag_ids` заменяет весь набор тегов (`[]` снимает все теги). `amount`, `currency`, `date` и `tag_ids` не могут быть `null`. Позиции чека не редактируются.\n\n' +
    'Расход, который является долей в общем расходе группы (`source: "group"`), берёт `amount`, `currency` и `date` из группы: попытка их изменить возвращает `422 validation_failed`.',
  'op.updateExpense.param.id': 'Идентификатор расхода.',
  'op.updateExpense.body': 'Изменяемые поля.',
  'op.updateExpense.response.200': 'Обновлённый расход.',
  'op.updateExpense.response.422':
    '`validation_failed` — указанная категория, тег или проект не принадлежит этому счёту, либо передано поле, которым управляет общая группа (`amount`, `currency`, `date`); подробности в `details.fields`.',

  'op.deleteExpense.summary': 'Удалить расход',
  'op.deleteExpense.description':
    'Удаляет расход так же, как удаление в приложении. После этого он появляется в ленте изменений как `delete`. Повторное удаление возвращает `404 not_found`.',
  'op.deleteExpense.param.id': 'Идентификатор расхода.',
  'op.deleteExpense.response.204': 'Удалено.',

  // ── schemas: errors ──────────────────────────────────────────────────────
  'schema.PublicApiErrorResponse': 'Тело любой ошибки `/public/v1`.',
  'schema.PublicApiErrorResponse.error': 'Что пошло не так.',
  'schema.PublicApiErrorObject': 'Подробности ошибки. Логику стройте на `code`; `message` предназначено для людей и может меняться.',
  'schema.PublicApiErrorObject.code': 'Стабильный машиночитаемый код. Новые коды могут добавляться, существующие не меняются никогда.',
  'schema.PublicApiErrorObject.message': 'Пояснение для человека (на английском).',
  'schema.PublicApiErrorObject.details':
    'Дополнительные данные для некоторых кодов, например `fields` (сообщения по полям) у `validation_failed`, `required` (недостающие разрешения) у `insufficient_scope`.',
  'schema.OAuthErrorResponse': 'Тело ошибки по RFC 6749 для `/oauth/token` и `/oauth/revoke`.',
  'schema.OAuthErrorResponse.error': 'Код ошибки OAuth.',
  'schema.OAuthErrorResponse.error_description': 'Пояснение для человека (на английском).',

  // ── schemas: OAuth ───────────────────────────────────────────────────────
  'schema.OAuthTokenRequest': 'Параметры `POST /oauth/token`. Какие из них обязательны, зависит от `grant_type`.',
  'schema.OAuthTokenRequest.grant_type': '`authorization_code` — обмен кода, `refresh_token` — обновление.',
  'schema.OAuthTokenRequest.code': '`code`, пришедший на ваш redirect URI. Обязателен для `authorization_code`.',
  'schema.OAuthTokenRequest.redirect_uri':
    'В точности тот же `redirect_uri`, что и в запросе авторизации. Обязателен для `authorization_code`.',
  'schema.OAuthTokenRequest.code_verifier':
    'PKCE-верификатор, SHA-256 от которого был отправлен как `code_challenge`. Обязателен для `authorization_code`.',
  'schema.OAuthTokenRequest.refresh_token': 'Ваш текущий refresh-токен. Обязателен для `refresh_token`.',
  'schema.OAuthTokenRequest.scope':
    'Необязателен при обновлении: подмножество выданных разрешений. Ответ всё равно содержит все выданные разрешения.',
  'schema.OAuthTokenRequest.client_id': 'Идентификатор клиента, если он не передан через HTTP Basic.',
  'schema.OAuthTokenRequest.client_secret': 'Только для конфиденциальных клиентов, если секрет не передан через HTTP Basic. Никогда не отправляйте его из браузера или мобильного приложения.',
  'schema.OAuthRevokeRequest': 'Параметры `POST /oauth/revoke`.',
  'schema.OAuthRevokeRequest.token': 'Access- или refresh-токен подключения.',
  'schema.OAuthRevokeRequest.token_type_hint': 'Принимается и игнорируется: токен найдётся в любом случае.',
  'schema.OAuthRevokeRequest.client_id': 'Идентификатор клиента, если он не передан через HTTP Basic.',
  'schema.OAuthRevokeRequest.client_secret': 'Только для конфиденциальных клиентов, если секрет не передан через HTTP Basic.',
  'schema.OAuthTokenResponse': 'Пара токенов. Каждый раз сохраняйте новый `refresh_token` — предыдущий больше не работает.',
  'schema.OAuthTokenResponse.access_token': 'Передавайте как `Authorization: Bearer <access_token>`.',
  'schema.OAuthTokenResponse.token_type': 'Всегда `Bearer`.',
  'schema.OAuthTokenResponse.expires_in': 'Срок жизни access-токена в секундах (3600).',
  'schema.OAuthTokenResponse.refresh_token':
    'Действует 90 дней и одноразовый: каждое обновление возвращает новый. Повторное использование старого отзывает подключение.',
  'schema.OAuthTokenResponse.scope': 'Разрешения подключения через пробел.',
  'schema.OAuthTokenResponse.account_ids': 'Счета, которые подключил пользователь, в порядке подключения.',
  'schema.OAuthTokenResponse.account_id': 'Есть только если в подключении ровно один счёт (совместимость с первой версией API). Используйте `account_ids`.',

  // ── schemas: account and categories ──────────────────────────────────────
  'schema.PublicAccount': 'Подключённый счёт.',
  'schema.PublicAccount.id': 'Идентификатор счёта.',
  'schema.PublicAccount.name': 'Название счёта.',
  'schema.PublicAccount.type': 'Тип счёта.',
  'schema.PublicAccount.base_currency': 'Базовая валюта счёта (ISO 4217); `currency` нового расхода по умолчанию.',
  'schema.PublicAccount.role': 'Роль подключившего пользователя в этом счёте (подключать могут только владельцы и редакторы).',
  'schema.PublicAccount.encryption':
    '`none` или `text` для счёта со сквозным шифрованием (через API только чтение, часть полей скрыта). Полностью зашифрованные счета подключить нельзя.',
  'schema.PublicAccount.read_only': '`true`, если запись отклоняется (счёт со сквозным шифрованием).',
  'schema.PublicAccount.user': 'Пользователь, подключивший приложение.',
  'schema.PublicAccountUser': 'Пользователь, подключивший приложение.',
  'schema.PublicAccountUser.id': 'Идентификатор пользователя.',
  'schema.PublicAccountUser.name': 'Отображаемое имя.',
  'schema.PublicAccountUser.base_currency': 'Валюта отображения пользователя (может отличаться от валюты счёта).',
  'schema.PublicCategoryList': 'Категории расходов.',
  'schema.PublicCategoryList.data': 'Категории.',
  'schema.PublicCategory': 'Категория расходов.',
  'schema.PublicCategory.id': 'Идентификатор категории — значение для `category_id`.',
  'schema.PublicCategory.name': 'Название; `null` на счёте со сквозным шифрованием.',
  'schema.PublicCategory.parent_id': 'Идентификатор родительской категории у подкатегории, иначе `null`.',
  'schema.PublicCategory.icon': 'Название иконки в приложении.',
  'schema.PublicCategory.color': 'Цвет в приложении, например `#4CAF50`.',
  'schema.PublicCategory.type': 'В этой версии всегда `expense`.',
  'schema.PublicCategory.encrypted_fields': 'Поля, скрытые (`null`) из-за сквозного шифрования счёта: `["name"]` или `[]`.',

  // ── schemas: expense ─────────────────────────────────────────────────────
  'schema.PublicExpense': 'Расход.',
  'schema.PublicExpense.id': 'Идентификатор расхода.',
  'schema.PublicExpense.amount': 'Десятичная строка в собственной валюте расхода (`currency`, без конвертации), например `"42.50"`.',
  'schema.PublicExpense.currency': 'Код ISO 4217.',
  'schema.PublicExpense.date': 'Дата расхода, `YYYY-MM-DD`.',
  'schema.PublicExpense.time': 'Время в том виде, как его записали, `HH:mm`, или `null`.',
  'schema.PublicExpense.category_id': 'Идентификатор категории или `null`, если категории нет.',
  'schema.PublicExpense.description': 'Описание. `null`, если пусто или скрыто (см. `encrypted_fields`).',
  'schema.PublicExpense.merchant': 'Продавец. `null`, если пусто или скрыто (см. `encrypted_fields`).',
  'schema.PublicExpense.notes': 'Заметка. `null`, если пусто или скрыто (см. `encrypted_fields`).',
  'schema.PublicExpense.location': 'Место расхода или `null`.',
  'schema.PublicExpense.tags': 'Теги расхода.',
  'schema.PublicExpense.project': 'Проект, к которому относится расход, или `null`.',
  'schema.PublicExpense.category_splits':
    'Если расход разбит на несколько категорий — доля каждой. Пустой массив, если разбивки нет.',
  'schema.PublicExpense.items':
    'Позиции чека. Есть у отдельного расхода и в ленте изменений; в списке отсутствуют.',
  'schema.PublicExpense.discount_amount': 'Общая скидка по чеку десятичной строкой или `null`.',
  'schema.PublicExpense.deposit_amount': 'Залог за бутылки/тару, уже оплаченный в составе суммы, десятичной строкой или `null`.',
  'schema.PublicExpense.is_debt': 'Деньги, данные кому-то в долг, а не обычная трата.',
  'schema.PublicExpense.is_debt_repayment': 'Возврат денег, которые пользователь брал в долг.',
  'schema.PublicExpense.is_split_receivable': 'Часть общего счёта, которую другие должны вернуть пользователю, — не его собственная трата.',
  'schema.PublicExpense.is_recurring': 'Часть серии регулярных расходов.',
  'schema.PublicExpense.source':
    'Как был записан расход, например `manual`, `voice`, `ocr`, `import`, `telegram`, `whatsapp`, `slack`, `notification`, `group` (доля в общем расходе группы) или `api`. Считайте список открытым: могут появиться новые значения.',
  'schema.PublicExpense.created_by_app': 'Приложение, создавшее расход через этот API, или `null`.',
  'schema.PublicExpense.created_by_user': 'Пользователь, записавший расход.',
  'schema.PublicExpense.has_receipt': 'К расходу прикреплён файл чека (скачать — `GET /public/v1/expenses/{id}/receipt`).',
  'schema.PublicExpense.encrypted_fields':
    'На счёте со сквозным шифрованием — поля, которые приходят как `null`, потому что зашифрованы: `description`, `notes`, `merchant`, `location.name`, `items.description`, `tags.name`, `project.name`. Иначе `[]`.',
  'schema.PublicExpense.created_at': 'Когда расход создан (ISO-8601, UTC).',
  'schema.PublicExpense.updated_at': 'Когда расход последний раз изменился (ISO-8601, UTC).',
  'schema.PublicLocation': 'Местоположение.',
  'schema.PublicLocation.lat': 'Широта.',
  'schema.PublicLocation.lng': 'Долгота.',
  'schema.PublicLocation.name': 'Название места; `null`, если не задано или скрыто (см. `encrypted_fields`).',
  'schema.PublicRef': 'Тег или проект.',
  'schema.PublicRef.id': 'Идентификатор.',
  'schema.PublicRef.name': 'Название; `null`, если скрыто (см. `encrypted_fields`).',
  'schema.PublicCategorySplit': 'Доля одной категории в разбитом расходе.',
  'schema.PublicCategorySplit.category_id': 'Идентификатор категории.',
  'schema.PublicCategorySplit.amount': 'Доля десятичной строкой в валюте расхода.',
  'schema.PublicExpenseItem': 'Позиция чека.',
  'schema.PublicExpenseItem.id': 'Идентификатор позиции.',
  'schema.PublicExpenseItem.description': 'Название товара; `null`, если скрыто (см. `encrypted_fields`).',
  'schema.PublicExpenseItem.quantity': 'Количество, десятичная строка с тремя знаками после точки.',
  'schema.PublicExpenseItem.unit_price': 'Цена за единицу, десятичная строка.',
  'schema.PublicExpenseItem.total_price': 'Сумма по позиции, десятичная строка.',
  'schema.PublicExpenseItem.line_discount': 'Скидка на позицию, десятичная строка (`"0.00"`, если скидки нет).',
  'schema.PublicExpenseItem.category_id': 'Категория позиции или `null`.',
  'schema.PublicCreatedByApp': 'Приложение, подключённое через этот API.',
  'schema.PublicCreatedByApp.id': 'Публичный `client_id` приложения — сравнивайте его со своим, чтобы узнавать собственные записи.',
  'schema.PublicCreatedByApp.name': 'Название приложения.',
  'schema.PublicCreatedByUser': 'Участник счёта.',
  'schema.PublicCreatedByUser.id': 'Идентификатор пользователя.',
  'schema.PublicCreatedByUser.name': 'Отображаемое имя.',
  'schema.PublicExpenseList': 'Страница расходов.',
  'schema.PublicExpenseList.data': 'Расходы этой страницы (без `items`).',
  'schema.PublicExpenseList.next_cursor': 'Передайте в `cursor`, чтобы получить следующую страницу; `null` на последней странице.',
  'schema.PublicExpenseList.has_more': 'Есть ли следующая страница.',
  'schema.PublicExpenseChanges': 'Страница ленты изменений.',
  'schema.PublicExpenseChanges.changes': 'Изменения от старых к новым. Применяйте их по порядку.',
  'schema.PublicExpenseChanges.next_cursor':
    'Есть всегда (на пустой странице равен присланному курсору). Сохраните его после обработки страницы и передайте в следующий раз.',
  'schema.PublicExpenseChanges.has_more': 'Есть ли прямо сейчас ещё изменения. Если `false`, опросите ленту позже с `next_cursor`.',
  'schema.PublicExpenseUpsertChange': 'Расход создан или изменён.',
  'schema.PublicExpenseUpsertChange.type': 'Всегда `upsert`.',
  'schema.PublicExpenseUpsertChange.expense': 'Расход в текущем состоянии, с позициями чека. Добавьте его в свою копию или замените им прежнюю версию.',
  'schema.PublicExpenseDeleteChange': 'Расход удалён или больше не виден (стал запланированным).',
  'schema.PublicExpenseDeleteChange.type': 'Всегда `delete`.',
  'schema.PublicExpenseDeleteChange.id': 'Идентификатор расхода, который нужно убрать из вашей копии. Это может быть `id`, который вы ни разу не получали.',
  'schema.PublicExpenseDeleteChange.deleted_at': 'Когда расход удалён или перестал быть виден (ISO-8601, UTC).',

  // ── schemas: write bodies ────────────────────────────────────────────────
  'schema.PublicExpenseCreateDto': 'Новый расход. Поля, которых нет в этом списке, отклоняются.',
  'schema.PublicExpenseCreateDto.amount': 'Десятичная строка больше 0, не более 2 знаков после точки, например `"42.50"`.',
  'schema.PublicExpenseCreateDto.currency': 'Код ISO 4217 заглавными буквами. По умолчанию — базовая валюта счёта.',
  'schema.PublicExpenseCreateDto.date': 'Дата расхода, `YYYY-MM-DD`.',
  'schema.PublicExpenseCreateDto.time': 'Время, `HH:mm` (24-часовой формат).',
  'schema.PublicExpenseCreateDto.category_id': 'Одна из категорий из `GET /public/v1/categories`.',
  'schema.PublicExpenseCreateDto.description': 'Описание, до 500 символов.',
  'schema.PublicExpenseCreateDto.merchant': 'Продавец, до 120 символов.',
  'schema.PublicExpenseCreateDto.notes': 'Заметка, до 2000 символов.',
  'schema.PublicExpenseCreateDto.location': 'Место расхода.',
  'schema.PublicExpenseCreateDto.tag_ids': 'Идентификаторы тегов этого счёта (до 50, без повторов).',
  'schema.PublicExpenseCreateDto.project_id': 'Идентификатор проекта этого счёта.',
  'schema.PublicExpenseCreateDto.items': 'Позиции чека (1–500). Только при создании.',
  'schema.PublicExpenseUpdateDto': 'Изменяемые поля. Не переданные поля остаются как есть; `null` очищает поле там, где это разрешено.',
  'schema.PublicExpenseUpdateDto.amount': 'Десятичная строка больше 0. Не может быть `null`.',
  'schema.PublicExpenseUpdateDto.currency': 'Код ISO 4217 заглавными буквами. Не может быть `null`.',
  'schema.PublicExpenseUpdateDto.date': '`YYYY-MM-DD`. Не может быть `null`.',
  'schema.PublicExpenseUpdateDto.time': '`HH:mm` или `null`, чтобы очистить.',
  'schema.PublicExpenseUpdateDto.category_id': 'Категория из `GET /public/v1/categories` или `null`, чтобы очистить.',
  'schema.PublicExpenseUpdateDto.description': 'Описание или `null`, чтобы очистить.',
  'schema.PublicExpenseUpdateDto.merchant': 'Продавец или `null`, чтобы очистить.',
  'schema.PublicExpenseUpdateDto.notes': 'Заметка или `null`, чтобы очистить.',
  'schema.PublicExpenseUpdateDto.location': 'Местоположение или `null`, чтобы очистить.',
  'schema.PublicExpenseUpdateDto.tag_ids': 'Заменяет все теги; `[]` снимает все теги. Не может быть `null`.',
  'schema.PublicExpenseUpdateDto.project_id': 'Проект этого счёта или `null`, чтобы отвязать расход от проекта.',
  'schema.PublicLocationInput': 'Местоположение.',
  'schema.PublicLocationInput.lat': 'Широта, от −90 до 90.',
  'schema.PublicLocationInput.lng': 'Долгота, от −180 до 180.',
  'schema.PublicLocationInput.name': 'Название места, до 200 символов.',
  'schema.PublicExpenseItemInput': 'Позиция чека.',
  'schema.PublicExpenseItemInput.description': 'Название товара, 1–500 символов.',
  'schema.PublicExpenseItemInput.quantity': 'Десятичная строка больше 0, не более 3 знаков после точки. По умолчанию `"1"`.',
  'schema.PublicExpenseItemInput.unit_price': 'Десятичная строка, не более 2 знаков после точки. По умолчанию `"0"`.',
  'schema.PublicExpenseItemInput.total_price': 'Сумма по позиции, десятичная строка, не более 2 знаков после точки.',
};
