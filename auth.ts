import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { JWT } from 'next-auth/jwt';
import type { Session, User } from 'next-auth';
import { getPool } from '@/lib/db';

declare module 'next-auth' {
  interface Session {
    userId: number;
    fanId: number | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number;
    fanId?: number | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google' || !account.providerAccountId) return false;

      const pool = getPool();
      await pool.query(
        `INSERT INTO users (google_id, email, name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (google_id) DO UPDATE
         SET email = EXCLUDED.email, name = EXCLUDED.name,
             avatar_url = EXCLUDED.avatar_url, updated_at = NOW()`,
        [account.providerAccountId, user.email, user.name, user.image],
      );
      return true;
    },

    async jwt({ token, account }: { token: JWT; account?: { providerAccountId?: string } | null }) {
      if (account?.providerAccountId) {
        const pool = getPool();
        const result = await pool.query(
          'SELECT id, bandcamp_fan_id FROM users WHERE google_id = $1',
          [account.providerAccountId],
        );
        const row = result.rows[0] as { id: number; bandcamp_fan_id: number | null } | undefined;
        if (row) {
          token.userId = row.id;
          token.fanId = row.bandcamp_fan_id;
        }
      }
      return token;
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      session.userId = token.userId!;
      session.fanId = token.fanId ?? null;
      return session;
    },
  },
});
