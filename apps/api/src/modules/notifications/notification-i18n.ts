type Lang = string;

interface SharedExpenseParams {
  accountName: string;
  creatorName: string;
  currencyCode: string;
  amount: string;
  description: string;
}

interface BudgetThresholdParams {
  budgetName: string;
  threshold: number;
  currencyCode: string;
  spent: string;
  total: string;
}

interface SpendingAnomalyParams {
  categoryName: string;
  percent: number;
}

interface SubscriptionActivatedParams {
  tier: string;
}

interface PaymentSuccessParams {
  amount: string;
  currency: string;
  tier: string;
}

interface TrialReminderParams {
  tier: string;
}

interface ReferralNameParams {
  name: string;
}

interface ReferralQualifiedParams {
  name: string;
  bonus: number;
}

interface DebtUpcomingParams {
  contactName: string;
  days: number;
  amount: string;
  currencyCode: string;
  type: 'lent' | 'borrowed';
}

interface DebtOverdueParams {
  contactName: string;
  amount: string;
  currencyCode: string;
  type: 'lent' | 'borrowed';
}

interface RecurringExpenseParams {
  description: string;
  amount: string;
  currencyCode: string;
  period: string;
}

interface ChatMentionParams {
  senderName: string;
  preview: string;
}

interface PriceIncreaseParams {
  merchant: string;
  oldAmount: string;
  newAmount: string;
  currencyCode: string;
  percent: number;
}

interface DuplicateChargeParams {
  merchant: string;
  amount: string;
  currencyCode: string;
}

interface RecurringSuggestionParams {
  merchant: string;
  amount: string;
  currencyCode: string;
}

