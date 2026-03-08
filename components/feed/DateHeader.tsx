interface DateHeaderProps {
  label: string;
}

export function DateHeader({ label }: DateHeaderProps) {
  return (
    <div className="sticky top-12 z-[5] border-b border-zinc-800/50 bg-zinc-950/90 px-6 py-2 backdrop-blur">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
    </div>
  );
}
