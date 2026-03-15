import { getSession } from '@/lib/session';
import { AppHeader } from '@/components/AppHeader';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const username = session.username ?? null;
  return (
    <>
      <AppHeader username={username} />
      {children}
    </>
  );
}
