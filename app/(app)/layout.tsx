import { getUser } from '@/lib/auth';
import { AppHeader } from '@/components/AppHeader';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const displayName = user?.username ?? user?.name ?? null;
  const isAdmin = user?.isAdmin ?? false;
  return (
    <>
      <AppHeader username={displayName} isAdmin={isAdmin} />
      {children}
    </>
  );
}
