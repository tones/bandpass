import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  identityCookie?: string;
  fanId?: number;
  username?: string;
  imageUrl?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'bandpass-dev-secret-must-be-32-chars-long!!',
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
