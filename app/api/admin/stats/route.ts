import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getGlobalStats } from '@/lib/db/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.fanId || session.fanId !== Number(process.env.ADMIN_FAN_ID)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stats = await getGlobalStats();
  return NextResponse.json(stats);
}
