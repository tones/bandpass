import type { Metadata } from 'next';
import { MusicBrowse } from '@/components/music/MusicBrowse';

export const metadata: Metadata = { title: 'Music' };

export default function MusicPage() {
  return (
    <main className="min-h-screen">
      <MusicBrowse />
    </main>
  );
}
