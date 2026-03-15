import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getAllUsersWithStats, getGlobalStats } from '@/lib/db/admin';
import { AdminView } from '@/components/AdminView';

export const metadata: Metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getSession();

  if (!session.fanId || session.fanId !== Number(process.env.ADMIN_FAN_ID)) {
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
