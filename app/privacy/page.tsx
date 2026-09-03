/**
 * The privacy policy.
 *
 * Reachable without signing in, because Google Play crawls this URL before the app is
 * listed and a policy behind a login is no policy at all. Written in English only: it is
 * the one document in this app where a translation error is a liability rather than a
 * rough edge, and the summary at the top is short enough to be read with a translator.
 *
 * Everything below is a statement of fact about what the code does. If the app ever
 * starts collecting something else, this page is wrong until it is updated - so keep the
 * two together.
 */

import Link from 'next/link';
import { PotliLogo } from '@/components/ui/PotliLogo';

export const metadata = {
  title: 'Privacy — Potli',
  description: 'What Potli stores, who can see it, and how to take it back or delete it.',
};

const UPDATED = '3 September 2026';

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 pb-20">
      <Link href="/" className="mb-8 flex items-center gap-2.5 text-ink" aria-label="Potli">
        <PotliLogo className="h-9 w-9" />
        <span className="text-lg font-bold">Potli</span>
      </Link>

      <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-ink">Privacy</h1>
      <p className="mt-1 text-sm text-ink-faint">Last updated {UPDATED}</p>

      <section className="mt-7 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">The short version</h2>
        <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink-muted">
          <li>Potli stores your email address and the money entries you type in. Nothing else.</li>
          <li>An optional PIN can lock the screen. It stays on your device and never reaches us.</li>
          <li>Only you can read them. Your entries are invisible to other users and to us.</li>
          <li>There is no advertising, no analytics, and nothing is sold or shared.</li>
          <li>You can export everything, or delete your account entirely, from Settings.</li>
          <li>Potli is free. You are not the product; there is no product.</li>
        </ul>
      </section>

      <Prose>
        <H2>What is stored</H2>
        <P>
          <B>Your email address.</B> Used to sign you in and to send a sign-in link if you
          ask for one. Never used to email you anything else.
        </P>
        <P>
          <B>Your entries.</B> The people you add — their name, relationship, and
          optionally a phone number, email or note — and each money entry: date, amount,
          direction, payment method, an optional note, and optional tags.
        </P>
        <P>
          <B>Your settings.</B> Your chosen language and theme are kept in your own
          browser, not on the server. If you switch on the screen lock, the same place
          holds a scrambled form of your PIN — never the digits themselves — so that
          Potli can check one without being able to read it back.
        </P>
        <P>
          <B>A copy, on your device.</B> So that the app opens and works without a
          connection, your browser keeps the last set of contacts and balances it saw,
          plus any entry you have recorded that has not been sent yet. Both are on your
          device only. Signing out clears the copy, and sending an entry removes it from
          the queue.
        </P>
        <P>
          That is the complete list. There is no location data, no contact-book access, no
          device identifiers, no advertising identifier, and no behavioural tracking of any
          kind.
        </P>

        <H2>Who can see it</H2>
        <P>
          You, on the devices you sign in from. Nobody else — not other users, and not us.
        </P>
        <P>
          This is enforced by the database rather than by the app being careful.
          Row Level Security is switched on for every table, and every policy is
          <Code>auth.uid() = user_id</Code>: a request carrying your sign-in can only ever
          read or write rows belonging to you. A bug in the app cannot widen that, because
          the rule is applied on the other side of it.
        </P>

        <H2>Where it is stored</H2>
        <P>
          In a PostgreSQL database hosted by{' '}
          <A href="https://supabase.com/privacy">Supabase</A>, who provide the database and
          the sign-in service and process the data on our behalf. They are the only third
          party involved. The app itself is static files served by a hosting provider,
          which sees the request for those files but never your entries.
        </P>

        <H2>Working without a connection</H2>
        <P>
          An entry you record with no signal is kept on your device and sent the moment
          you are back online — it is not lost, and it is not sent anywhere else in the
          meantime. Until it is sent it is counted in the balances you see, and the app
          says how many entries are waiting.
        </P>

        <H2>The screen lock</H2>
        <P>
          Settings can ask for a four-digit PIN before showing your entries. It is worth
          being clear about what that is: it keeps the screen private on a phone other
          people pick up. It is <B>not</B> encryption, and it is not what protects your
          data — that is your sign-in and the database rule above. Someone with your
          unlocked, signed-in phone can still reach your entries; four digits stored on
          the same device cannot honestly change that.
        </P>
        <P>
          The PIN never leaves your device and is never sent to us. If you forget it,
          sign out and sign back in: nothing is lost, because your entries are on the
          server rather than behind the lock.
        </P>

        <H2>Sharing a summary</H2>
        <P>
          When you tap Share, Potli builds a plain-text message on your device and hands it
          to whichever app you choose. Nothing is uploaded to do this, and Potli has no
          record of what you shared or who with.
        </P>

        <H2>Taking your data with you</H2>
        <P>
          Settings has <B>Export CSV</B> and <B>Export JSON backup</B>. Both produce a
          complete copy of everything you have recorded, as an ordinary file on your
          device, readable in a spreadsheet or by any other program. There is no limit on
          how often you can do this and no need to ask.
        </P>

        <H2>Deleting your account</H2>
        <P>
          Settings has <B>Delete my account</B>. It permanently removes your entries, your
          contacts, your repeating rules and your sign-in, immediately and without a
          recovery period. It cannot be undone, so the app offers you a backup first.
        </P>
        <P>
          If you cannot reach the app for any reason, email the address below from the
          address you signed up with and the account will be deleted the same way.
        </P>

        <H2>Children</H2>
        <P>
          Potli is not directed at children and is not intended for anyone under 13.
        </P>

        <H2>Changes to this policy</H2>
        <P>
          If what the app stores ever changes, this page changes with it and the date at
          the top is updated. Potli will not begin collecting something new and tell you
          afterwards.
        </P>

        <H2>Contact</H2>
        <P>
          Questions, or a deletion request:{' '}
          <A href="mailto:hiren.parmar@zelican.com">hiren.parmar@zelican.com</A>.
        </P>
      </Prose>

      <Link
        href="/"
        className="mt-10 inline-flex min-h-[44px] items-center text-[15px] font-medium text-brand"
      >
        ← Back to Potli
      </Link>
    </main>
  );
}

/* Small local pieces, so the document above reads as prose rather than as markup. */

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 space-y-1">{children}</div>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-7 text-lg font-semibold text-ink">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="mx-1 rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
      {children}
    </code>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith('mailto:') ? undefined : '_blank'}
      rel="noopener noreferrer"
      className="font-medium text-brand underline underline-offset-2"
    >
      {children}
    </a>
  );
}
