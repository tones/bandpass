import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withCors, handlePreflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  session.destroy();
  return withCors(request, NextResponse.json({ ok: true }));
}
