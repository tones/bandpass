'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useNavigation } from '@/contexts/NavigationContext';

type NavTab = 'timeline' | 'music' | 'crates';

interface AppHeaderProps {
  username?: string | null;
}

export function AppHeader({ username }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { lastMusicPath, lastCratesPath, lastTimelinePath } = useNavigation();

  if (pathname.startsWith('/music')) {
    lastMusicPath.current = pathname;
  }
  if (pathname.startsWith('/crates')) {
    lastCratesPath.current = pathname;
  }

  const activeTab: NavTab | undefined =
    pathname.startsWith('/crates') ? 'crates'
    : pathname.startsWith('/timeline') ? 'timeline'
    : pathname.startsWith('/music') ? 'music'
    : undefined;

  const navItems: { id: NavTab; label: string; root: string; lastPath: React.MutableRefObject<string> }[] = [
    { id: 'music', label: 'Music', root: '/music', lastPath: lastMusicPath },
    { id: 'timeline', label: 'Timeline', root: '/timeline', lastPath: lastTimelinePath },
    { id: 'crates', label: 'Crates', root: '/crates', lastPath: lastCratesPath },
  ];

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
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.root}
            onClick={(e) => {
              if (item.lastPath.current !== item.root) {
                e.preventDefault();
                router.push(item.lastPath.current);
              }
            }}
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
