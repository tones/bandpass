import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Enter' };

export default function GateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
