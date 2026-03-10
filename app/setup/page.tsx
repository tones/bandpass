import { AppHeader } from '@/components/AppHeader';
import { ConnectFlow } from './connect-flow';

export default function SetupPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <div className="mx-auto max-w-xl px-6 py-12">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Connect your Bandcamp account</h1>
        <p className="mb-8 text-sm text-zinc-400">
          Bandpass uses a small Chrome extension to read your Bandcamp login cookie.
          No passwords are shared — it just bridges your existing Bandcamp session.
        </p>

        <ConnectFlow />
      </div>
    </main>
  );
}
