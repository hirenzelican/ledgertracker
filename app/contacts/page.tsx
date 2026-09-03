'use client';

/**
 * Contacts: everyone whose money you hold or who owes you, and one screen per person
 * showing their balance and their history.
 *
 * The detail view is addressed with `?id=` rather than a `/contacts/[id]` route because
 * the app is a static export - a dynamic segment would need every person's id known at
 * build time, which is impossible for data that lives in someone's database.
 *
 * The list searches and pages rather than rendering everyone: a few dozen contacts is the
 * common case, but a few hundred rows of avatars and balances is a slow screen on a phone.
 */

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Fab } from '@/components/ui/Fab';
import { LoadingPanel } from '@/components/ui/Spinner';
import { PeopleBalances } from '@/components/dashboard/PeopleBalances';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { PersonSheet } from '@/components/contacts/PersonSheet';
import { ShareButton } from '@/components/share/ShareButton';
import { RemindButton } from '@/components/share/RemindButton';
import { PendingEntries } from '@/components/offline/PendingEntries';
import { TransactionList } from '@/components/transactions/TransactionList';
import { TransactionActions } from '@/components/transactions/TransactionActions';
import {
  TransactionSheet,
  settleMode,
  type SheetMode,
} from '@/components/transactions/TransactionSheet';
import { ContactDetails } from '@/components/contacts/ContactDetails';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useLedgerPage, DEFAULT_PAGE_SIZE } from '@/components/providers/useLedgerPage';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { describePersonBalance, outstandingSince } from '@/lib/calculations/balance';
import { buildContactShareText, buildReminderText } from '@/lib/export/share';
import { whatsappNumber } from '@/lib/validation/person';
import { todayIso } from '@/lib/format/date';
import { formatRupees } from '@/lib/calculations/money';
import type { Person, PersonInput, TransactionType, TransactionWithBalance } from '@/types/transaction';

/** Rows rendered before "show more"; a phone shows about eight at a time. */
const PAGE_SIZE = 25;

export default function ContactsPage() {
  return (
    <AuthGate>
      <Contacts />
    </AuthGate>
  );
}

