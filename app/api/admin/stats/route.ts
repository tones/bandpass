import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getGlobalStats } from '@/lib/db/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stats = await getGlobalStats();
  return NextResponse.json(stats);
}
