# Connected apps & developers

> Let another app you use — accounting software, for example — work with your AI Budget expenses, see exactly what it is allowed to do, and cut it off in one tap. Developers can build such apps on the AI Budget API.

## What connecting an app means

Some products can work with your AI Budget data from inside their own screens: an accounting app can pick up your expenses and receipts, or add expenses for you. To allow it, you connect the app to **one** of your AI Budget accounts.

The app never sees your password. When you click its "Connect AI Budget" button, it sends you to an AI Budget page where you sign in as usual and see:

- the app's name, its website and who made it;
- **Verified by AI Budget** (an app we have checked, such as our own) or **Not verified by AI Budget**;
- the list of permissions the app asks for;
- **Account to connect** — pick which account the app may use.

Tap **Allow** to connect, or **Deny** to send you back to the app without connecting. Only allow apps you trust.

## What each permission allows

- **See your expenses: amounts, dates, categories, items and tags** — the app can read the expenses of the connected account, including the line items of a receipt and later changes and deletions.
- **Add, change and delete expenses** — the app can write to that account. Expenses it adds show **Added via** and the app's name on the expense screen.
- **Download your receipt photos** — the app can download the receipt image or PDF attached to an expense.
- **See your expense categories** — the app can read your category list, so it can file new expenses correctly.

Every connected app can also see the account's name, type and currency, and your name. It never gets your e-mail address, and it can never see your other accounts.

## Seeing and disconnecting apps

Open **Settings → Connected apps**. Each app is listed with the account it is connected to, who connected it and when, when it was last used, and its permissions.

Tap **Disconnect** and confirm. The app loses access to that account immediately — its next request is refused. Expenses it already added stay in your account. To use the app again, connect it again from the app.

Every time an app is connected, we send an e-mail to the person who connected it. If you get one and don't recognise the app, disconnect it right away.

If you don't see **Connected apps** in Settings, connecting apps is not available yet.

## Shared accounts

Only an **owner** or an **editor** of an account can connect an app to it; someone who can only view an account sees it greyed out.

An app connected to a shared account sees **everyone's** expenses in it, not only those of the person who connected it. That is why every owner and editor of the account sees all apps connected to it under **Connected apps**, with who connected each one, and can disconnect any of them. When an editor connects an app, the account's owners get the e-mail too.

If the person who connected an app later becomes a viewer or leaves the account, the app stops working for that account.

## Encrypted accounts

- An account with **full encryption** (amounts encrypted too) cannot be connected at all — the app could not read anything in it.
- An account with **text encryption** can be connected **read-only**: the app sees amounts, dates and categories, but descriptions, notes, merchants, item names, tags and other encrypted text stay hidden, and it cannot add or change expenses.

See [End-to-End Encryption](./15-encryption.md) for what each level covers.

## For developers

You can build your own app on the AI Budget API — it's free. Open **Settings → Developers** and tap **Create app**: give it a name, a homepage and the redirect addresses it will use, and choose **Server app** or **Mobile or browser app**. You get a **Client ID** right away; a server app also gets a client secret, shown **only once** — copy it immediately.

The full API reference and a step-by-step guide (in English, Polish and Russian) are at [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), also linked from **API documentation** on the Developers screen. You can register up to 10 apps.
