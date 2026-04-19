'use server';

import { getUser } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';

export async function linkBandcamp(
  _prevState: { error: string | null; success: boolean },
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const user = await getUser();
  if (!user) {
    return { error: 'Not authenticated.', success: false };
  }

  const cookie = formData.get('cookie') as string | null;
  if (!cookie?.trim()) {
    return { error: 'Please paste your identity cookie value.', success: false };
  }

  const trimmed = cookie.trim();

  try {
    const res = await fetch('https://bandcamp.com/api/fan/2/collection_summary', {
      headers: { Cookie: `identity=${trimmed}` },
    });

    if (!res.ok) {
      return { error: 'Invalid cookie — Bandcamp rejected it. Make sure you copied the full value.', success: false };
    }

    const data = await res.json();
    if (!data.fan_id) {
      return { error: 'Invalid cookie — could not find your Bandcamp account.', success: false };
    }

    const fanId = data.fan_id as number;
    const username = (data.collection_summary?.username as string) ?? null;

    const conflict = await queryOne<{ id: number }>(
      'SELECT id FROM users WHERE bandcamp_fan_id = $1 AND id != $2',
      [fanId, user.userId],
    );
    if (conflict) {
      return { error: 'This Bandcamp account is already linked to another user.', success: false };
    }

    await execute(
      'UPDATE users SET bandcamp_fan_id = $1, updated_at = NOW() WHERE id = $2',
      [fanId, user.userId],
    );

    await execute(
      `INSERT INTO sync_state (fan_id, username, identity_cookie) VALUES ($1, $2, $3)
       ON CONFLICT (fan_id) DO UPDATE SET username = $2, identity_cookie = $3`,
      [fanId, username, trimmed],
    );
  } catch {
    return { error: 'Could not reach Bandcamp. Please try again.', success: false };
  }

  return { error: null, success: true };
}
