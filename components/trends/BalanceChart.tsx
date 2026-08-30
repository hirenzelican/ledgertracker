'use client';

/**
 * Two charts, never one with two scales.
 *
 * The balance is a running total in rupees; money in and out are per-month amounts. On a
 * shared axis one would flatten the other, and a second y-scale would let the reader draw
 * a crossing point that means nothing. So they are separate figures reading the same
 * months left to right.
 *
 * Colour alone never carries the in/out distinction: the two hues are only just far
 * enough apart under colour blindness, so the bars are also fixed in position (in always
 * left, out always right), separated by a gap, and named in a legend.
 */

import { useId, useState } from 'react';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { formatRupees } from '@/lib/calculations/money';
import type { MonthlyTotal } from '@/types/transaction';
import type { Translate } from '@/lib/i18n/locales';

const VIEW_W = 320;
const VIEW_H = 120;
const PAD_X = 4;

/** "2026-08-01" -> "Aug", in the reader's language. */
function monthLabel(month: string, t: Translate): string {
  const index = Number(month.slice(5, 7));
  return t(`month.${index}` as 'month.1');
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/* ------------------------------------------------------------------ balance over time */

export function BalanceChart({ data }: { data: readonly MonthlyTotal[] }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();

  if (data.length < 2) return null;

  // The axis spans zero whenever the balance crosses it - a line that leaves the frame
  // when someone owes you money would hide exactly the months worth looking at.
  const values = data.map((point) => point.closingBalancePaise);
  const top = niceMax(Math.max(...values, 0));
  const bottom = Math.min(...values, 0);
  const span = top - bottom || 1;

  const x = (index: number) =>
    PAD_X + (index * (VIEW_W - PAD_X * 2)) / Math.max(data.length - 1, 1);
  const y = (paise: number) => VIEW_H - 8 - ((paise - bottom) / span) * (VIEW_H - 20);

  const line = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const area = `${PAD_X},${y(bottom)} ${line} ${x(values.length - 1)},${y(bottom)}`;
  const zeroY = y(0);
  const shown = active ?? data.length - 1;
  const point = data[shown]!;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-32 w-full touch-none"
        role="img"
        aria-label={t('trends.chartLabel')}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          setActive(
            Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))),
          );
        }}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--chart-in))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--chart-in))" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Zero is the only gridline that means anything here: above it you are holding
            money, below it you are owed it. */}
        {bottom < 0 ? (
          <line
            x1="0"
            y1={zeroY}
            x2={VIEW_W}
            y2={zeroY}
            stroke="rgb(var(--border))"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ) : null}

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke="rgb(var(--chart-in))"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <line
          x1={x(shown)}
          y1="4"
          x2={x(shown)}
          y2={VIEW_H - 8}
          stroke="rgb(var(--ink-faint))"
          strokeWidth="1"
        />
        {/* A 2px surface ring keeps the marker readable wherever the line sits. */}
        <circle
          cx={x(shown)}
          cy={y(values[shown]!)}
          r="4.5"
          fill="rgb(var(--chart-in))"
          stroke="rgb(var(--surface))"
          strokeWidth="2"
        />
      </svg>

      <figcaption className="mt-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-muted">{monthLabel(point.month, t)}</span>
        <span className="tnum font-semibold text-ink">
          {formatRupees(Math.abs(point.closingBalancePaise))}
          {point.closingBalancePaise < 0 ? (
            <span className="ml-1 text-xs font-normal text-ink-faint">
              {t('dashboard.owedToYou').toLowerCase()}
            </span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------- in and out bars */

export function FlowChart({ data }: { data: readonly MonthlyTotal[] }) {
  const { t } = useTranslation();
  if (data.length === 0) return null;

  const peak = niceMax(
    Math.max(...data.map((point) => Math.max(point.moneyInPaise, point.moneyOutPaise)), 0),
  );

  return (
    <figure className="m-0">
      {/* Two series, so a legend is not optional. */}
      <div className="mb-2 flex gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-chart-in" aria-hidden="true" />
          {t('dashboard.moneyIn')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-chart-out" aria-hidden="true" />
          {t('dashboard.moneyOut')}
        </span>
      </div>

      <div
        className="flex items-end gap-1.5 overflow-x-auto pb-1"
        role="img"
        aria-label={t('trends.flowLabel')}
      >
        {data.map((point) => (
          <div key={point.month} className="flex min-w-[26px] flex-1 flex-col items-center gap-1">
            <div className="flex h-24 w-full items-end justify-center gap-[2px]">
              <Bar
                paise={point.moneyInPaise}
                peak={peak}
                className="bg-chart-in"
                label={t('dashboard.moneyIn')}
              />
              <Bar
                paise={point.moneyOutPaise}
                peak={peak}
                className="bg-chart-out"
                label={t('dashboard.moneyOut')}
              />
            </div>
            <span className="text-[10px] text-ink-faint">{monthLabel(point.month, t)}</span>
          </div>
        ))}
      </div>

      {/* The chart is a picture; this is the same data as text, for a screen reader and
          for anyone who cannot separate the two hues. */}
      <details className="mt-3">
        {/* Not the section heading repeated: this discloses the same data as text, and
            saying so is what makes it worth opening. */}
        <summary className="cursor-pointer text-xs font-medium text-ink-muted">
          {t('trends.flowLabel')}
        </summary>
        <ul className="mt-2 space-y-1">
          {data.map((point) => (
            <li key={point.month} className="tnum text-xs text-ink-muted">
              {t('trends.monthReading', {
                month: monthLabel(point.month, t),
                in: formatRupees(point.moneyInPaise),
                out: formatRupees(point.moneyOutPaise),
                balance: formatRupees(Math.abs(point.closingBalancePaise)),
              })}
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}

function Bar({
  paise,
  peak,
  className,
  label,
}: {
  paise: number;
  peak: number;
  className: string;
  label: string;
}) {
  // A month with nothing in it keeps a hairline so the gap reads as zero rather than as
  // missing data.
  const height = paise === 0 ? 1 : Math.max(2, (paise / peak) * 96);
  return (
    <span
      className={`w-1/2 rounded-t ${className}`}
      style={{ height: `${height}px` }}
      title={`${label}: ${formatRupees(paise)}`}
    />
  );
}
