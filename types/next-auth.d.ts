import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        user: {
            displayName?: string | null;
            jobTitle?: string | null;
        } & DefaultSession['user'];
    }

    interface User extends DefaultUser {
        displayName?: string | null;
        jobTitle?: string | null;
    }
}

declare module 'next-auth/jwt' {
    interface JWT extends DefaultJWT {
        displayName?: string | null;
        jobTitle?: string | null;
    }
}
