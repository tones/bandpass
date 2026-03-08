'use server';

import { cookies } from 'next/headers';

export async function verifyGatePassword(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const password = formData.get('password');
  if (typeof password !== 'string' || !password.trim()) {
    return { error: 'Password is required.' };
  }

  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    return { error: 'Site password not configured.' };
  }

  if (password.trim() !== sitePassword) {
    return { error: 'Incorrect password.' };
  }

  const token = Buffer.from(sitePassword).toString('base64');
  const cookieStore = await cookies();
  cookieStore.set('bandpass_gate', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });

  return { error: null };
}
