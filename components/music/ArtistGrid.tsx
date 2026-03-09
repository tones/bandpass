'use client';

import { useState } from 'react';

export function MusicBrowse() {
  const [url, setUrl] = useState('');

  function handleGo() {
    const trimmed = url.trim();
    if (!trimmed) return;

    let slug: string;
    try {
      const parsed = new URL(
        trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      );
      slug = parsed.hostname.endsWith('.bandcamp.com')
        ? parsed.hostname.replace('.bandcamp.com', '')
        : parsed.hostname;
    } catch {
      slug = trimmed.replace(/\.bandcamp\.com$/, '');
    }

    window.location.href = `/music/${slug}`;
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h2 className="mb-2 text-lg font-medium text-zinc-200">
        Browse any Bandcamp artist or label
      </h2>
      <p className="mb-5 text-sm text-zinc-500">
        Enter a name or Bandcamp URL to explore their full catalog.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="e.g. ghostfunkorchestra or ghostfunkorchestra.bandcamp.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGo()}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        <button
          onClick={handleGo}
          className="shrink-0 rounded-lg bg-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600"
        >
          Browse
        </button>
      </div>
    </div>
  );
}
