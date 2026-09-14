# Receipt Split — get paid back by friends, no app required

> Assign a shared bill's items to the friends who had them, and each friend gets a private link to their own share — no app, no account, just a tap to say "I paid."

## What it is

When you've paid a bill for a group — a restaurant tab, a shared grocery run — Receipt Split lets you divide it among the people who were there and send each one a private link. They open it, see only what they owe, and can tap a button to pay you back. You watch who's paid, and confirm the money once it actually arrives.

## Where to find it

Open the expense for the bill you paid and tap the **people icon** in the header. It only appears if you can edit the expense — viewers on a shared account won't see it — and you can't split a bill that was itself created by someone else's split.

## Splitting a bill

1. Tap **Add person** and type each friend's name (up to 20 people).
2. **If the receipt has line items:** tap an item, then tap everyone who had it — tap a person again to take them off. An item shared by several people is divided equally between them. Anything you never assign stays as your own share.
3. **If the receipt has no line items:** the whole bill is simply divided equally between you and everyone you've added.
4. Tap **Create links**. The app works out everyone's share and gives you one private link per friend.

The app won't let the assigned shares add up to more than what you actually paid — if they do, you'll see a warning before you can continue.

### Deciding who pays how much

Once at least one person is on a line, an editor appears underneath showing how that line splits between them and you. Switch between **%** and **Amount** and type what each person owes. **You** are always the last row - your share is whatever is left of the line, and you never type it. Tap **Split equally** to go back to an even division.

A line doesn't have to be given away completely: put your friend on 60% and the remaining 40% is simply yours. If a line's shares add up to more than the whole line, the app says so and won't let you continue.

## Sending the links

Send each friend their link however you like — text message, WhatsApp, email, anything your phone can share to. There's also a **Copy all links** button that copies every friend's name and link at once. A friend never needs to install the app or create an account to use their link.

### Still at the table? Show one QR code instead

If everyone's still sitting there, tap **Show QR code** instead of sending links one by one. Hold up your screen, and everyone scans the same code with their phone's camera — no typing a number, no waiting for a text to arrive. Scanning it opens a page listing everyone's name; each person taps their own name, confirms "yes, that's me," and lands straight on their own private share — exactly the same page they'd have gotten from an individual link. Sending links one at a time is still there for anyone who isn't physically present.

## What your friend sees

Opening the link shows only that one person's own share: the merchant and date, "*You* paid for everyone," their items (or their equal share of the bill if there were no line items), and the amount they owe, in the bill's own currency. Each line shows **their** share of it, not its full price — an item three people shared is marked as shared and counted at a third — so the lines always add up to the amount they're asked for. If you scanned the receipt, there's also a link to open the photo or PDF, so they can check the bill themselves. The page opens in your app's language, not necessarily theirs.

Set up how you'd like to get paid under **Settings → Profile → Payment Settings**. You can add up to five methods, and your friend's page shows all of them, so they can use whichever suits them. Revolut and PayPal each appear as a ready-to-tap button with the amount already filled in; BLIK has no way to link across banks, so it shows your number with instructions instead; cash and other show whatever you typed as instructions instead of a button. You can set this up — or change it — any time, even after you've already sent a link, since the page reads your payment details fresh each time your friend opens it. If you haven't added anything, your friend just sees the amount, with no pay button, and you'll arrange payment another way.

Either way, there's an **"I already paid"** button. Tapping it doesn't move any money — it just tells you they've paid.

### If something's wrong with their share

If your friend spots a mistake — a line they weren't actually part of, or a shared item split among the wrong number of people — they can say so right from their own page, no need to text you about it. Under each item (or under the total, if the bill was split equally) there's a small **"Something wrong with this?"** link; tapping it opens a short optional note, then **Report**. Flagging never blocks them from also tapping "I already paid" — the two are independent, in either order.

## Tracking who's paid

Back in the app, each friend's row shows a status:

- **Sent** — the link was created but hasn't been opened yet.
- **Opened** — they've opened the link.
- **Says they paid** — they tapped "I already paid."
- **Settled** — you've confirmed the money actually arrived.

A friend who hasn't paid yet simply stays at **Sent** or **Opened** — there's nothing more to it than that.

If a friend flagged something wrong with their share, you'll see it right under their row, along with their note (if they added one). If the flag is about one specific item, tap **Edit assignment** right there to change who's on that line — the fix is instant and clears the flag on its own, no need to cancel anything. If the flag is about their whole share instead (only possible when the bill was split equally, or if they said they weren't part of it at all), there's no single line to fix that way — tap **Resolve** once you've sorted it out another way, and to actually change who owes what you'll need to cancel the split and create a new one with the corrected shares. Either kind of fix is blocked once anyone on the split has said they've paid or been confirmed as settled — cancel and recreate the split in that case instead.

## Confirming you've been paid

Once a friend's status is **Says they paid**, a **Confirm received** button appears on their row. Tap it once the money has actually reached you. This records it as a repayment against that friend's share — the same way any repayment is recorded elsewhere in the app — and their row moves to **Settled**.

Each friend's share also appears in your **Debts & Loans** screen under their name, just like any other money you've lent, until it's settled.

## Your own share

The amount labelled **Your share** at the top of the screen is whatever is left of the bill once every friend's share is subtracted — you never enter it yourself.

## Cancelling a split

Tap **Cancel split** to stop it. This immediately breaks every friend's link and removes the debts the split created — including any already marked as settled — so only cancel if you're sure. After cancelling, you can start a fresh split for the same bill at any time.

## Links expire after 30 days

A link that hasn't been used within 30 days of creation simply stops working. If a friend opens it after that — or after you've cancelled the split — they see a plain "this link isn't available" message instead of your bill.

## Good to know

- Not available on **fully end-to-end encrypted** accounts — the server needs to read the receipt to build your friends' pages, and encryption keeps that from happening.
- Only account owners and editors can create, cancel, or confirm a split. Viewers don't see the split option.
- You can't split a bill that was itself created by someone else's split.
- Amounts are always shown in the bill's own currency — nothing is ever converted.
- If the receipt had a **discount**, everyone's share is worked out from what you actually paid, not from the printed prices - so a friend never pays the pre-discount price of their items.
