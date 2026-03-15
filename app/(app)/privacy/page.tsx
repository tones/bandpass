import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-xl px-6 py-12">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mb-8 text-sm text-zinc-500">Last updated: March 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-400">
          <section>
            <h2 className="mb-3 text-base font-medium text-zinc-200">What Bandpass accesses</h2>
            <p>
              The Bandpass browser extension reads a single cookie from bandcamp.com — the{' '}
              <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">identity</code> cookie
              that Bandcamp sets when you log in. This is used to authenticate your Bandcamp account
              with your Bandpass server. The extension does not access any other cookies, browsing
              history, passwords, or personal data.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-medium text-zinc-200">Where your data goes</h2>
            <p>
              The identity cookie is sent to your Bandpass server (hosted at bandpass.fly.dev) over
              an encrypted HTTPS connection. It is stored in an encrypted server-side session so your
              Bandcamp feed can sync in the background. Your data is never sent to any third party.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-medium text-zinc-200">What Bandpass stores</h2>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong className="text-zinc-300">On the server:</strong> Your Bandcamp identity
                cookie (encrypted), your Bandcamp fan ID and username, and cached copies of your
                Bandcamp feed and collection data.
              </li>
              <li>
                <strong className="text-zinc-300">In the extension:</strong> Your Bandpass server
                URL and connection status. No cookies or authentication tokens are stored in the
                extension itself.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-medium text-zinc-200">What Bandpass does not do</h2>
            <ul className="ml-4 list-disc space-y-2">
              <li>Does not access your Bandcamp password</li>
              <li>Does not track your browsing activity</li>
              <li>Does not share data with third parties</li>
              <li>Does not collect analytics or telemetry</li>
              <li>Does not modify any Bandcamp pages beyond adding an &ldquo;Open in Bandpass&rdquo; link</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-medium text-zinc-200">Disconnecting</h2>
            <p>
              You can disconnect your account at any time using the extension popup or by visiting
              your account page on Bandpass. Disconnecting destroys your server-side session. You can
              also uninstall the extension at any time from{' '}
              <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">chrome://extensions</code>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-medium text-zinc-200">Contact</h2>
            <p>
              Bandpass is a personal project. If you have questions about this privacy policy,
              open an issue on the project&apos;s GitHub repository.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
