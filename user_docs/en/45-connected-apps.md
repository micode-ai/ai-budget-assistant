# Connected apps & developers

> Let another app you use — accounting software, for example — work with your AI Budget expenses, see exactly what it is allowed to do, and cut it off in one tap. Developers can build such apps on the AI Budget API.

## What connecting an app means

Some products can work with your AI Budget data from inside their own screens: an accounting app can pick up your expenses and receipts, or add expenses for you. To allow it, you connect the app to **one or more** of your AI Budget accounts.

The app never sees your password. When you click its "Connect AI Budget" button, it sends you to an AI Budget page where you sign in as usual and see:

- the app's name, its website and who made it;
- **Verified by AI Budget** (an app we have checked, such as our own) or **Not verified by AI Budget**;
- the list of permissions the app asks for;
- **Accounts to connect** — a checkbox for every account. Tick each account the app may use; **Allow** stays disabled until at least one is ticked. If only one account can be connected, it is already ticked. Accounts you can only view, or that use full encryption, are greyed out with the reason, and an account with text encryption is marked read-only.

Tap **Allow** to connect, or **Deny** to send you back to the app without connecting. Only allow apps you trust.

**Connecting an app again.** If the app is already connected, the screen opens with the accounts it already has ticked, together with any other account that can still be connected. What you tick is the full list: tick a new account to add it, untick one to cut the app off from it. The app's access to the accounts you leave ticked keeps working without interruption.

When an app has several accounts, it tells us which one each request is about — you do not have to do anything.

## What each permission allows

- **See your expenses: amounts, dates, categories, items and tags** — the app can read the expenses of the connected account, including the line items of a receipt and later changes and deletions.
- **Add, change and delete expenses** — the app can write to that account. Expenses it adds show **Added via** and the app's name on the expense screen.
- **Download your receipt photos** — the app can download the receipt image or PDF attached to an expense.
- **See your expense categories** — the app can read your category list, so it can file new expenses correctly.
- **See and add your income** — the app can read the income of the connected account and, with the write permission, add, change and delete income entries. Income it adds shows **Added via** and the app's name. Income created by a transfer between your accounts is read-only.
- **See and manage your budgets** — the app can read your budgets with the progress of the current period and, with the write permission, create, change and delete them.
- **See your income and spending totals** — the app can read summaries: totals by category and by month. It shares those totals, not individual entries, and the figures are converted into your display currency.

Every connected app can also see the name, type and currency of the accounts you ticked, and your name. It never gets your e-mail address, and it can never see an account you did not tick.

## Seeing and disconnecting apps

Open **Settings → Connected apps**. Each app is one row, listing the accounts it is connected to, who connected it and when, when it was last used, and its permissions.

To cut off **one account**, tap **Remove account** next to it and confirm. The app loses that account immediately — its next request for it is refused — while its other accounts keep working. Removing the last account disconnects the app completely.

To cut off the whole app, tap **Disconnect** and confirm. It loses access to all its accounts at once. Expenses it already added stay in your accounts. To use the app again, connect it again from the app.

Every time an app is connected or gets new accounts, we send an e-mail to the person who did it, listing the added accounts. If you get one and don't recognise the app, disconnect it right away.

If you don't see **Connected apps** in Settings, connecting apps is not available yet.

## Shared accounts

Only an **owner** or an **editor** of an account can connect an app to it; someone who can only view an account sees it greyed out.

An app connected to a shared account sees **everyone's** expenses in it, not only those of the person who connected it. That is why every owner and editor of such an account sees the app under **Connected apps**, with who connected it, and can remove it from that account.

You only ever see the accounts of a connection that you yourself own or edit — never the other accounts the person who connected the app chose. When you tap **Disconnect**, the app loses only those accounts of yours; it stays connected for the person who set it up, and only that person can disconnect it completely. When an editor connects an app, the owners of the connected accounts get an e-mail too, listing only their own accounts.

If the person who connected an app later becomes a viewer or leaves an account, the app stops working for that account; its other accounts are not affected. An account that is deleted is dropped from the app automatically.

## Encrypted accounts

- An account with **full encryption** (amounts encrypted too) cannot be connected at all — the app could not read anything in it.
- An account with **text encryption** can be connected **read-only**: the app sees amounts, dates and categories, but descriptions, notes, merchants, item names, tags and other encrypted text stay hidden, and it cannot add or change expenses.

See [End-to-End Encryption](./15-encryption.md) for what each level covers.

## For developers

You can build your own app on the AI Budget API — it's free. Open **Settings → Developers** and tap **Create app**: give it a name, a homepage and the redirect addresses it will use, and choose **Server app** or **Mobile or browser app**. You get a **Client ID** right away; a server app also gets a client secret, shown **only once** — copy it immediately.

The full API reference and a step-by-step guide (in English, Polish and Russian) are at [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), also linked from **API documentation** on the Developers screen. You can register up to 10 apps.
