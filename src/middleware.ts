import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

export default withAuth(
    (req) => {
        // isAdmin rather than a second copy of the list. This used to parse
        // ADMIN_EMAILS itself, with its own hardcoded fallback, so there were
        // two lists that had to be changed together and nothing said so.
        if (req.nextUrl.pathname.startsWith('/admin')) {
            if (!isAdmin(req.nextauth.token?.email)) {
                return NextResponse.redirect(new URL('/', req.url));
            }
        }
        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
        pages: {
            signIn: '/login',
        },
    }
);

// Page routes only. Every /api path is excluded here, which means NO api route
// is protected by this middleware - each one checks the session itself. That
// is a real obligation, not a formality: /api/chat went live without a check
// of its own on the strength of a comment here saying the cookie handled it,
// and was reachable by anyone who could resolve the host.
// /api/auth — NextAuth callbacks, which must stay public.
export const config = {
    matcher: [
        '/((?!login|api|_next/static|_next/image|favicon.ico|icon.png|nesr-logo.jpg).*)',
    ],
};
