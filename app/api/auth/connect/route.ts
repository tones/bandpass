import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withCors, handlePreflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function POST(request: NextRequest) {
  let body: { cookie?: string };
  try {
    body = await request.json();
  } catch {
    return withCors(request, NextResponse.json(
      { ok: false, error: 'Invalid request body.' },
      { status: 400 },
    ));
  }

  const cookie = body.cookie?.trim();
  if (!cookie) {
    return withCors(request, NextResponse.json(
      { ok: false, error: 'Missing cookie value.' },
      { status: 400 },
    ));
  }

  try {
    const res = await fetch('https://bandcamp.com/api/fan/2/collection_summary', {
      headers: { Cookie: `identity=${cookie}` },
    });

    if (!res.ok) {
      return withCors(request, NextResponse.json(
        { ok: false, error: 'Invalid cookie — Bandcamp rejected it.' },
        { status: 401 },
      ));
    }

    const data = await res.json();
    if (!data.fan_id) {
      return withCors(request, NextResponse.json(
        { ok: false, error: 'Invalid cookie — could not find your Bandcamp account.' },
        { status: 401 },
      ));
    }

    const session = await getSession();
    session.identityCookie = cookie;
    session.fanId = data.fan_id;
    session.username = data.collection_summary?.username ?? undefined;
    await session.save();

    return withCors(request, NextResponse.json({
      ok: true,
      username: session.username ?? null,
      fanId: session.fanId,
    }));
  } catch {
    return withCors(request, NextResponse.json(
      { ok: false, error: 'Could not reach Bandcamp. Please try again.' },
      { status: 502 },
    ));
  }
}
