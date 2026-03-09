'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-100">Something went wrong</h1>
        <p className="mt-3 text-sm text-zinc-400">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
