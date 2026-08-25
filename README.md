# Mother's Money

A private, mobile-first PWA for one job: knowing **how much of my mother's money I am
currently holding**.

She gives me money (Google Pay / UPI, cash, bank transfer, other) to keep in my account,
and later asks for some of it back. This app records both directions and shows the
running balance.

```
Current balance = SUM(RECEIVED) − SUM(RETURNED)
```

The transaction table is the only source of truth. No balance is ever stored, so editing
or deleting history can never leave a stale total behind.

## Contents

- [What it does](#what-it-does)
- [Technology](#technology)
- [Local setup](#local-setup)
- [Supabase setup](#supabase-setup)
- [Environment variables](#environment-variables)
- [Database migration](#database-migration)
- [Authentication setup](#authentication-setup)
- [Development](#development)
- [Tests](#tests)
- [Production build](#production-build)
- [Cloudflare deployment](#cloudflare-deployment)
- [Vercel deployment](#vercel-deployment)
- [Installing on Android](#installing-on-android)
- [Backup and restore](#backup-and-restore)
- [Project structure](#project-structure)
- [Design notes](#design-notes)
- [Troubleshooting](#troubleshooting)

## What it does

- **Dashboard** — the current balance, total received, total returned, transaction count
  and the date of the last entry, with two large buttons for recording money.
- **Record money** — amount, source/method, date (defaults to today) and an optional
  note. Returning more than the available balance is refused.
- **History** — every transaction newest-first with the balance after each one, filters
  (all / received / returned, this month, last month, custom range) and note search.
- **Edit and delete** — with confirmation; all balances are recalculated from scratch.
- **Statement** — opening balance, money in, money out and closing balance for a date
  range, plus the transactions in that period.
- **Backup** — CSV export, JSON backup and validated JSON restore.
- **PWA** — installable, standalone, offline-aware, light/dark themes.

Deliberately *not* included: budgets, expenses, investments, bills, multiple users, bank
imports. It tracks one thing.

## Technology

| Layer    | Choice                                                   |
| -------- | -------------------------------------------------------- |
| UI       | Next.js 15 (App Router), React 18, TypeScript strict mode |
| Styling  | Tailwind CSS                                              |
| Data     | Supabase (PostgreSQL) with Row Level Security             |
| Auth     | Supabase Auth — email/password or magic link              |
| Hosting  | Cloudflare Pages (static export, no server runtime)       |

The app is built with `output: 'export'`, so the deployable artefact is plain static
files. There is no server to compromise and no place for a secret to leak: every request
goes from the browser straight to Supabase, where RLS decides what may be read or
written.

## Local setup

Requires Node.js 20 or newer.

```bash
git clone <this-repo>
cd ledgertracker
npm install
cp .env.example .env.local     # then fill in your Supabase values
npm run dev                    # http://localhost:3000
```

## Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **Project Settings → API** and copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Run the [database migration](#database-migration).
4. Configure [authentication](#authentication-setup).

Do **not** copy the `service_role` key. It bypasses Row Level Security and must never
appear in this project, in `.env.local`, or in any build.

## Environment variables

| Variable                        | Required | Notes                                     |
| ------------------------------- | -------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes      | `https://<project-ref>.supabase.co`       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes      | Public anon key; safe in the browser      |

Both are read at build time and baked into the bundle, so **rebuild after changing
them**. `.env.local` is gitignored; nothing secret belongs in this repository.

## Database migration

Open the Supabase SQL editor and run
[`supabase/migrations/20260825000000_create_transactions.sql`](supabase/migrations/20260825000000_create_transactions.sql),
or apply it with the CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

It creates:

```
transactions
------------
id               uuid primary key
user_id          uuid not null references auth.users(id) on delete cascade
transaction_date date not null
type             text not null   -- RECEIVED | RETURNED
amount           numeric(12,2) not null  -- always > 0
method           text not null   -- GOOGLE_PAY | CASH | BANK_TRANSFER | OTHER
note             text            -- max 200 characters
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()
```

with CHECK constraints on `type`, `method`, `amount > 0` and note length, an index on
`(user_id, transaction_date, created_at, id)` matching the ledger's read order, a trigger
that maintains `updated_at`, and four RLS policies:

| Policy | Rule                                              |
| ------ | ------------------------------------------------- |
| SELECT | `auth.uid() = user_id`                            |
| INSERT | `with check (auth.uid() = user_id)`               |
| UPDATE | `using` and `with check` on `auth.uid() = user_id` |
| DELETE | `auth.uid() = user_id`                            |

RLS is enabled *and* forced, `anon` has no grants, and `user_id` defaults to
`auth.uid()`. An unauthenticated request matches no rows at all.

## Authentication setup

This is a single-user app, so there is no invitation or onboarding flow — you create your
own account once.

1. In Supabase, go to **Authentication → Providers** and keep **Email** enabled.
2. For the quickest start, turn **Confirm email** off (Authentication → Providers →
   Email). Then open the app, choose *First time? Create your account*, and sign in
   immediately. Leaving confirmation on works too; you just have to click the emailed
   link first.
3. Optional but recommended once you have your account: set **Authentication → Sign-ups
   → Disable new sign-ups** so nobody else can register against your project.
4. Under **Authentication → URL Configuration**, add your deployed origin (and
   `http://localhost:3000` for development) to the redirect allow-list. Magic links and
   email confirmations need this.

Both sign-in methods are on the login screen: email/password, or a magic link.

## Development

```bash
npm run dev        # dev server with hot reload
npm run lint       # ESLint (next/core-web-vitals)
npm run typecheck  # tsc --noEmit, strict mode
npm test           # unit tests
```

## Tests

`npm test` runs the domain test suite (Node's built-in test runner, no framework) over
money arithmetic, balance derivation, ordering, validation, filters, CSV export and
backup import — including every scenario and edge case from the specification: the
₹10,000 / ₹2,000 / ₹5,000 walkthrough, over-returning, editing and deleting the oldest
and newest transactions, returning exactly the balance, decimal amounts, very large
amounts and malformed backup files.

## Production build

```bash
npm run build      # static export into out/
npm start          # serve out/ locally to check the production build
```

`out/` contains the whole app: HTML, hashed JS/CSS, icons, `manifest.webmanifest`,
`sw.js` and the security headers in `_headers`.

## Cloudflare deployment

### Option A — connect the Git repository (recommended)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Build settings:
   - Framework preset: **Next.js (Static HTML Export)**
   - Build command: `npm run build`
   - Build output directory: `out`
3. Add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for both Production and Preview. They are compiled
   into the bundle, so a change needs a redeploy.
4. Deploy. Cloudflare serves everything over HTTPS; `_headers` adds HSTS, a content
   security policy and clickjacking protection.

### Option B — direct upload with Wrangler

```bash
npm run build
npx wrangler pages deploy out          # or: npm run deploy
```

`wrangler.toml` already sets `pages_build_output_dir = "out"`.

Finally, add the deployed origin to Supabase's redirect allow-list
(**Authentication → URL Configuration**).

## Vercel deployment

The static export deploys to Vercel unchanged - no config edits, no adapter.

### Connect the repository

1. [vercel.com/new](https://vercel.com/new) - import `ledgertracker`.
2. Vercel detects Next.js on its own; leave the build settings alone.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Production,
   Preview and Development **before the first build** - they are compiled into the
   bundle, so a change needs a redeploy.
4. Deploy.

### Or from the command line

```bash
npx vercel            # preview deployment
npx vercel --prod     # production
```

`vercel.json` carries the same security headers as the Cloudflare `_headers` file
(Vercel ignores `_headers`, and Cloudflare ignores `vercel.json`, so both hosts stay
covered by keeping both files).

Afterwards add the deployed origin to Supabase's redirect allow-list
(**Authentication → URL Configuration**). Preview deployments get a new URL each time,
so add a wildcard such as `https://*-<your-vercel-scope>.vercel.app/**` if you want
magic links to work from previews too.

## Installing on Android

1. Open the deployed URL in Chrome on your phone.
2. Sign in.
3. Tap the **⋮** menu → **Add to Home screen** (Chrome may also show an install prompt).
4. Launch it from the home screen: it opens standalone, without browser chrome.

The install requirements are all met: HTTPS, a web app manifest with 192px and 512px
icons plus a maskable icon, `display: standalone`, a theme colour and a service worker.

On iOS, use Safari → Share → **Add to Home Screen**.

## Backup and restore

Settings → Data:

- **Export CSV** → `mothers-money-transactions-YYYY-MM-DD.csv`
  (`Date,Type,Amount,Method,Note`, ISO dates, plain decimal amounts).
- **Export JSON backup** → `mothers-money-backup-YYYY-MM-DD.json` containing every
  transaction.
- **Import JSON backup** → choose a file, review what will change, then either add the
  transactions to your existing history or replace everything.

Restore is deliberately careful. The file is fully validated before a single row is
written; unknown types, bad dates, non-positive amounts or malformed JSON are refused
with an explanation. Transactions identical to ones you already have are reported as
duplicates and skipped, and an import that would drive the balance negative at any point
in history is rejected outright.

## Project structure

```
app/                      routes: dashboard, login, transactions, statement, settings
components/
  dashboard/              balance card, quick actions, empty and welcome states
  transactions/           list, row, filters, detail/actions, add-edit sheet
  forms/                  the single transaction form
  layout/                 app shell, bottom nav, auth gate, service worker registrar
  providers/              auth, ledger state, toasts, theme
  settings/               backup import
  ui/                     button, card, field, sheet, dialog, toaster, spinner
lib/
  calculations/           money (paise arithmetic), balance, filters
  export/                 CSV, JSON backup, download helper
  format/                 dates
  supabase/               client, transactions data access, error messages
  validation/             transaction form, backup file
types/transaction.ts      the domain types
supabase/migrations/      schema, constraints, indexes, RLS policies
public/                   manifest, service worker, icons, offline page, headers
scripts/generate-icons.mjs  regenerates the icon set (npm run icons)
tests/                    domain unit tests
```

## Design notes

Decisions that are load-bearing, in case a future change threatens one of them:

- **Money is integer paise.** Rupee decimals exist only as strings at the database
  boundary and as formatted text in the UI. `parseFloat` is never used for arithmetic, so
  ₹1,250.50 stays exact no matter how many times it is added.
- **Balances are always derived.** `buildRunningBalances` and `calculateTotals` recompute
  from the transaction list on every render. Nothing writes a `balance_after` column.
- **The balance can never go negative.** Returning more than is currently held is refused
  outright with the available amount. A back-dated entry that leaves the ledger below zero
  only part-way through its history is a *warning* with a "Save anyway" button, not a
  refusal: while back-filling old transactions out of order, a return entered before its
  earlier receipts looks negative until those are added.
- **Ordering is total.** Transactions sort by `transaction_date`, then `created_at`, then
  `id`, so two entries on the same day never swap places between devices.
- **Writes are confirmed before they are believed.** Local state only changes after
  Supabase returns the stored row; the UI never reports a save that did not happen. The
  service worker never caches Supabase responses for the same reason.
- **Offline is detected, not faked.** Version 1 has no write queue: an offline device
  says so plainly rather than risking an inconsistent ledger.
- **Direction is never colour alone.** Received and returned differ by arrow, `+`/`−`
  sign and text, as well as colour.
- **Errors are translated.** Postgrest codes and network failures become sentences a
  person can act on; raw database errors are never shown.

## Troubleshooting

**"Not connected yet" on launch.** `NEXT_PUBLIC_SUPABASE_URL` or
`NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing from the build. Set both and rebuild — they
are compiled in, not read at runtime.

**Sign-in says the credentials are wrong, but they are right.** Email confirmation is
probably still pending. Check your inbox, or turn off *Confirm email* in Supabase.

**The magic link opens the login page again.** The deployed origin is not in
**Authentication → URL Configuration**. Add it and request a new link.

**"Could not load your transactions."** Usually the migration has not been run, or RLS is
enabled without the policies. Re-run the migration; it is safe to run more than once.

**Everything saves but the list stays empty.** Rows exist with a different `user_id`
(created before you signed in as this user). Check in the Supabase table editor.

**The app does not offer to install.** It must be served over HTTPS with the service
worker registered. Service workers are disabled in `npm run dev` by design; test
installation against a production build or the deployed site.

**An old version keeps loading after a deploy.** The service worker serves the previous
shell until it updates. Close all tabs of the app and reopen, or clear the site data from
Chrome's site settings.

**"Could not reach the server. Check your connection and try again."** The browser could
not complete the request and will not say why - a blocked response and a hostname that
does not exist look identical to JavaScript. Open **Trouble signing in? Check the
connection** on the login screen and press *Run check*. It reports which Supabase host
this build was compiled against, the anon key it carries, and whether that host answered.

The most common cause is the URL and the key landing in the same environment variable, so
requests go to `https://your-ref.supabase.cosb_publishable_...`. They are two separate
values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Both are compiled in at build time, so correcting them in your host does nothing until
you redeploy.

**"This makes the balance negative on …".** A warning, not a refusal. The transaction is
dated before the money that accounts for it. If you are back-filling old history, press
*Save anyway* and add the earlier receipts; entering oldest first avoids it entirely. For
a large back-fill, a JSON restore is easier - the whole history is checked at once, so
order does not matter.

**Import says the balance would go negative.** The backup, merged with what you already
have, produces a point in history where more money is returned than was ever received.
Import into an empty ledger with *Replace everything* instead.

## Licence

Private personal project. No warranty.
