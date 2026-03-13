import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { PlayerProvider } from '@/contexts/PlayerContext';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bandpass',
  description: 'Bandcamp discovery, filtered',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        <PlayerProvider>
          {children}
        </PlayerProvider>
      </body>
    </html>
  );
}
