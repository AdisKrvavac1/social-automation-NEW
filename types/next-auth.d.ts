import type { DefaultSession } from 'next-auth';

type AppRole = 'ADMIN' | 'OWNER' | 'STAFF';

declare module 'next-auth' {
  interface User {
    role: AppRole;
    restaurantId: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: AppRole;
      restaurantId: string | null;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    role?: AppRole;
    restaurantId?: string | null;
  }
}