const translations: Record<string, {
  sharedExpenseTitle: (p: SharedExpenseParams) => string;
  sharedExpenseBody: (p: SharedExpenseParams) => string;
  budgetThresholdTitle: (p: BudgetThresholdParams) => string;
  budgetThresholdBody: (p: BudgetThresholdParams) => string;
  budgetExceededTitle: (p: BudgetThresholdParams) => string;
  budgetExceededBody: (p: BudgetThresholdParams) => string;
  anomalyTitle: (p: SpendingAnomalyParams) => string;
  anomalyBody: (p: SpendingAnomalyParams) => string;
  subscriptionActivatedTitle: () => string;
  subscriptionActivatedBody: (p: SubscriptionActivatedParams) => string;
  paymentSuccessTitle: () => string;
  paymentSuccessBody: (p: PaymentSuccessParams) => string;
  paymentFailedTitle: () => string;
  paymentFailedBody: () => string;
  trialReminderTitle: () => string;
  trialReminderBody: (p: TrialReminderParams) => string;
  trialReminderEmailSubject: () => string;
  trialReminderEmailHtml: (name: string, p: TrialReminderParams) => string;
  newReferralTitle: () => string;
  newReferralBody: (p: ReferralNameParams) => string;
  referralQualifiedTitle: () => string;
  referralQualifiedBody: (p: ReferralQualifiedParams) => string;
  referralMilestone5Title: () => string;
  referralMilestone5Body: () => string;
  debtUpcomingTitle: (p: DebtUpcomingParams) => string;
  debtUpcomingBody: (p: DebtUpcomingParams) => string;
  debtOverdueTitle: (p: DebtOverdueParams) => string;
  debtOverdueBody: (p: DebtOverdueParams) => string;
  recurringExpenseTitle: (p: RecurringExpenseParams) => string;
  recurringExpenseBody: (p: RecurringExpenseParams) => string;
  chatMentionTitle: (p: ChatMentionParams) => string;
  chatMentionBody: (p: ChatMentionParams) => string;
  priceIncreaseTitle: (p: PriceIncreaseParams) => string;
  priceIncreaseBody: (p: PriceIncreaseParams) => string;
  duplicateChargeTitle: (p: DuplicateChargeParams) => string;
  duplicateChargeBody: (p: DuplicateChargeParams) => string;
  recurringSuggestionTitle: (p: RecurringSuggestionParams) => string;
  recurringSuggestionBody: (p: RecurringSuggestionParams) => string;
}> = {
  en: {
    sharedExpenseTitle: ({ accountName }) => `New expense in "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} added ${currencyCode} ${amount} for ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budget "${budgetName}" at ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `${currencyCode} ${spent} of ${currencyCode} ${total} used.`,
    budgetExceededTitle: ({ budgetName }) => `Budget "${budgetName}" exceeded!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `You've spent ${currencyCode} ${spent} of your ${currencyCode} ${total} budget.`,
    anomalyTitle: ({ categoryName }) => `Unusual spending on ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `You've spent ${percent}% more than usual on ${categoryName} this month.`,
    subscriptionActivatedTitle: () => 'Subscription Activated!',
    subscriptionActivatedBody: ({ tier }) => `Your trial has ended. ${tier} subscription is now active.`,
    paymentSuccessTitle: () => 'Payment Successful',
    paymentSuccessBody: ({ amount, currency, tier }) => `Payment of ${amount} ${currency} for ${tier} subscription was successful.`,
    paymentFailedTitle: () => 'Payment Failed',
    paymentFailedBody: () => 'Subscription payment failed. Please update your payment method to keep your access.',
    trialReminderTitle: () => 'Trial Ends Tomorrow',
    trialReminderBody: ({ tier }) => `Your ${tier} trial ends tomorrow. Payment will be charged after that.`,
    trialReminderEmailSubject: () => 'Your trial ends tomorrow',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>Hi ${name}!</h2><p>Your <strong>${tier}</strong> trial ends tomorrow.</p><p>After the trial period, your card will be automatically charged for the subscription.</p><p>If you don't want to continue, cancel your subscription in the app's Subscription section.</p>`,
    newReferralTitle: () => 'New Referral!',
    newReferralBody: ({ name }) => `Your friend ${name} joined using your referral code!`,
    referralQualifiedTitle: () => 'Referral Qualified!',
    referralQualifiedBody: ({ name, bonus }) => `Your referral ${name} is now active! You earned +${bonus} AI requests.`,
    referralMilestone5Title: () => '5 Referrals!',
    referralMilestone5Body: () => 'You earned a free month of Pro! Check your email.',
    debtUpcomingTitle: ({ contactName, days }) => `Debt due in ${days} day${days === 1 ? '' : 's'}: ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `You lent ${currencyCode} ${amount} — repayment due soon`
        : `You borrowed ${currencyCode} ${amount} — repayment due soon`,
    debtOverdueTitle: ({ contactName }) => `Debt overdue: ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${currencyCode} ${amount} you lent is now overdue`
        : `${currencyCode} ${amount} you borrowed is now overdue`,
    recurringExpenseTitle: ({ description }) => `Recurring expense logged: ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${currencyCode} ${amount} auto-logged (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} mentioned you`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} got more expensive`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} charged ${currencyCode} ${newAmount}, up from ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Possible duplicate charge',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} charged ${currencyCode} ${amount} twice within two days. Worth checking.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} looks like a subscription`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} charges ${currencyCode} ${amount} regularly. Track it as a subscription?`,
  },
  ru: {
    sharedExpenseTitle: ({ accountName }) => `Новый расход в "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} добавил ${amount} ${currencyCode} за ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Бюджет "${budgetName}" использован на ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Потрачено ${spent} ${currencyCode} из ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Бюджет "${budgetName}" превышен!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Потрачено ${spent} ${currencyCode} из запланированных ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Необычные траты: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `В этом месяце вы потратили на ${percent}% больше обычного на ${categoryName}.`,
    subscriptionActivatedTitle: () => 'Подписка активирована!',
    subscriptionActivatedBody: ({ tier }) => `Ваш пробный период завершён. Подписка ${tier} теперь активна.`,
    paymentSuccessTitle: () => 'Оплата прошла успешно',
    paymentSuccessBody: ({ amount, currency, tier }) => `Оплата ${amount} ${currency} за подписку ${tier} прошла успешно.`,
    paymentFailedTitle: () => 'Ошибка оплаты',
    paymentFailedBody: () => 'Не удалось списать оплату за подписку. Обновите платёжные данные, чтобы сохранить доступ.',
    trialReminderTitle: () => 'Пробный период заканчивается завтра',
    trialReminderBody: ({ tier }) => `Ваш пробный период ${tier} заканчивается завтра. После этого будет списана оплата.`,
    trialReminderEmailSubject: () => 'Ваш пробный период заканчивается завтра',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>Привет, ${name}!</h2><p>Ваш пробный период <strong>${tier}</strong> заканчивается завтра.</p><p>После окончания пробного периода с вашей карты будет автоматически списана оплата за подписку.</p><p>Если вы не хотите продолжать, отмените подписку через раздел «Подписка» в приложении.</p>`,
    newReferralTitle: () => 'Новый реферал!',
    newReferralBody: ({ name }) => `Ваш друг ${name} присоединился по вашему коду!`,
    referralQualifiedTitle: () => 'Реферал подтверждён!',
    referralQualifiedBody: ({ name, bonus }) => `Ваш реферал ${name} активен! Вы получили +${bonus} AI запросов.`,
    referralMilestone5Title: () => '5 рефералов!',
    referralMilestone5Body: () => 'Вы заработали бесплатный месяц Pro! Проверьте email.',
    debtUpcomingTitle: ({ contactName, days }) => `Долг через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}: ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `Вы одолжили ${amount} ${currencyCode} — срок погашения скоро`
        : `Вы заняли ${amount} ${currencyCode} — срок погашения скоро`,
    debtOverdueTitle: ({ contactName }) => `Долг просрочен: ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${amount} ${currencyCode}, которые вы одолжили, просрочены`
        : `${amount} ${currencyCode}, которые вы заняли, просрочены`,
    recurringExpenseTitle: ({ description }) => `Регулярный расход записан: ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${amount} ${currencyCode} автоматически добавлено (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} упомянул вас`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} подорожал`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} списал ${currencyCode} ${newAmount} вместо ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Возможен повторный платёж',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} списал ${currencyCode} ${amount} дважды за два дня. Стоит проверить.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} похож на подписку`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} регулярно списывает ${currencyCode} ${amount}. Отслеживать как подписку?`,
  },
  ua: {
    sharedExpenseTitle: ({ accountName }) => `Новий витрат у "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} додав ${amount} ${currencyCode} за ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Бюджет "${budgetName}" використано на ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Витрачено ${spent} ${currencyCode} з ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Бюджет "${budgetName}" перевищено!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Витрачено ${spent} ${currencyCode} із запланованих ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Незвичайні витрати: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Цього місяця ви витратили на ${percent}% більше за звичайне на ${categoryName}.`,
    subscriptionActivatedTitle: () => 'Підписку активовано!',
    subscriptionActivatedBody: ({ tier }) => `Ваш пробний період завершено. Підписка ${tier} тепер активна.`,
    paymentSuccessTitle: () => 'Оплата пройшла успішно',
    paymentSuccessBody: ({ amount, currency, tier }) => `Оплата ${amount} ${currency} за підписку ${tier} пройшла успішно.`,
    paymentFailedTitle: () => 'Помилка оплати',
    paymentFailedBody: () => 'Не вдалося списати оплату за підписку. Оновіть платіжні дані, щоб зберегти доступ.',
    trialReminderTitle: () => 'Пробний період закінчується завтра',
    trialReminderBody: ({ tier }) => `Ваш пробний період ${tier} закінчується завтра. Після цього буде списано оплату.`,
    trialReminderEmailSubject: () => 'Ваш пробний період закінчується завтра',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>Привіт, ${name}!</h2><p>Ваш пробний період <strong>${tier}</strong> закінчується завтра.</p><p>Після закінчення пробного періоду з вашої картки буде автоматично списано оплату за підписку.</p><p>Якщо ви не хочете продовжувати, скасуйте підписку в розділі «Підписка» в додатку.</p>`,
    newReferralTitle: () => 'Новий реферал!',
    newReferralBody: ({ name }) => `Ваш друг ${name} приєднався за вашим кодом!`,
    referralQualifiedTitle: () => 'Реферал підтверджено!',
    referralQualifiedBody: ({ name, bonus }) => `Ваш реферал ${name} активний! Ви отримали +${bonus} AI запитів.`,
    referralMilestone5Title: () => '5 рефералів!',
    referralMilestone5Body: () => 'Ви заробили безкоштовний місяць Pro! Перевірте email.',
    debtUpcomingTitle: ({ contactName, days }) => `Борг через ${days} ${days === 1 ? 'день' : days < 5 ? 'дні' : 'днів'}: ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `Ви позичили ${amount} ${currencyCode} — термін погашення скоро`
        : `Ви взяли ${amount} ${currencyCode} — термін погашення скоро`,
    debtOverdueTitle: ({ contactName }) => `Борг прострочений: ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${amount} ${currencyCode}, які ви позичили, прострочені`
        : `${amount} ${currencyCode}, які ви взяли, прострочені`,
    recurringExpenseTitle: ({ description }) => `Регулярний витрат записано: ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${amount} ${currencyCode} автоматично додано (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} згадав вас`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} подорожчав`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} списав ${currencyCode} ${newAmount} замість ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Можливий повторний платіж',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} списав ${currencyCode} ${amount} двічі за два дні. Варто перевірити.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} схожий на підписку`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} регулярно списує ${currencyCode} ${amount}. Відстежувати як підписку?`,
  },
  pl: {
    sharedExpenseTitle: ({ accountName }) => `Nowy wydatek w "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} dodał ${amount} ${currencyCode} za ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budżet "${budgetName}" wykorzystany w ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Wydano ${spent} ${currencyCode} z ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Budżet "${budgetName}" przekroczony!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Wydano ${spent} ${currencyCode} z planowanych ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Nietypowe wydatki: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `W tym miesiącu wydałeś ${percent}% więcej niż zwykle na ${categoryName}.`,
    subscriptionActivatedTitle: () => 'Subskrypcja aktywowana!',
    subscriptionActivatedBody: ({ tier }) => `Twój okres próbny się zakończył. Subskrypcja ${tier} jest teraz aktywna.`,
    paymentSuccessTitle: () => 'Płatność zakończona sukcesem',
    paymentSuccessBody: ({ amount, currency, tier }) => `Płatność ${amount} ${currency} za subskrypcję ${tier} zakończona sukcesem.`,
    paymentFailedTitle: () => 'Błąd płatności',
    paymentFailedBody: () => 'Nie udało się pobrać opłaty za subskrypcję. Zaktualizuj dane płatnicze, aby zachować dostęp.',
    trialReminderTitle: () => 'Okres próbny kończy się jutro',
    trialReminderBody: ({ tier }) => `Twój okres próbny ${tier} kończy się jutro. Po tym zostanie pobrana opłata.`,
    trialReminderEmailSubject: () => 'Twój okres próbny kończy się jutro',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>Cześć ${name}!</h2><p>Twój okres próbny <strong>${tier}</strong> kończy się jutro.</p><p>Po zakończeniu okresu próbnego z Twojej karty zostanie automatycznie pobrana opłata za subskrypcję.</p><p>Jeśli nie chcesz kontynuować, anuluj subskrypcję w sekcji „Subskrypcja" w aplikacji.</p>`,
    newReferralTitle: () => 'Nowe polecenie!',
    newReferralBody: ({ name }) => `Twój znajomy ${name} dołączył z twoim kodem!`,
    referralQualifiedTitle: () => 'Polecenie potwierdzone!',
    referralQualifiedBody: ({ name, bonus }) => `Twoje polecenie ${name} jest aktywne! Otrzymałeś +${bonus} zapytań AI.`,
    referralMilestone5Title: () => '5 poleceń!',
    referralMilestone5Body: () => 'Zdobyłeś darmowy miesiąc Pro! Sprawdź email.',
    debtUpcomingTitle: ({ contactName, days }) => `Dług za ${days} ${days === 1 ? 'dzień' : 'dni'}: ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `Pożyczyłeś ${amount} ${currencyCode} — termin spłaty wkrótce`
        : `Pożyczyłeś ${amount} ${currencyCode} — termin spłaty wkrótce`,
    debtOverdueTitle: ({ contactName }) => `Dług przeterminowany: ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${amount} ${currencyCode}, które pożyczyłeś, jest przeterminowane`
        : `${amount} ${currencyCode}, które pożyczyłeś, jest przeterminowane`,
    recurringExpenseTitle: ({ description }) => `Cykliczny wydatek zarejestrowany: ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${amount} ${currencyCode} automatycznie dodane (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} wspomniał o tobie`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} podrożał`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} pobrał ${currencyCode} ${newAmount} zamiast ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Możliwa podwójna płatność',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} pobrał ${currencyCode} ${amount} dwa razy w ciągu dwóch dni. Warto sprawdzić.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} wygląda na subskrypcję`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} regularnie pobiera ${currencyCode} ${amount}. Śledzić jako subskrypcję?`,
  },
  es: {
    sharedExpenseTitle: ({ accountName }) => `Nuevo gasto en "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} agregó ${amount} ${currencyCode} por ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Presupuesto "${budgetName}" al ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Gastado ${spent} ${currencyCode} de ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `¡Presupuesto "${budgetName}" superado!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Has gastado ${spent} ${currencyCode} de tu presupuesto de ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Gasto inusual en ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Has gastado ${percent}% más de lo habitual en ${categoryName} este mes.`,
    subscriptionActivatedTitle: () => '¡Suscripción activada!',
    subscriptionActivatedBody: ({ tier }) => `Tu periodo de prueba ha terminado. La suscripción ${tier} está activa.`,
    paymentSuccessTitle: () => 'Pago exitoso',
    paymentSuccessBody: ({ amount, currency, tier }) => `El pago de ${amount} ${currency} por la suscripción ${tier} fue exitoso.`,
    paymentFailedTitle: () => 'Error de pago',
    paymentFailedBody: () => 'No se pudo cobrar la suscripción. Actualiza tu método de pago para mantener el acceso.',
    trialReminderTitle: () => 'La prueba termina mañana',
    trialReminderBody: ({ tier }) => `Tu periodo de prueba ${tier} termina mañana. Después se cobrará el pago.`,
    trialReminderEmailSubject: () => 'Tu periodo de prueba termina mañana',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>¡Hola ${name}!</h2><p>Tu periodo de prueba <strong>${tier}</strong> termina mañana.</p><p>Después del periodo de prueba, se cobrará automáticamente a tu tarjeta la suscripción.</p><p>Si no deseas continuar, cancela tu suscripción en la sección "Suscripción" de la app.</p>`,
    newReferralTitle: () => '¡Nuevo referido!',
    newReferralBody: ({ name }) => `¡Tu amigo ${name} se unió con tu código!`,
    referralQualifiedTitle: () => '¡Referido confirmado!',
    referralQualifiedBody: ({ name, bonus }) => `¡Tu referido ${name} está activo! Ganaste +${bonus} solicitudes AI.`,
    referralMilestone5Title: () => '¡5 referidos!',
    referralMilestone5Body: () => '¡Ganaste un mes gratis de Pro! Revisa tu email.',
    debtUpcomingTitle: ({ contactName, days }) => `Deuda en ${days} día${days === 1 ? '' : 's'}: ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `Prestaste ${currencyCode} ${amount} — vencimiento pronto`
        : `Tomaste prestado ${currencyCode} ${amount} — vencimiento pronto`,
    debtOverdueTitle: ({ contactName }) => `Deuda vencida: ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${currencyCode} ${amount} que prestaste está vencido`
        : `${currencyCode} ${amount} que tomaste prestado está vencido`,
    recurringExpenseTitle: ({ description }) => `Gasto recurrente registrado: ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${currencyCode} ${amount} registrado automáticamente (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} te mencionó`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} ha subido de precio`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} cobró ${currencyCode} ${newAmount}, antes ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Posible cargo duplicado',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} cobró ${currencyCode} ${amount} dos veces en dos días. Conviene revisarlo.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} parece una suscripción`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} cobra ${currencyCode} ${amount} con regularidad. ¿Quieres seguirla como suscripción?`,
  },
  fr: {
    sharedExpenseTitle: ({ accountName }) => `Nouvelle dépense dans "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} a ajouté ${amount} ${currencyCode} pour ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budget "${budgetName}" à ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `${spent} ${currencyCode} dépensés sur ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Budget "${budgetName}" dépassé !`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Vous avez dépensé ${spent} ${currencyCode} sur votre budget de ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Dépense inhabituellement élevée : ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Vous avez dépensé ${percent}% de plus que d'habitude pour ${categoryName} ce mois-ci.`,
    subscriptionActivatedTitle: () => 'Abonnement activé !',
    subscriptionActivatedBody: ({ tier }) => `Votre essai est terminé. L'abonnement ${tier} est maintenant actif.`,
    paymentSuccessTitle: () => 'Paiement réussi',
    paymentSuccessBody: ({ amount, currency, tier }) => `Le paiement de ${amount} ${currency} pour l'abonnement ${tier} a réussi.`,
    paymentFailedTitle: () => 'Échec du paiement',
    paymentFailedBody: () => 'Le paiement de l\'abonnement a échoué. Veuillez mettre à jour votre moyen de paiement.',
    trialReminderTitle: () => 'L\'essai se termine demain',
    trialReminderBody: ({ tier }) => `Votre essai ${tier} se termine demain. Le paiement sera prélevé après.`,
    trialReminderEmailSubject: () => 'Votre essai se termine demain',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>Bonjour ${name} !</h2><p>Votre essai <strong>${tier}</strong> se termine demain.</p><p>Après la période d'essai, votre carte sera automatiquement débitée pour l'abonnement.</p><p>Si vous ne souhaitez pas continuer, annulez votre abonnement dans la section « Abonnement » de l'application.</p>`,
    newReferralTitle: () => 'Nouveau parrainage !',
    newReferralBody: ({ name }) => `Votre ami ${name} a rejoint avec votre code !`,
    referralQualifiedTitle: () => 'Parrainage confirmé !',
    referralQualifiedBody: ({ name, bonus }) => `Votre filleul ${name} est actif ! Vous avez gagné +${bonus} requêtes AI.`,
    referralMilestone5Title: () => '5 parrainages !',
    referralMilestone5Body: () => 'Vous avez gagné un mois Pro gratuit ! Vérifiez votre email.',
    debtUpcomingTitle: ({ contactName, days }) => `Dette dans ${days} jour${days === 1 ? '' : 's'} : ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `Vous avez prêté ${amount} ${currencyCode} — échéance prochaine`
        : `Vous avez emprunté ${amount} ${currencyCode} — échéance prochaine`,
    debtOverdueTitle: ({ contactName }) => `Dette en retard : ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${amount} ${currencyCode} que vous avez prêté est en retard`
        : `${amount} ${currencyCode} que vous avez emprunté est en retard`,
    recurringExpenseTitle: ({ description }) => `Dépense récurrente enregistrée : ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${amount} ${currencyCode} enregistré automatiquement (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} vous a mentionné`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} a augmenté`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} a prélevé ${currencyCode} ${newAmount} au lieu de ${currencyCode} ${oldAmount} (+${percent} %).`,
    duplicateChargeTitle: () => 'Possible double prélèvement',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} a prélevé ${currencyCode} ${amount} deux fois en deux jours. À vérifier.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} ressemble à un abonnement`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} prélève ${currencyCode} ${amount} régulièrement. Le suivre comme abonnement ?`,
  },
  de: {
    sharedExpenseTitle: ({ accountName }) => `Neue Ausgabe in "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} hat ${amount} ${currencyCode} für ${description} hinzugefügt`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budget "${budgetName}" zu ${threshold}% genutzt`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `${spent} ${currencyCode} von ${total} ${currencyCode} ausgegeben.`,
    budgetExceededTitle: ({ budgetName }) => `Budget "${budgetName}" überschritten!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Du hast ${spent} ${currencyCode} von deinem Budget von ${total} ${currencyCode} ausgegeben.`,
    anomalyTitle: ({ categoryName }) => `Ungewöhnliche Ausgaben: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Du hast diesen Monat ${percent}% mehr als üblich für ${categoryName} ausgegeben.`,
    subscriptionActivatedTitle: () => 'Abonnement aktiviert!',
    subscriptionActivatedBody: ({ tier }) => `Deine Testphase ist beendet. Das ${tier}-Abonnement ist jetzt aktiv.`,
    paymentSuccessTitle: () => 'Zahlung erfolgreich',
    paymentSuccessBody: ({ amount, currency, tier }) => `Zahlung von ${amount} ${currency} für das ${tier}-Abonnement war erfolgreich.`,
    paymentFailedTitle: () => 'Zahlungsfehler',
    paymentFailedBody: () => 'Die Abbuchung für das Abonnement ist fehlgeschlagen. Bitte aktualisiere deine Zahlungsdaten.',
    trialReminderTitle: () => 'Testphase endet morgen',
    trialReminderBody: ({ tier }) => `Deine ${tier}-Testphase endet morgen. Danach wird die Zahlung abgebucht.`,
    trialReminderEmailSubject: () => 'Deine Testphase endet morgen',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>Hallo ${name}!</h2><p>Deine <strong>${tier}</strong>-Testphase endet morgen.</p><p>Nach der Testphase wird deine Karte automatisch für das Abonnement belastet.</p><p>Wenn du nicht fortfahren möchtest, kündige dein Abonnement im Abschnitt „Abonnement" der App.</p>`,
    newReferralTitle: () => 'Neue Empfehlung!',
    newReferralBody: ({ name }) => `Dein Freund ${name} ist mit deinem Code beigetreten!`,
    referralQualifiedTitle: () => 'Empfehlung bestätigt!',
    referralQualifiedBody: ({ name, bonus }) => `Deine Empfehlung ${name} ist aktiv! Du hast +${bonus} AI-Anfragen verdient.`,
    referralMilestone5Title: () => '5 Empfehlungen!',
    referralMilestone5Body: () => 'Du hast einen kostenlosen Monat Pro verdient! Prüfe deine E-Mail.',
    debtUpcomingTitle: ({ contactName, days }) => `Schulden in ${days} Tag${days === 1 ? '' : 'en'}: ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `Du hast ${amount} ${currencyCode} geliehen — Fälligkeit bald`
        : `Du hast ${amount} ${currencyCode} geliehen bekommen — Fälligkeit bald`,
    debtOverdueTitle: ({ contactName }) => `Schulden überfällig: ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${amount} ${currencyCode}, die du geliehen hast, sind überfällig`
        : `${amount} ${currencyCode}, die du geliehen bekommen hast, sind überfällig`,
    recurringExpenseTitle: ({ description }) => `Wiederkehrende Ausgabe gebucht: ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${amount} ${currencyCode} automatisch hinzugefügt (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} hat dich erwähnt`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} ist teurer geworden`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} hat ${currencyCode} ${newAmount} statt ${currencyCode} ${oldAmount} abgebucht (+${percent} %).`,
    duplicateChargeTitle: () => 'Mögliche doppelte Abbuchung',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} hat ${currencyCode} ${amount} zweimal innerhalb von zwei Tagen abgebucht. Bitte prüfen.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} sieht nach einem Abo aus`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} bucht regelmäßig ${currencyCode} ${amount} ab. Als Abo verfolgen?`,
  },
  be: {
    sharedExpenseTitle: ({ accountName }) => `Новы расход у "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} дадаў ${amount} ${currencyCode} за ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Бюджэт "${budgetName}" выкарыстаны на ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Патрачана ${spent} ${currencyCode} з ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Бюджэт "${budgetName}" перавышаны!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Патрачана ${spent} ${currencyCode} з запланаваных ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Незвычайныя выдаткі: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `У гэтым месяцы вы патрацілі на ${percent}% больш за звычайнае на ${categoryName}.`,
    subscriptionActivatedTitle: () => 'Падпіска актывавана!',
    subscriptionActivatedBody: ({ tier }) => `Ваш пробны перыяд скончыўся. Падпіска ${tier} цяпер актыўная.`,
    paymentSuccessTitle: () => 'Аплата прайшла паспяхова',
    paymentSuccessBody: ({ amount, currency, tier }) => `Аплата ${amount} ${currency} за падпіску ${tier} прайшла паспяхова.`,
    paymentFailedTitle: () => 'Памылка аплаты',
    paymentFailedBody: () => 'Не атрымалася спісаць аплату за падпіску. Абнавіце плацёжныя дадзеныя, каб захаваць доступ.',
    trialReminderTitle: () => 'Пробны перыяд заканчваецца заўтра',
    trialReminderBody: ({ tier }) => `Ваш пробны перыяд ${tier} заканчваецца заўтра. Пасля гэтага будзе спісана аплата.`,
    trialReminderEmailSubject: () => 'Ваш пробны перыяд заканчваецца заўтра',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>Прывітанне, ${name}!</h2><p>Ваш пробны перыяд <strong>${tier}</strong> заканчваецца заўтра.</p><p>Пасля заканчэння пробнага перыяду з вашай карткі будзе аўтаматычна спісана аплата за падпіску.</p><p>Калі вы не жадаеце працягваць, скасуйце падпіску ў раздзеле «Падпіска» ў дадатку.</p>`,
    newReferralTitle: () => 'Новы рэферал!',
    newReferralBody: ({ name }) => `Ваш сябар ${name} далучыўся па вашаму коду!`,
    referralQualifiedTitle: () => 'Рэферал пацверджаны!',
    referralQualifiedBody: ({ name, bonus }) => `Ваш рэферал ${name} актыўны! Вы атрымалі +${bonus} AI запытаў.`,
    referralMilestone5Title: () => '5 рэфералаў!',
    referralMilestone5Body: () => 'Вы заработалі бясплатны месяц Pro! Праверце email.',
    debtUpcomingTitle: ({ contactName, days }) => `Доўг праз ${days} ${days === 1 ? 'дзень' : days < 5 ? 'дні' : 'дзён'}: ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `Вы пазычылі ${amount} ${currencyCode} — тэрмін пагашэння хутка`
        : `Вы ўзялі ${amount} ${currencyCode} — тэрмін пагашэння хутка`,
    debtOverdueTitle: ({ contactName }) => `Доўг прасрочаны: ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${amount} ${currencyCode}, якія вы пазычылі, прасрочаны`
        : `${amount} ${currencyCode}, якія вы ўзялі, прасрочаны`,
    recurringExpenseTitle: ({ description }) => `Рэгулярны расход запісаны: ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${amount} ${currencyCode} аўтаматычна дадана (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} згадаў вас`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} падаражэў`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} спісаў ${currencyCode} ${newAmount} замест ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Магчымы паўторны плацёж',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} спісаў ${currencyCode} ${amount} двойчы за два дні. Варта праверыць.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} падобны на падпіску`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} рэгулярна спісвае ${currencyCode} ${amount}. Адсочваць як падпіску?`,
  },
  nl: {
    sharedExpenseTitle: ({ accountName }) => `Nieuwe uitgave in "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} heeft ${currencyCode} ${amount} toegevoegd voor ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budget "${budgetName}" op ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `${currencyCode} ${spent} van ${currencyCode} ${total} gebruikt.`,
    budgetExceededTitle: ({ budgetName }) => `Budget "${budgetName}" overschreden!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Je hebt ${currencyCode} ${spent} van je budget van ${currencyCode} ${total} uitgegeven.`,
    anomalyTitle: ({ categoryName }) => `Ongewone uitgaven: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Je hebt deze maand ${percent}% meer dan gebruikelijk uitgegeven aan ${categoryName}.`,
    subscriptionActivatedTitle: () => 'Abonnement geactiveerd!',
    subscriptionActivatedBody: ({ tier }) => `Je proefperiode is beëindigd. Het ${tier}-abonnement is nu actief.`,
    paymentSuccessTitle: () => 'Betaling geslaagd',
    paymentSuccessBody: ({ amount, currency, tier }) => `Betaling van ${amount} ${currency} voor het ${tier}-abonnement is geslaagd.`,
    paymentFailedTitle: () => 'Betaling mislukt',
    paymentFailedBody: () => 'De abonnementsbetaling is mislukt. Werk je betaalmethode bij om toegang te behouden.',
    trialReminderTitle: () => 'Proefperiode eindigt morgen',
    trialReminderBody: ({ tier }) => `Je ${tier}-proefperiode eindigt morgen. Daarna wordt de betaling afgeschreven.`,
    trialReminderEmailSubject: () => 'Je proefperiode eindigt morgen',
    trialReminderEmailHtml: (name, { tier }) =>
      `<h2>Hoi ${name}!</h2><p>Je <strong>${tier}</strong>-proefperiode eindigt morgen.</p><p>Na de proefperiode wordt je kaart automatisch belast voor het abonnement.</p><p>Als je niet wilt doorgaan, annuleer dan je abonnement in het onderdeel "Abonnement" van de app.</p>`,
    newReferralTitle: () => 'Nieuwe verwijzing!',
    newReferralBody: ({ name }) => `Je vriend ${name} is lid geworden via jouw verwijzingscode!`,
    referralQualifiedTitle: () => 'Verwijzing bevestigd!',
    referralQualifiedBody: ({ name, bonus }) => `Je verwijzing ${name} is actief! Je hebt +${bonus} AI-verzoeken verdiend.`,
    referralMilestone5Title: () => '5 verwijzingen!',
    referralMilestone5Body: () => 'Je hebt een gratis maand Pro verdiend! Controleer je e-mail.',
    debtUpcomingTitle: ({ contactName, days }) => `Schuld over ${days} dag${days === 1 ? '' : 'en'}: ${contactName}`,
    debtUpcomingBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `Je hebt ${currencyCode} ${amount} uitgeleend — aflossing binnenkort`
        : `Je hebt ${currencyCode} ${amount} geleend — aflossing binnenkort`,
    debtOverdueTitle: ({ contactName }) => `Schuld achterstallig: ${contactName}`,
    debtOverdueBody: ({ amount, currencyCode, type }) =>
      type === 'lent'
        ? `${currencyCode} ${amount} die je hebt uitgeleend is achterstallig`
        : `${currencyCode} ${amount} die je hebt geleend is achterstallig`,
    recurringExpenseTitle: ({ description }) => `Terugkerende uitgave geregistreerd: ${description}`,
    recurringExpenseBody: ({ amount, currencyCode, period }) =>
      `${currencyCode} ${amount} automatisch geregistreerd (${period})`,
    chatMentionTitle: ({ senderName }) => `${senderName} heeft je genoemd`,
    chatMentionBody: ({ preview }) => preview,
    priceIncreaseTitle: ({ merchant }) => `${merchant} is duurder geworden`,
    priceIncreaseBody: ({ merchant, oldAmount, newAmount, currencyCode, percent }) =>
      `${merchant} rekende ${currencyCode} ${newAmount} af in plaats van ${currencyCode} ${oldAmount} (+${percent}%).`,
    duplicateChargeTitle: () => 'Mogelijk dubbele afschrijving',
    duplicateChargeBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} schreef ${currencyCode} ${amount} twee keer af binnen twee dagen. Controleer dit even.`,
    recurringSuggestionTitle: ({ merchant }) => `${merchant} lijkt op een abonnement`,
    recurringSuggestionBody: ({ merchant, amount, currencyCode }) =>
      `${merchant} schrijft regelmatig ${currencyCode} ${amount} af. Volgen als abonnement?`,
  },
};

function t(lang: Lang) {
  return translations[lang] || translations['en'];
}

export function sharedExpenseTitle(lang: Lang, params: SharedExpenseParams): string {
  return t(lang).sharedExpenseTitle(params);
}

export function sharedExpenseBody(lang: Lang, params: SharedExpenseParams): string {
  return t(lang).sharedExpenseBody(params);
}

export function budgetThresholdTitle(lang: Lang, params: BudgetThresholdParams): string {
  return t(lang).budgetThresholdTitle(params);
}

export function budgetThresholdBody(lang: Lang, params: BudgetThresholdParams): string {
  return t(lang).budgetThresholdBody(params);
}

export function budgetExceededTitle(lang: Lang, params: BudgetThresholdParams): string {
  return t(lang).budgetExceededTitle(params);
}

export function budgetExceededBody(lang: Lang, params: BudgetThresholdParams): string {
  return t(lang).budgetExceededBody(params);
}

export function anomalyTitle(lang: Lang, params: SpendingAnomalyParams): string {
  return t(lang).anomalyTitle(params);
}

export function anomalyBody(lang: Lang, params: SpendingAnomalyParams): string {
  return t(lang).anomalyBody(params);
}

export function subscriptionActivatedTitle(lang: Lang): string {
  return t(lang).subscriptionActivatedTitle();
}
export function subscriptionActivatedBody(lang: Lang, params: SubscriptionActivatedParams): string {
  return t(lang).subscriptionActivatedBody(params);
}
export function paymentSuccessTitle(lang: Lang): string {
  return t(lang).paymentSuccessTitle();
}
export function paymentSuccessBody(lang: Lang, params: PaymentSuccessParams): string {
  return t(lang).paymentSuccessBody(params);
}
export function paymentFailedTitle(lang: Lang): string {
  return t(lang).paymentFailedTitle();
}
export function paymentFailedBody(lang: Lang): string {
  return t(lang).paymentFailedBody();
}
export function trialReminderTitle(lang: Lang): string {
  return t(lang).trialReminderTitle();
}
export function trialReminderBody(lang: Lang, params: TrialReminderParams): string {
  return t(lang).trialReminderBody(params);
}
export function trialReminderEmailSubject(lang: Lang): string {
  return t(lang).trialReminderEmailSubject();
}
export function trialReminderEmailHtml(lang: Lang, name: string, params: TrialReminderParams): string {
  return t(lang).trialReminderEmailHtml(name, params);
}

export function newReferralTitle(lang: Lang): string {
  return t(lang).newReferralTitle();
}
export function newReferralBody(lang: Lang, params: ReferralNameParams): string {
  return t(lang).newReferralBody(params);
}
export function referralQualifiedTitle(lang: Lang): string {
  return t(lang).referralQualifiedTitle();
}
export function referralQualifiedBody(lang: Lang, params: ReferralQualifiedParams): string {
  return t(lang).referralQualifiedBody(params);
}
export function referralMilestone5Title(lang: Lang): string {
  return t(lang).referralMilestone5Title();
}
export function referralMilestone5Body(lang: Lang): string {
  return t(lang).referralMilestone5Body();
}
export function debtUpcomingTitle(lang: Lang, params: DebtUpcomingParams): string {
  return t(lang).debtUpcomingTitle(params);
}
export function debtUpcomingBody(lang: Lang, params: DebtUpcomingParams): string {
  return t(lang).debtUpcomingBody(params);
}
export function debtOverdueTitle(lang: Lang, params: DebtOverdueParams): string {
  return t(lang).debtOverdueTitle(params);
}
export function debtOverdueBody(lang: Lang, params: DebtOverdueParams): string {
  return t(lang).debtOverdueBody(params);
}
export function recurringExpenseTitle(lang: Lang, params: RecurringExpenseParams): string {
  return t(lang).recurringExpenseTitle(params);
}
export function recurringExpenseBody(lang: Lang, params: RecurringExpenseParams): string {
  return t(lang).recurringExpenseBody(params);
}
export function chatMentionTitle(lang: Lang, params: ChatMentionParams): string {
  return t(lang).chatMentionTitle(params);
}
export function chatMentionBody(lang: Lang, params: ChatMentionParams): string {
  return t(lang).chatMentionBody(params);
}

export function priceIncreaseTitle(lang: Lang, params: PriceIncreaseParams): string {
  return t(lang).priceIncreaseTitle(params);
}

export function priceIncreaseBody(lang: Lang, params: PriceIncreaseParams): string {
  return t(lang).priceIncreaseBody(params);
}

export function duplicateChargeTitle(lang: Lang, params: DuplicateChargeParams): string {
  return t(lang).duplicateChargeTitle(params);
}

export function duplicateChargeBody(lang: Lang, params: DuplicateChargeParams): string {
  return t(lang).duplicateChargeBody(params);
}

export function recurringSuggestionTitle(lang: Lang, params: RecurringSuggestionParams): string {
  return t(lang).recurringSuggestionTitle(params);
}

export function recurringSuggestionBody(lang: Lang, params: RecurringSuggestionParams): string {
  return t(lang).recurringSuggestionBody(params);
}
