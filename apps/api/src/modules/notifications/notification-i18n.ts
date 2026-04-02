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
