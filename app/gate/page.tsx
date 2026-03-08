'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { verifyGatePassword } from './actions';

export default function GatePage() {
  const [state, formAction, pending] = useActionState(verifyGatePassword, { error: null });
  const router = useRouter();

  useEffect(() => {
    if (state.error === null && !pending) {
      const hasSubmitted = document.querySelector('form')?.dataset.submitted;
      if (hasSubmitted) router.push('/');
    }
  }, [state, pending, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Bandpass</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Enter the password to continue.
        </p>

        <form
          action={formAction}
          onSubmit={(e) => {
            (e.target as HTMLFormElement).dataset.submitted = 'true';
          }}
        >
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            required
            className="mb-4 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600"
          />
          {state.error && (
            <p className="mb-4 text-sm text-red-400">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            {pending ? 'Checking...' : 'Enter'}
          </button>
        </form>
      </div>
    </main>
  );
}
