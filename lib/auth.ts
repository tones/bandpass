import { auth } from '@/auth';
import { queryOne } from '@/lib/db';

export interface AppUser {
  userId: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  fanId: number | null;
  bandcampCookie: string | null;
  username: string | null;
  isAdmin: boolean;
}

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  avatar_url: string | null;
  bandcamp_fan_id: number | null;
}

interface SyncRow {
  identity_cookie: string | null;
  username: string | null;
}

/**
 * Resolve the current authenticated user from the Auth.js session,
 * joining with the users and sync_state tables for full context.
 * Returns null if not signed in.
 */
export async function getUser(): Promise<AppUser | null> {
  const session = await auth();
  if (!session?.userId) return null;

  const row = await queryOne<UserRow>(
    'SELECT id, email, name, avatar_url, bandcamp_fan_id FROM users WHERE id = $1',
    [session.userId],
  );
  if (!row) return null;

  let bandcampCookie: string | null = null;
  let username: string | null = null;

  if (row.bandcamp_fan_id) {
    const sync = await queryOne<SyncRow>(
      'SELECT identity_cookie, username FROM sync_state WHERE fan_id = $1',
      [row.bandcamp_fan_id],
    );
    if (sync) {
      bandcampCookie = sync.identity_cookie;
      username = sync.username;
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const isAdmin = adminEmail ? row.email === adminEmail : false;

  return {
    userId: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    fanId: row.bandcamp_fan_id,
    bandcampCookie,
    username,
    isAdmin,
  };
}

/**
 * Convenience: get the Bandcamp identity cookie for the current user.
 * Returns null if not signed in or Bandcamp not linked.
 */
export async function getIdentityCookie(): Promise<string | null> {
  const user = await getUser();
  return user?.bandcampCookie ?? null;
}
