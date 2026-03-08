'use client';

import { useActionState } from 'react';
import { loginWithCookie } from './actions';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginWithCookie, { error: null });

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Bandpass</h1>
        <p className="mb-8 text-sm text-zinc-400">
          Connect your Bandcamp account to see your feed.
        </p>

        <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">How to get your cookie</h2>
          <ol className="space-y-2 text-sm text-zinc-400">
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
        </div>

        <form action={formAction}>
          <label htmlFor="cookie" className="mb-2 block text-sm font-medium text-zinc-300">
            Identity cookie
          </label>
          <textarea
            id="cookie"
            name="cookie"
            rows={3}
            placeholder="Paste your identity cookie value here..."
            className="mb-4 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600"
            required
          />
          {state.error && (
            <p className="mb-4 text-sm text-red-400">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            {pending ? 'Connecting...' : 'Connect'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-600">
          Your cookie is stored in an encrypted session. We never see your password.
        </p>
      </div>
    </main>
  );
}
