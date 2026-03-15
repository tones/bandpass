import { getSession } from '@/lib/session';
import { AppHeader } from '@/components/AppHeader';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const username = session.username ?? null;
  const isAdmin = session.fanId != null && session.fanId === Number(process.env.ADMIN_FAN_ID);
  return (
    <>
      <AppHeader username={username} isAdmin={isAdmin} />
      {children}
    </>
  );
}
