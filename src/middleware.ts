import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
    (req) => {
        if (req.nextUrl.pathname.startsWith('/admin')) {
            const adminEmails = (process.env.ADMIN_EMAILS || 'mfarhan1@nesr.com')
                .split(',')
                .map(e => e.trim().toLowerCase());
            
            const userEmail = req.nextauth.token?.email?.toLowerCase() || '';
            if (!adminEmails.includes(userEmail)) {
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

// Only protect actual page routes — exclude ALL api routes, login, and static files.
// /api/auth  — NextAuth callbacks (must be public)
// /api/chat  — internal proxy called by the frontend (session cookie handles auth)
// /api/*     — any future API routes
export const config = {
    matcher: [
        '/((?!login|api|_next/static|_next/image|favicon.ico|icon.png|nesr-logo.jpg).*)',
    ],
};
