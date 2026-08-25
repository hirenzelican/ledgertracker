'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const ITEMS = [
  {
    href: '/',
    label: 'Home',
    icon: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  },
  {
    href: '/transactions/',
    label: 'Transactions',
    icon: 'M4 7h16M4 12h16M4 17h10',
  },
  {
    href: '/settings/',
    label: 'Settings',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4.5 12c0-.5.06-1 .17-1.46L3 8.9l2-3.46 2.1.9c.74-.6 1.6-1.05 2.53-1.3L10 3h4l.37 2.04c.93.25 1.79.7 2.53 1.3l2.1-.9 2 3.46-1.67 1.64c.1.47.17.95.17 1.46s-.06 1-.17 1.46L21 15.1l-2 3.46-2.1-.9c-.74.6-1.6 1.05-2.53 1.3L14 21h-4l-.37-2.04a7.4 7.4 0 0 1-2.53-1.3l-2.1.9-2-3.46 1.67-1.64A6.6 6.6 0 0 1 4.5 12Z',
  },
] as const;

/** Fixed bottom navigation: the three places this app has, always one tap away. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur
        pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href.replace(/\/$/, ''));
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition',
                  active ? 'text-brand' : 'text-ink-faint hover:text-ink-muted',
                )}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                  <path
                    d={item.icon}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
