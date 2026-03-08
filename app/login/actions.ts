'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export async function loginWithCookie(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const cookie = formData.get('cookie') as string | null;

  if (!cookie?.trim()) {
    return { error: 'Please paste your identity cookie value.' };
  }

  const trimmed = cookie.trim();

  try {
    const res = await fetch('https://bandcamp.com/api/fan/2/collection_summary', {
      headers: { Cookie: `identity=${trimmed}` },
    });

    if (!res.ok) {
      return { error: 'Invalid cookie — Bandcamp rejected it. Make sure you copied the full value.' };
    }

    const data = await res.json();
    if (!data.fan_id) {
      return { error: 'Invalid cookie — could not find your Bandcamp account.' };
    }

    const session = await getSession();
    session.identityCookie = trimmed;
    session.fanId = data.fan_id;
    session.username = data.collection_summary?.username ?? undefined;
    await session.save();
  } catch {
    return { error: 'Could not reach Bandcamp. Please try again.' };
  }

  redirect('/');
}
