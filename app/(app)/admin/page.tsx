import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { getAllUsersWithStats, getGlobalStats } from '@/lib/db/admin';
import { AdminView } from '@/components/AdminView';

export const metadata: Metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getUser();

  if (!user?.isAdmin) {
    redirect('/');
  }

  const [users, globalStats] = await Promise.all([
    getAllUsersWithStats(),
    getGlobalStats(),
  ]);

  return (
    <main className="min-h-screen">
      <AdminView users={users} globalStats={globalStats} />
    </main>
  );
}
