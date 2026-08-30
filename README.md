# Potli

**Money you hold for the people you love. Never guess the amount again.**

A private, mobile-first PWA for one job: knowing **how much of someone else's money you
are currently holding**.

Your mother leaves ₹10,000 with you for safekeeping. You lend your brother ₹4,000 until
next month. Money moves by Google Pay / UPI, cash or bank transfer, and comes back in
pieces over weeks. Potli records every direction, per person, and always knows where you
stand.

Each person has one signed balance, so both kinds of debt live on the same axis:

```
balance = (RECEIVED + REPAID) − (RETURNED + LENT)

balance > 0   you are holding their money
balance < 0   they owe you
balance = 0   settled
```

The transaction table is the only source of truth. No balance is ever stored, so editing
or deleting history can never leave a stale total behind. Every person is a separate pot:
money held for one person can never fund a return to another.

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
- [Languages](#languages)
- [Design notes](#design-notes)
- [Troubleshooting](#troubleshooting)

## What it does

- **Dashboard** — how much of other people's money you are holding, how much is owed to
  you, then a per-person breakdown, with four large buttons for recording money.
- **Contacts** — a tab of everyone whose money you hold or who owes you, each with a
  relationship (mother, brother, friend…) and their own balance. Tap one for their screen:
  their balance, buttons to record against them, and their history alone. People are also
  added inline while recording, so a new contact never costs a detour.
- **Record money** — four kinds, in two directions, each said as a sentence rather than
  an accounting term: *They gave me* (money to keep safe), *I gave back* (their money,
  returned), *I lent them* (my own money) and *They paid back* (my money, returned).
  Person, amount, method, date and an optional note.
- **Languages** — English, हिन्दी, ગુજરાતી, বাংলা and मराठी, chosen in Settings and
  remembered per device. The browser's own language is used on first launch.
- **History** — every transaction newest-first with the balance after each one, filters
  (person, all / received / returned, this month, last month, custom range) and note
  search.
- **Edit and delete** — with confirmation; all balances are recalculated from scratch.
- **Statement** — opening balance, money in, money out and closing balance for a date
  range, for everyone or one person, plus the transactions in that period.
- **Share** — send a contact's standing, or a statement for a period, as a WhatsApp
  message: the balance in one sentence, then the transactions behind it.
- **Backup** — CSV export, JSON backup and validated JSON restore.
- **One mark, one source** — the bag logo is defined once in `lib/brand/logo.ts` and
  rendered both as SVG in the app and as the PNG icon set, so they cannot drift apart.
- **PWA** — installable, standalone, offline-aware, light/dark themes, with an animated
  launch screen that covers the wait for your data rather than showing an empty ₹0.

Deliberately *not* included: budgets, expenses, investments, bills, bank imports,
lending or interest. It tracks one thing.

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

Open the Supabase SQL editor and run the migrations in order -
[`20260825000000_create_transactions.sql`](supabase/migrations/20260825000000_create_transactions.sql),
[`20260826000000_add_people.sql`](supabase/migrations/20260826000000_add_people.sql),
[`20260826010000_two_way_tracking.sql`](supabase/migrations/20260826010000_two_way_tracking.sql),
[`20260830000000_contact_details.sql`](supabase/migrations/20260830000000_contact_details.sql), then
[`20260830010000_server_side_paging.sql`](supabase/migrations/20260830010000_server_side_paging.sql), then
[`20260831000000_tags_recurring_trends.sql`](supabase/migrations/20260831000000_tags_recurring_trends.sql) -
or apply them with the CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

It creates:

```
people
------
id           uuid primary key
user_id      uuid not null references auth.users(id) on delete cascade
name         text not null            -- unique per user
relationship text not null            -- MOTHER | FATHER | BROTHER | SISTER | SPOUSE | FRIEND | OTHER
phone        text                     -- optional, as typed; shape-checked only
email        text                     -- optional
note         text                     -- optional, up to 200 characters

transactions
------------
id               uuid primary key
user_id          uuid not null references auth.users(id) on delete cascade
person_id        uuid not null references people(id) on delete restrict
transaction_date date not null
type             text not null   -- RECEIVED | RETURNED | LENT | REPAID
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

### Checking the SQL against the TypeScript

```bash
npm run verify:sql
```

Runs every migration against a local Postgres, seeds two users, and asserts that
`person_balances`, `transaction_ledger` and `ledger_summary` produce exactly what
`calculatePersonBalances`, `buildRunningBalances` and `buildStatement` produce - and that
row-level security still confines each user to their own rows *through the views*, with
`anon` refused outright. It skips cleanly when no database is reachable; point it at one
with `POTLI_TEST_PG`.

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
app/                      routes: dashboard, login, contacts, transactions, statement, settings
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

## Languages

Interface text lives in `lib/i18n/`. English (`en.ts`) is the source of truth and every
other language is typed as `Record<MessageKey, string>`, so a missing or misspelt key is a
compile error rather than a blank space on someone's screen. `npm test` additionally
checks that every language covers every key, that `{placeholder}` names match English
exactly, and that a language has not simply been copied from English.

Adding a language is one file plus one line:

```ts
// lib/i18n/ta.ts
import type { Dictionary } from './en';
export const ta: Dictionary = { /* TypeScript will name every key you still owe */ };

// lib/i18n/locales.ts
export const LOCALES = ['en', 'hi', 'gu', 'bn', 'mr', 'ta'] as const;
```

Amounts stay in Indian digit grouping (₹1,00,000) in every language, since that is what
the numbers mean regardless of the words around them. Dates take their month names from
the dictionary.

The translations shipped here were written for this app rather than machine-translated
wholesale, but **they have not been reviewed by native speakers** - worth doing before a
store launch. The connection-diagnostics panel on the login screen is deliberately left in
English: it is a developer tool, and its wording matches this README.

## Sharing a summary

The share button on a contact's screen and on the statement builds a plain-text message -
the balance in one sentence, then the entries behind it, newest first, trimmed to twenty
lines. WhatsApp renders `*text*` as bold and little else reliably, so that is the only
formatting used.

Three routes are tried in order, because no one of them works everywhere: the system share
sheet (`navigator.share`, where WhatsApp sits alongside everything else and the user picks
the chat), then a `wa.me` link that opens WhatsApp with the message ready, then the
clipboard for a desktop browser with neither. All three run inside the tap that started
them, which browsers require.

Contacts hold no phone number, so the share opens WhatsApp and lets you choose the chat. A
number would save that tap by linking to `wa.me/<number>` directly - a small schema
addition if it turns out to be worth it.

## Launch screen

Android draws its own launch screen from the manifest before the page loads - the icon on
`background_color`, which is set to the brand teal so it hands over to the app's own splash
without a change of colour. Nothing about that system screen can be animated.

The animated splash in `components/layout/SplashScreen.tsx` covers what comes next: the
gap while Supabase confirms the session and returns the ledger. It ships in the prerendered
HTML, so it paints with the first frame rather than waiting for React, and it leaves only
when the app genuinely has something to show - with a 0.9s floor so it cannot flicker past,
and a 4s ceiling so a dead network cannot trap anyone behind it. Under
`prefers-reduced-motion` it still appears but holds still.

Four animation styles are implemented in `app/globals.css`; the active one is a single word
in `lib/brand/splash.ts`:

```ts
export const ACTIVE_SPLASH_VARIANT: SplashVariant = 'shimmer';
```

| Variant | What it does |
| --- | --- |
| `pulse` | The mark breathes, zooming gently in and out |
| `rise` | It lifts into place with a settle, then breathes |
| `ripple` | Rings spread outward, like a coin dropped in water |
| `shimmer` | A light sweeps across the bag (default) |

## Design notes

Decisions that are load-bearing, in case a future change threatens one of them:

- **Money is integer paise.** Rupee decimals exist only as strings at the database
  boundary and as formatted text in the UI. `parseFloat` is never used for arithmetic, so
  ₹1,250.50 stays exact no matter how many times it is added.
- **Balances are always derived.** Nothing writes a `balance_after` column. Since paging
  moved server-side the derivation happens in SQL - `person_balances` sums each contact's
  rows, `transaction_ledger` attaches a per-person running balance with a window function -
  but it is still recomputed from the transactions on every read, so editing history cannot
  leave a stale total anywhere.
- **The ledger is read a page at a time.** Opening the app costs one query for the contact
  list plus one page of history, whatever the history's size: at 1,000 contacts, going from
  5,000 to 60,000 transactions moves the payload from 299 kB to 304 kB. The rule is that
  nothing on a normal screen may fetch an unbounded number of rows. Exports, backups and
  the duplicate check during a restore genuinely need everything, so they fetch it on
  demand (`fetchAllTransactions`) rather than the app holding it all session.
- **A repeating entry is a promise, not money.** A rule in `recurring_transactions`
  affects no balance anywhere; only the transaction it eventually creates does. Nothing
  posts on a schedule - a static app has no server to run one, and inserting financial
  records nobody agreed to would be the wrong thing to do even if it could. What is due
  is offered on the home screen, and `post_due_recurring` inserts the row and advances
  the rule in one statement, so two phones opening on the same morning cannot both
  create the rent entry.
- **A page of rows is self-sufficient.** Each row carries its own running balance from the
  view, so row 900 renders the same figure it would have if rows 1-899 had been fetched.
  This is what makes paging safe rather than merely fast; without it a "show more" would
  have to recompute from the beginning.
- **Two implementations of one rule, checked against each other.** The TypeScript in
  `lib/calculations` is still the readable statement of how a balance works, and is what
  the SQL is held to. `npm run verify:sql` runs the migrations against a real Postgres,
  seeds it, and compares every figure both ways - it is what caught the opening-balance
  bug described below. If the two ever disagree, `lib/calculations` says which is right.
- **Each person is a separate pot.** Balances, running balances, guards and statements are
  all scoped per person - a row showing what you hold for your mother never includes what
  your brother lent you; the dashboard total is only ever a sum of them. Deleting someone who still has
  transactions is refused by the database rather than silently erasing their history.
- **Nothing is refused, but surprises are explained.** Once lending is tracked, a negative
  balance is a real state rather than an impossible one, so no combination of entries is
  invalid. What remains is catching the mistyped amount: returning more than you hold, or
  being repaid more than you lent, warns and says exactly what the result will mean, with
  a "Save anyway" button. Amount validation (positive, within NUMERIC(12,2)) is still a
  hard stop.
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

**"Could not load your transactions."** Usually a migration has not been run, or RLS is
enabled without the policies. The error card on the home screen has a **Nothing loading?
Check the database** panel that says which of the views and functions the database is
missing, and which migration creates them - it works without signing in, because a missing
migration breaks loading rather than signing in.

To check from the other side, paste
[`supabase/check-install.sql`](supabase/check-install.sql) into the Supabase SQL editor. It
changes nothing and reports fourteen checks, including the one that matters most: that the
views run as the *caller*, so row-level security still applies through them.

If the objects exist in the database but the app still cannot see them, PostgREST is
serving a cached schema. Run `notify pgrst, 'reload schema';` - `check-install.sql` does
this for you at the end.

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

**"You are only holding ₹X for …".** A warning, not a refusal: you are paying out more of
someone's money than you hold, so the surplus will show as them owing you. If that is
really a loan, record it as *Lent* instead; if the amount is right, press *Save anyway*.

**Import says the balance would go negative.** The backup, merged with what you already
have, produces a point in history where more money is returned than was ever received.
Import into an empty ledger with *Replace everything* instead.

## Licence

Private personal project. No warranty.
