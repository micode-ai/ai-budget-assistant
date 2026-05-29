# Export & Reports

> Generate PDF, Excel, and CSV reports of your finances. View monthly spending digests, create encrypted backups, and receive automated email summaries.

## Overview

The **Export & Reports** screen lets you generate financial reports, view monthly digests, download/share reports, and manage data backups. Access it from the Analytics tab via the **Export Report** button, or from **Settings** > **Reports & Email** > **Generate Report**.

## Report Formats

Three export formats available:

| Format | Description | Availability |
|---|---|---|
| **CSV** | Comma-separated values, compatible with Excel and Google Sheets | All plans |
| **PDF** | Formatted report with summary, category breakdown, and transaction list | Pro & Business |
| **Excel** | Multi-sheet workbook with Summary, Expenses, and Incomes sheets | Pro & Business |

## Generating a Report

1. Select a **format** (CSV, PDF, or Excel)
2. Choose a **time period** (Last Week, This Month, Last Quarter, This Year)
3. Tap **Generate**
4. The report generates and opens immediately via the system share dialog — save or send it from there
5. The report also appears in **Recent Reports** below for future access

Reports are stored for 7 days and then automatically deleted.

## Monthly Digest (Pro+)

A snapshot of your current month's financial activity:

- **Total Income** and **Total Expenses**
- **Savings Rate** — percentage of income saved
- **Top Categories** — your biggest spending categories with amounts
- Data is cached for 7 days and refreshes automatically

## Recent Reports

A list of your recently generated reports showing:

- Format icon (CSV/PDF/Excel)
- File name and creation date
- File size
- **Download** button — saves the file directly to your device (Android: choose folder via Storage Access Framework; iOS: save to Files)
- **Share** button — opens the system share sheet to send the report via email, messaging, or other apps

## Data Backup

Available on **all plans**:

- **Export Backup** — creates a full JSON backup of your account data (expenses, incomes, budgets, categories, tags, projects, wallets, etc.)
  - **Where the file is saved:** On Android, a folder picker opens and the backup is written to the folder you choose — the app then shows you the exact path. If you skip the picker (or on iOS), the system share sheet opens instead so you can "Save to Files", Downloads, or a cloud drive. The success message only appears once the file is actually saved or shared.
- **Restore Backup** — import a previously exported backup
- If encryption is enabled, encrypted fields are included as-is in the backup

Access backup from **Settings** > **Reports & Email**.

## Email Reports

Automated email summaries delivered to your inbox:

| Feature | Description | Required Plan |
|---|---|---|
| **Weekly Email Summary** | Weekly spending overview with top categories | Business |
| **Monthly Digest Email** | Monthly summary with month-over-month comparison | Pro & Business |

Configure these in **Settings** > **Reports & Email**:

- Toggle weekly/monthly emails on/off
- Choose the day of week for weekly reports (Monday by default)

## Encryption & Reports

- **Tier 0** (no encryption) — all data displayed correctly in reports
- **Tier 1** (text encryption) — amounts show correctly; category names and descriptions may appear empty in server-generated reports. Monthly digest resolves category names from your local device data
- **Tier 2** (full encryption) — reports are unavailable (amounts are encrypted server-side)

## FAQ

- **Q: Why do I see empty category names in my PDF report?**
  **A:** If you have E2EE enabled (Tier 1), category names are encrypted on the server. The server-generated report cannot decrypt them. Amounts remain accurate.

- **Q: How long are reports stored?**
  **A:** Reports are automatically deleted after 7 days. Download them promptly after generation.

- **Q: Can I export data from a shared account?**
  **A:** Yes, any account member can generate reports and backups for the shared account.

- **Q: What's included in a backup?**
  **A:** Everything: expenses, incomes, budgets, categories, tags, projects, wallets, transfers, and currency exchanges for the current account.

---

*See also: [Analytics](./06-analytics.md) | [Settings](./11-settings.md) | [Subscription Plans](./12-subscription.md) | [Encryption](./15-encryption.md)*
