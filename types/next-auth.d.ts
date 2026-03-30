import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        user: {
            jobTitle?: string;
        } & DefaultSession['user'];
    }

    interface User extends DefaultUser {
        jobTitle?: string;
    }
}

declare module 'next-auth/jwt' {
    interface JWT extends DefaultJWT {
        jobTitle?: string;
    }
}
