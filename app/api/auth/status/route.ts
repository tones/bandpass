import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withCors, handlePreflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (session.fanId && session.identityCookie) {
    return withCors(request, NextResponse.json({
      authenticated: true,
      username: session.username ?? null,
    }));
  }

  return withCors(request, NextResponse.json({
    authenticated: false,
  }));
}
