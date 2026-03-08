import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  identityCookie?: string;
  fanId?: number;
  username?: string;
}

function getSessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  console.warn('SESSION_SECRET not set — using insecure default for development');
  return 'bandpass-dev-secret-must-be-32-chars-long!!';
}

const sessionOptions: SessionOptions = {
  password: getSessionPassword(),
  cookieName: 'bandpass_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getIdentityCookie(): Promise<string | null> {
  const session = await getSession();
  return session.identityCookie ?? null;
}