function Contacts() {
  const { personBalances, status, addPerson, editPerson, removePerson } = useLedger();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  // Their history is fetched for them, a page at a time. It used to be filtered out of
  // the whole ledger, which meant every contact screen paid for every other contact.
  const theirQuery = useMemo(
    () => ({
      personId: selectedId,
      direction: 'ALL' as const,
      search: '',
      from: null,
      to: null,
      tags: [],
    }),
    [selectedId],
  );
  const history = useLedgerPage(theirQuery, {
    pageSize: DEFAULT_PAGE_SIZE,
    enabled: selectedId !== null,
  });

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '') return personBalances;
    return personBalances.filter(({ person }) => person.name.toLowerCase().includes(needle));
  }, [personBalances, search]);

  const visible = matches.slice(0, visibleCount);

  const openContact = (id: string) => {
    window.history.pushState(null, '', `/contacts/?id=${encodeURIComponent(id)}`);
    setSelectedId(id);
  };

  const backToList = () => {
    window.history.pushState(null, '', '/contacts/');
    setSelectedId(null);
  };

  const savePerson = async (input: PersonInput) => {
    const result =
      editing === 'new' || editing === null
        ? await addPerson(input)
        : await editPerson(editing.id, input);
    if (result.ok) {
      showToast({ tone: 'success', title: t('people.saved', { name: result.person.name }) });
      setEditing(null);
    }
    return result;
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setDeleting(true);
    const result = await removePerson(removing.id);
    setDeleting(false);

    if (!result.ok) {
      showToast({ tone: 'error', title: result.message });
      return;
    }
    showToast({ tone: 'success', title: t('people.removed', { name: removing.name }) });
    setRemoving(null);
    backToList();
  };

  const sheets = (
    <>
      {editing ? (
        <PersonSheet
          person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={savePerson}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title={t('people.removeTitle')}
        message={t('people.removeMessage', { name: removing?.name ?? '' })}
        confirmLabel={t('entry.delete')}
        destructive
        busy={deleting}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  );

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

    // Null when they are square with you, which is also when the button below is not
    // drawn: one call decides both, so the offer and the form always agree.
    const settle = settleMode(person.id, balancePaise);

    // Reminding only makes sense in one direction and only when there is somewhere to
    // send it. Money you are holding for someone is not a debt to chase, and a contact
    // with no number has no chat to open.
    const whatsapp = whatsappNumber(person.phone);
    const canRemind = balancePaise < 0 && whatsapp !== '';

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

            {/* The whole reason this screen exists, for most visits: they have handed
                the money back and the balance should now be zero. Doing that by hand
                means picking between "I gave back" and "they paid back" - the two that
                are easiest to confuse and that move the balance opposite ways. */}
            {settle ? (
              <Button
                size="lg"
                className="mt-4 w-full"
                onClick={() => setSheet(settle)}
              >
                {t('settle.button', { amount: formatRupees(settle.amountPaise) })}
              </Button>
            ) : null}

            {canRemind ? (
              <RemindButton
                className="mt-3 w-full"
                whatsapp={whatsapp}
                buildText={() =>
                  buildReminderText(
                    person,
                    -balancePaise,
                    // Exact when the loaded page reaches back far enough to prove it,
                    // and left out rather than guessed when it does not.
                    outstandingSince(history.entries, { complete: !history.hasMore }),
                    t,
                    window.location.origin,
                  )
                }
              />
            ) : null}

            <ShareButton
              className="mt-3 w-full"
              buildText={() =>
                buildContactShareText(
                  person,
                  balancePaise,
                  moneyInPaise,
                  moneyOutPaise,
                  history.entries,
                  todayIso(),
                  t,
                  window.location.origin,
                )
              }
            />
          </section>

          <PendingEntries personId={person.id} />

          <ContactDetails person={person} />

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
            {history.status === 'loading' ? (
              <Card>
                <LoadingPanel label={t('history.loading')} />
              </Card>
            ) : history.entries.length === 0 ? (
              <Card className="px-6 py-8 text-center">
                <p className="text-[15px] text-ink-muted">{t('contacts.noHistory')}</p>
              </Card>
            ) : (
              <>
                <div className="card overflow-hidden p-0">
                  <TransactionList entries={history.entries} onSelect={setOpenEntry} hidePerson />
                </div>
                {history.hasMore ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="mt-3 w-full"
                    onClick={history.loadMore}
                    loading={history.loadingMore}
                    loadingLabel={t('history.loading')}
                  >
                    {t('history.showMore', {
                      count: Math.min(DEFAULT_PAGE_SIZE, history.total - history.entries.length),
                    })}
                  </Button>
                ) : null}
              </>
            )}
          </section>

          {/* Editing and removing belong with the person, not on a separate admin list. */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => setRemoving(person)}
            >
              {t('contacts.remove')}
            </Button>
            <Button size="lg" className="flex-1" onClick={() => setEditing(person)}>
              {t('contacts.manage')}
            </Button>
          </div>
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
        {sheets}
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
      <div className="space-y-4">
        {personBalances.length === 0 ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-base font-semibold text-ink">{t('contacts.empty')}</p>
            <p className="mx-auto mt-2 max-w-[24rem] text-[15px] leading-relaxed text-ink-muted">
              {t('contacts.emptyBody')}
            </p>
          </Card>
        ) : (
          <>
            {/* Searching only earns its space once scrolling stops being enough. */}
            {personBalances.length > 8 ? (
              <div>
                <label htmlFor="contact-search" className="sr-only">
                  {t('contacts.search')}
                </label>
                <input
                  id="contact-search"
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  placeholder={t('contacts.search')}
                  enterKeyHint="search"
                  className="field-input"
                />
              </div>
            ) : null}

            {matches.length === 0 ? (
              <Card className="px-6 py-8 text-center">
                <p className="text-[15px] text-ink-muted">{t('contacts.noMatch')}</p>
              </Card>
            ) : (
              <div className="card overflow-hidden p-0">
                <PeopleBalances balances={visible} onSelect={openContact} onSettle={setSheet} />
              </div>
            )}

            {matches.length > visible.length ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                {t('history.showMore', {
                  count: Math.min(PAGE_SIZE, matches.length - visible.length),
                })}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <Fab label={t('contacts.add')} onClick={() => setEditing('new')} />
      {/* Settling from a row happens here, without opening the contact first. */}
      <TransactionSheet mode={sheet} onClose={() => setSheet(null)} />
      {sheets}
    </AppShell>
  );
}
