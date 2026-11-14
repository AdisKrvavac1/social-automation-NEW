import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-sigurna konfiguracija (bez Prisme) koju koristi middleware.
 * Puna konfiguracija s provjerom lozinke je u auth.ts.
 */
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      if (path.startsWith('/dashboard')) return isLoggedIn;
      if (path.startsWith('/api/admin')) return auth?.user?.role === 'ADMIN';
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.restaurantId = user.restaurantId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as 'ADMIN' | 'OWNER' | 'STAFF';
        session.user.restaurantId = (token.restaurantId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
