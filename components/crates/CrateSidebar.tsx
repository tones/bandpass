import { useState, useEffect, useRef } from 'react';
import type { Crate } from '@/lib/db/crates';

interface CrateSidebarProps {
  crates: Crate[];
  activeCrateId: number | null;
  hasPlayingItem: boolean;
  renamingId: number | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onRename: (crateId: number) => void;
  onCancelRename: () => void;
  onSelectCrate: (crateId: number) => void;
  onStartRename: (crateId: number, currentName: string) => void;
  onDelete: (crateId: number) => void;
  onClearAll: () => void;
  onCreate: (name: string) => void;
}

export function CrateSidebar({
  crates,
  activeCrateId,
  hasPlayingItem,
  renamingId,
  renameValue,
  onSetRenameValue,
  onRename,
  onCancelRename,
  onSelectCrate,
  onStartRename,
  onDelete,
  onClearAll,
  onCreate,
}: CrateSidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showNewCrate, setShowNewCrate] = useState(false);
  const [newCrateName, setNewCrateName] = useState('');

  useEffect(() => {
    if (menuOpenId === null) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
        setConfirmDeleteId(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpenId]);

  const handleCreateCrate = () => {
    const name = newCrateName.trim();
    if (!name) return;
    setShowNewCrate(false);
    setNewCrateName('');
    onCreate(name);
  };

  return (
    <>
      <div className="flex w-56 shrink-0 flex-col border-r border-zinc-800">
        <nav className="flex-1 overflow-y-auto py-2">
          {crates.map((crate) => {
            const isActive = activeCrateId === crate.id;
            const isUser = crate.source === 'user';

            return (
              <div key={crate.id} className="group relative">
                {renamingId === crate.id ? (
                  <div className="px-3 py-1.5">
                    <input
                      value={renameValue}
                      onChange={(e) => onSetRenameValue(e.target.value)}
                      maxLength={64}
                      onBlur={() => onRename(crate.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onRename(crate.id);
                        if (e.key === 'Escape') onCancelRename();
                      }}
                      autoFocus
                      className="w-full rounded bg-zinc-700 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectCrate(crate.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectCrate(crate.id); } }}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                  >
                    <span className="truncate">{crate.name}</span>
                    {isUser && (
                      <button
                        type="button"
                        aria-label="Crate options"
                        aria-haspopup="menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuOpenId === crate.id) {
                            setMenuOpenId(null);
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
                            setMenuOpenId(crate.id);
                          }
                          setConfirmDeleteId(null);
                        }}
                        className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-xs transition-colors hover:bg-zinc-700 hover:text-zinc-200 ${
                          menuOpenId === crate.id
                            ? 'text-zinc-200'
                            : 'text-zinc-600 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        ···
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`border-t border-zinc-800 px-3 py-3 ${hasPlayingItem ? 'pb-24' : ''}`}>
          {showNewCrate ? (
            <div className="flex flex-col gap-2">
              <input
                value={newCrateName}
                onChange={(e) => setNewCrateName(e.target.value)}
                maxLength={64}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateCrate();
                  if (e.key === 'Escape') { setShowNewCrate(false); setNewCrateName(''); }
                }}
                placeholder="Crate name..."
                autoFocus
                className="w-full rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateCrate}
                  className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-200 transition-colors hover:bg-zinc-600"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowNewCrate(false); setNewCrateName(''); }}
                  className="rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewCrate(true)}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
            >
              + New Crate
            </button>
          )}
        </div>
      </div>

      {/* Three-dot dropdown menu (fixed position to avoid sidebar overflow clipping) */}
      {menuOpenId !== null && menuPos && (() => {
        const menuCrate = crates.find((c) => c.id === menuOpenId);
        if (!menuCrate) return null;
        return (
          <div
            ref={menuRef}
            className="fixed z-50 w-40 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {confirmDeleteId === menuCrate.id ? (
              <div className="px-3 py-2">
                <p className="mb-2 text-xs text-zinc-400">Delete &ldquo;{menuCrate.name}&rdquo;?</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { onDelete(menuCrate.id); setMenuOpenId(null); setConfirmDeleteId(null); }}
                    className="rounded bg-rose-600 px-2 py-1 text-xs text-white transition-colors hover:bg-rose-500"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : confirmClear ? (
              <div className="px-3 py-2">
                <p className="mb-2 text-xs text-zinc-400">Clear all items?</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { onClearAll(); setMenuOpenId(null); setConfirmClear(false); }}
                    className="rounded bg-rose-600 px-2 py-1 text-xs text-white transition-colors hover:bg-rose-500"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => {
                    setMenuOpenId(null);
                    onStartRename(menuCrate.id, menuCrate.name);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Rename
                </button>
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Clear all items
                </button>
                {crates.filter((c) => c.source === 'user').length > 1 && (
                  <button
                    onClick={() => setConfirmDeleteId(menuCrate.id)}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-rose-400 transition-colors hover:bg-zinc-800 hover:text-rose-300"
                  >
                    Delete crate
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}
    </>
  );
}
