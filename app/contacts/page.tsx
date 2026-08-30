'use client';

/**
 * Contacts: everyone whose money you hold or who owes you, and one screen per person
 * showing their balance and their history.
 *
 * The detail view is addressed with `?id=` rather than a `/contacts/[id]` route because
 * the app is a static export - a dynamic segment would need every person's id known at
 * build time, which is impossible for data that lives in someone's database.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { LoadingPanel } from '@/components/ui/Spinner';
import { PeopleBalances } from '@/components/dashboard/PeopleBalances';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { ManagePeople } from '@/components/settings/ManagePeople';
import { TransactionList } from '@/components/transactions/TransactionList';
import { TransactionActions } from '@/components/transactions/TransactionActions';
import { TransactionSheet, type SheetMode } from '@/components/transactions/TransactionSheet';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { describePersonBalance } from '@/lib/calculations/balance';
import { buildContactShareText } from '@/lib/export/share';
import { todayIso } from '@/lib/format/date';
import { ShareButton } from '@/components/share/ShareButton';
import { formatRupees } from '@/lib/calculations/money';
import type { TransactionType, TransactionWithBalance } from '@/types/transaction';

export default function ContactsPage() {
  return (
    <AuthGate>
      <Contacts />
    </AuthGate>
  );
}

function Contacts() {
  const { personBalances, ledger, status } = useLedger();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [openEntry, setOpenEntry] = useState<TransactionWithBalance | null>(null);

  // The detail view is a URL, so the back button works and a contact can be linked to
  // from the dashboard.
  useEffect(() => {
    const read = () => setSelectedId(new URLSearchParams(window.location.search).get('id'));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const selected = personBalances.find((entry) => entry.person.id === selectedId) ?? null;

  const theirEntries = useMemo(
    () => (selected ? ledger.filter((entry) => entry.transaction.person_id === selected.person.id) : []),
    [ledger, selected],
  );

  const openContact = (id: string) => {
    window.history.pushState(null, '', `/contacts/?id=${encodeURIComponent(id)}`);
    setSelectedId(id);
  };

  const backToList = () => {
    window.history.pushState(null, '', '/contacts/');
    setSelectedId(null);
  };

  if (status === 'loading') {
    return (
      <AppShell title={t('contacts.title')}>
        <Card>
          <LoadingPanel label={t('common.loading')} />
        </Card>
      </AppShell>
    );
  }

  /* ------------------------------------------------------------------ detail view */
  if (selectedId !== null) {
    if (!selected) {
      return (
        <AppShell title={t('contacts.title')}>
          <Card className="px-6 py-10 text-center">
            <p className="text-[15px] text-ink">{t('contacts.notFound')}</p>
            <Button variant="secondary" className="mt-4" onClick={backToList}>
              {t('contacts.back')}
            </Button>
          </Card>
        </AppShell>
      );
    }

    const { person, balancePaise, moneyInPaise, moneyOutPaise, count } = selected;

    return (
      <AppShell
        title={person.name}
        subtitle={
          // A contact literally called "Mother" does not need "Mother" underneath it.
          t(`relationship.${person.relationship}`).toLowerCase() === person.name.toLowerCase()
            ? undefined
            : t(`relationship.${person.relationship}`)
        }
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={backToList}
            className="-mt-1 flex min-h-[36px] items-center gap-1.5 text-sm font-medium text-brand"
          >
            <span aria-hidden="true">←</span>
            {t('contacts.back')}
          </button>

          <section className="card p-5" aria-labelledby="contact-balance">
            <h2 id="contact-balance" className="text-sm font-medium text-ink-muted">
              {balancePaise < 0
                ? t('dashboard.owedToYou')
                : balancePaise > 0
                  ? t('dashboard.holdingLabel')
                  : t('person.settled')}
            </h2>
            <p className="tnum mt-1 text-[2.5rem] font-bold leading-tight tracking-tight text-ink">
              {formatRupees(Math.abs(balancePaise))}
            </p>
            <p className="text-sm text-ink-faint">
              {describePersonBalance(person.name, balancePaise, t)}
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-received-soft px-3 py-2.5">
                <dt className="text-xs font-medium text-ink-muted">{t('dashboard.moneyIn')}</dt>
                <dd className="tnum mt-0.5 text-lg font-semibold text-received">
                  {formatRupees(moneyInPaise)}
                </dd>
              </div>
              <div className="rounded-xl bg-returned-soft px-3 py-2.5">
                <dt className="text-xs font-medium text-ink-muted">{t('dashboard.moneyOut')}</dt>
                <dd className="tnum mt-0.5 text-lg font-semibold text-returned">
                  {formatRupees(moneyOutPaise)}
                </dd>
              </div>
            </dl>

            <ShareButton
              className="mt-4 w-full"
              buildText={() =>
                buildContactShareText(
                  person,
                  balancePaise,
                  moneyInPaise,
                  moneyOutPaise,
                  theirEntries,
                  todayIso(),
                  t,
                )
              }
            />
          </section>

          <section>
            <SectionHeading>{t('contacts.record')}</SectionHeading>
            <QuickActions
              onAction={(type: TransactionType) =>
                setSheet({ kind: 'create', type, personId: person.id })
              }
            />
          </section>

          <section>
            <SectionHeading>
              {t('contacts.history')}
              {count > 0 ? ` · ${count}` : ''}
            </SectionHeading>
            {theirEntries.length === 0 ? (
              <Card className="px-6 py-8 text-center">
                <p className="text-[15px] text-ink-muted">{t('contacts.noHistory')}</p>
              </Card>
            ) : (
              <div className="card overflow-hidden p-0">
                <TransactionList entries={theirEntries} onSelect={setOpenEntry} hidePerson />
              </div>
            )}
          </section>
        </div>

        <TransactionActions
          entry={sheet ? null : openEntry}
          onClose={() => setOpenEntry(null)}
          onEdit={(entry) => setSheet({ kind: 'edit', transaction: entry.transaction })}
        />
        <TransactionSheet
          mode={sheet}
          onClose={() => {
            setSheet(null);
            setOpenEntry(null);
          }}
        />
      </AppShell>
    );
  }

  /* -------------------------------------------------------------------- list view */
  return (
    <AppShell
      title={t('contacts.title')}
      subtitle={
        personBalances.length === 1
          ? t('contacts.subtitleOne')
          : t('contacts.subtitle', { count: personBalances.length })
      }
    >
      <div className="space-y-6">
        {personBalances.length === 0 ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-base font-semibold text-ink">{t('contacts.empty')}</p>
            <p className="mx-auto mt-2 max-w-[24rem] text-[15px] leading-relaxed text-ink-muted">
              {t('contacts.emptyBody')}
            </p>
          </Card>
        ) : (
          <div className="card overflow-hidden p-0">
            <PeopleBalances balances={personBalances} onSelect={openContact} />
          </div>
        )}

        <section>
          <SectionHeading>{t('contacts.manage')}</SectionHeading>
          <Card>
            <ManagePeople />
          </Card>
        </section>

        <Link
          href="/transactions/"
          className="flex min-h-[48px] items-center justify-center rounded-xl border border-border bg-surface text-[15px] font-medium text-ink"
        >
          {t('dashboard.viewAll')}
        </Link>
      </div>
    </AppShell>
  );
}
