'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { linkBandcamp } from '@/app/(app)/account/actions';

interface BandcampLinkFormProps {
  mode?: 'connect' | 'update';
}

export function BandcampLinkForm({ mode = 'connect' }: BandcampLinkFormProps) {
  const [state, formAction, pending] = useActionState(linkBandcamp, { error: null, success: false });
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const isUpdate = mode === 'update';

  return (
    <div className={isUpdate ? '' : 'rounded-lg border border-amber-900/50 bg-amber-950/20 p-4'}>
      {!isUpdate && (
        <>
          <h2 className="mb-2 text-sm font-medium text-amber-400">Connect Bandcamp</h2>
          <p className="mb-4 text-sm text-zinc-400">
            Link your Bandcamp account to sync your feed, purchases, and wishlist.
          </p>
        </>
      )}

      <details className="mb-4">
        <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-400">
          How to get your cookie
        </summary>
        <ol className="mt-2 space-y-1.5 pl-1 text-sm text-zinc-400">
          <li>
            <span className="mr-2 text-zinc-500">1.</span>
            Log in to{' '}
            <a href="https://bandcamp.com" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400">
              bandcamp.com
            </a>
          </li>
          <li>
            <span className="mr-2 text-zinc-500">2.</span>
            Open DevTools — press <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">F12</kbd> or{' '}
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">⌘⌥I</kbd>
          </li>
          <li>
            <span className="mr-2 text-zinc-500">3.</span>
            Go to <span className="text-zinc-300">Application</span> → <span className="text-zinc-300">Cookies</span> → <span className="text-zinc-300">bandcamp.com</span>
          </li>
          <li>
            <span className="mr-2 text-zinc-500">4.</span>
            Find the <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">identity</code> cookie and copy its value
          </li>
          <li>
            <span className="mr-2 text-zinc-500">5.</span>
            Paste it below
          </li>
        </ol>
      </details>

      <form action={formAction}>
        <textarea
          name="cookie"
          rows={3}
          placeholder="Paste your identity cookie value here..."
          className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600"
          required
        />
        {state.error && (
          <p className="mb-3 text-sm text-red-400">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
        >
          {pending ? (isUpdate ? 'Updating...' : 'Connecting...') : (isUpdate ? 'Update cookie' : 'Connect Bandcamp')}
        </button>
      </form>
    </div>
  );
}
