# End-to-End Encryption

> Protect your financial data with end-to-end encryption (E2EE). All sensitive information is encrypted on your device before being sent to the server — no one except you (and your shared account members) can read it.

## Overview

End-to-end encryption ensures that your descriptions, notes, category names, and other text data are encrypted on your device before syncing. The server only stores encrypted data and cannot read it, even if the database is compromised.

You control encryption with a separate **encryption passphrase** that is never sent to the server.

## Setting Up Encryption

1. Open **Settings**
2. Scroll to the **Security** section
3. Tap **Enable Encryption**
4. Enter an **encryption passphrase** (minimum 8 characters)
   - This is separate from your login password
   - Choose a strong passphrase you can remember
5. Confirm the passphrase
6. A **Recovery Key** will be displayed on screen

> **Important:** Save your Recovery Key immediately! Write it down or store it in a password manager. Format: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. This is the **only way** to recover your data if you forget the passphrase.

After setup, encryption is automatically enabled for your current account.

## Unlocking Encryption

After restarting the app or when your session expires, encryption is locked. Your data is still stored securely, but encrypted fields will appear empty until you unlock.

To unlock:

1. Open **Settings** > **Security**
2. Tap **Unlock Encryption**
3. Enter your encryption passphrase
4. Your data becomes readable again

## What Gets Encrypted

Encryption works in two tiers:

### Tier 1 — Text Fields (default)

| Data | Encrypted |
|---|---|
| Expense descriptions and notes | Yes |
| Location names | Yes |
| Receipt data | Yes |
| Category names | Yes |
| Tag names | Yes |
| Project names and descriptions | Yes |
| Budget names | Yes |
| Amounts, dates, currencies | No — stays in plaintext |

**Server features** (analytics, budget alerts, AI insights) continue to work because amounts and dates remain accessible.

### Tier 2 — Full Encryption (opt-in)

Everything in Tier 1, plus:

| Data | Encrypted |
|---|---|
| Amounts (expenses, income, budgets) | Yes |
| Prices and exchange rates | Yes |
| Wallet balances | Yes |

> **Note:** With Tier 2, server-side analytics and AI features are unavailable because the server cannot read amounts. All analytics are computed locally on your device.

## Recovery

If you forget your passphrase but have your Recovery Key:

1. Open **Settings** > **Security**
2. Tap **Recover**
3. Enter your Recovery Key
4. Set a new passphrase
5. A new Recovery Key is generated — save it again

## Resetting Encryption

If you lose both your passphrase and Recovery Key:

1. Open **Settings** > **Security**
2. Tap **Reset Encryption** (red button)
3. Confirm the action

> **Warning:** Previously encrypted data on the server becomes **permanently unreadable**. Local data on your device is not affected. You can set up encryption again with a new passphrase.

## Shared Accounts

When encryption is enabled for a shared account:

- The **account owner** must grant encryption keys to each member
- New members can see metadata (amounts, dates, categories) but **cannot read encrypted text fields** until the owner grants access
- Key granting happens when the owner opens the app and approves pending members
- When a member is **removed** from a shared account, keys are rotated for security — the removed member can no longer decrypt new data

## Impact on App Features

| Feature | Tier 1 (Text) | Tier 2 (Full) |
|---|---|---|
| Analytics and charts | Fully works | Computed locally |
| Budget alerts | Fully works | Unavailable |
| AI Chat | Partial (no descriptions) | Unavailable |
| AI Insights | Partial | Unavailable |
| Spending Story | Partial | Unavailable |
| Voice input | Fully works | Fully works |
| Receipt scanning | Fully works | Fully works |

## FAQ

- **Q: Is the encryption passphrase the same as my login password?**
  **A:** No. The encryption passphrase is separate and is never sent to the server. Your login password authenticates your account; the encryption passphrase protects your data.

- **Q: What happens if I forget my passphrase and lose the Recovery Key?**
  **A:** Previously encrypted data on the server becomes permanently unreadable. You can reset encryption and start fresh, but old encrypted data cannot be recovered.

- **Q: Can the app developers read my encrypted data?**
  **A:** No. The server only stores encrypted blobs. Without your passphrase or Recovery Key, no one can decrypt your data.

- **Q: Does encryption slow down the app?**
  **A:** The initial setup takes a few seconds for key derivation. After that, encrypting and decrypting individual fields is nearly instant.

- **Q: Can I turn off encryption after enabling it?**
  **A:** You can reset encryption, which removes the encryption setup. However, data that was encrypted on the server remains encrypted and will become unreadable.

---

*See also: [Settings](./11-settings.md) | [Accounts](./09-accounts.md)*
