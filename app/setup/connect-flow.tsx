'use client';

import { useState, useEffect, useCallback } from 'react';

type FlowState =
  | { step: 'detecting' }
  | { step: 'no-extension' }
  | { step: 'connecting' }
  | { step: 'no-cookie' }
  | { step: 'error'; message: string };

const DETECT_TIMEOUT_MS = 2500;
const DETECT_POLL_MS = 100;

export function ConnectFlow() {
  const [state, setState] = useState<FlowState>({ step: 'detecting' });

  const attemptConnect = useCallback(async () => {
    setState({ step: 'connecting' });

    const cookie = await requestCookie();

    if (!cookie) {
      setState({ step: 'no-cookie' });
      return;
    }

    try {
      const res = await fetch('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = '/timeline';
        return;
      }
      setState({ step: 'error', message: data.error || 'Connection failed.' });
    } catch {
      setState({ step: 'error', message: 'Could not reach server. Please try again.' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();

    function poll() {
      if (cancelled) return;
      if (document.documentElement.dataset.bandpassExtension === 'true') {
        attemptConnect();
        return;
      }
      if (Date.now() - start > DETECT_TIMEOUT_MS) {
        setState({ step: 'no-extension' });
        return;
      }
      setTimeout(poll, DETECT_POLL_MS);
    }

    poll();
    return () => { cancelled = true; };
  }, [attemptConnect]);

  if (state.step === 'detecting') {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
        <p className="text-sm text-zinc-400">Looking for the Bandpass extension...</p>
      </div>
    );
  }

  if (state.step === 'connecting') {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
        <p className="text-sm text-zinc-400">Connecting your Bandcamp account...</p>
      </div>
    );
  }

  if (state.step === 'no-cookie') {
    return (
      <div className="py-8">
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-center">
          <p className="mb-1 text-sm font-medium text-zinc-300">Extension found, but you&apos;re not logged in to Bandcamp</p>
          <p className="text-sm text-zinc-500">Log in to Bandcamp first, then come back here.</p>
        </div>
        <div className="flex flex-col gap-3">
          <a
            href="https://bandcamp.com/login"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-amber-600 px-5 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            Log in to Bandcamp
          </a>
          <button
            onClick={() => attemptConnect()}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (state.step === 'error') {
    return (
      <div className="py-8">
        <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 p-5 text-center">
          <p className="text-sm text-red-400">{state.message}</p>
        </div>
        <button
          onClick={() => attemptConnect()}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          Try again
        </button>
      </div>
    );
  }

  // step === 'no-extension'
  return (
    <div>
      <section className="mb-10">
        <h2 className="mb-5 text-lg font-medium text-zinc-200">1. Download the extension</h2>
        <a
          href="/bandpass-extension.zip"
          download
          className="inline-block rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          Download Bandpass extension
        </a>
        <p className="mt-3 text-sm text-zinc-500">
          Then unzip it — you should get a folder called <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">extension</code>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-5 text-lg font-medium text-zinc-200">2. Install it in Chrome</h2>
        <ol className="space-y-4 text-sm text-zinc-400">
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">a</span>
            <span>
              Open a new tab and go to{' '}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">chrome://extensions</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">b</span>
            <span>
              Turn on <strong className="text-zinc-300">Developer mode</strong> using the toggle in the top-right corner
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">c</span>
            <span>
              Click <strong className="text-zinc-300">Load unpacked</strong> and select the{' '}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">extension</code>{' '}
              folder you just unzipped
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">d</span>
            <span>
              You should see the Bandpass icon appear in your toolbar — click the puzzle piece icon and pin it for easy access
            </span>
          </li>
        </ol>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="mb-2 text-sm font-medium text-zinc-300">Then come back here</h3>
        <p className="text-sm text-zinc-500">
          After installing, refresh this page. If you&apos;re logged in at{' '}
          <a href="https://bandcamp.com" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400">
            bandcamp.com
          </a>
          , Bandpass will connect automatically.
        </p>
      </section>
    </div>
  );
}

function requestCookie(): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      document.removeEventListener('bandpass:cookie-result', handler);
      resolve(null);
    }, 5000);

    function handler(e: Event) {
      clearTimeout(timeout);
      document.removeEventListener('bandpass:cookie-result', handler);
      resolve((e as CustomEvent).detail?.cookie ?? null);
    }

    document.addEventListener('bandpass:cookie-result', handler);
    document.dispatchEvent(new CustomEvent('bandpass:request-cookie'));
  });
}
