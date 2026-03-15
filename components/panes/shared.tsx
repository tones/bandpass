export function formatDate(dateStr: string): string {
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const d = new Date(normalized);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-600">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function Row({ label, children, sub }: { label: string; children: React.ReactNode; sub?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={sub ? 'text-zinc-600' : 'text-zinc-500'}>{label}</span>
      <span className={sub ? 'text-zinc-400' : 'text-zinc-200'}>{children}</span>
    </div>
  );
}

export function StatusBadge({
  done,
  active,
  doneLabel,
  activeLabel,
  pendingLabel,
}: {
  done: boolean;
  active: boolean;
  doneLabel: string;
  activeLabel: string;
  pendingLabel: string;
}) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        {activeLabel}
      </span>
    );
  }
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-400">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
        {doneLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-500">
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
      {pendingLabel}
    </span>
  );
}
