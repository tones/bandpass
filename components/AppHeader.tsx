'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavTab = 'timeline' | 'music' | 'crates';

const NAV_ITEMS: { id: NavTab; label: string; href: string }[] = [
  { id: 'music', label: 'Music', href: '/music' },
  { id: 'timeline', label: 'Timeline', href: '/timeline' },
  { id: 'crates', label: 'Crates', href: '/crates' },
];

interface AppHeaderProps {
  username?: string | null;
}

export function AppHeader({ username }: AppHeaderProps) {
  const pathname = usePathname();
  const activeTab: NavTab | undefined =
    pathname.startsWith('/crates') ? 'crates'
    : pathname.startsWith('/timeline') ? 'timeline'
    : pathname.startsWith('/music') ? 'music'
    : undefined;

  return (
    <header className="border-b border-zinc-800">
      <div className="flex items-center justify-between px-6 py-3">
        <Link href="/music" className="text-lg font-semibold tracking-tight text-zinc-100">
          Bandpass
        </Link>
        <div className="flex items-center gap-3">
          {username ? (
            <Link
              href="/account"
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              {username}
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded px-3 py-1 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
      <nav className="flex gap-1 px-6 pb-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === item.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
