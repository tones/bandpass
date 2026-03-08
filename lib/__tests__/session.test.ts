import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({})),
}));

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(() => ({})),
}));

describe('getSessionPassword', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses SESSION_SECRET when provided', async () => {
    process.env.SESSION_SECRET = 'my-super-secret-that-is-long-enough!!';
    process.env.NODE_ENV = 'test';

    const mod = await import('../session');
    const session = await mod.getSession();
    expect(session).toBeDefined();
  });

  it('throws in production when SESSION_SECRET is unset', async () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'production';

    await expect(() => import('../session')).rejects.toThrow(
      'SESSION_SECRET environment variable is required in production',
    );
  });

  it('falls back to dev default when not in production', async () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'development';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('../session');
    expect(mod).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      'SESSION_SECRET not set — using insecure default for development',
    );
    warnSpy.mockRestore();
  });
});
