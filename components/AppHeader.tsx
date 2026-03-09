type NavTab = 'feed' | 'music' | 'shortlist';

const NAV_ITEMS: { id: NavTab; label: string; href: string }[] = [
  { id: 'music', label: 'Music', href: '/music' },
  { id: 'feed', label: 'Timeline', href: '/feed' },
  { id: 'shortlist', label: 'Shortlist', href: '/shortlist' },
];

interface AppHeaderProps {
  activeTab: NavTab;
  username?: string | null;
}

export function AppHeader({ activeTab, username }: AppHeaderProps) {
  return (
    <header className="border-b border-zinc-800">
      <div className="flex items-center justify-between px-6 py-3">
        <a href="/music" className="text-lg font-semibold tracking-tight text-zinc-100">
          Bandpass
        </a>
        <div className="flex items-center gap-3">
          {username ? (
            <a
              href="/account"
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              {username}
            </a>
          ) : (
            <a
              href="/login"
              className="rounded px-3 py-1 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Log in
            </a>
          )}
        </div>
      </div>
      <nav className="flex gap-1 px-6 pb-2">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === item.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
            }`}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
