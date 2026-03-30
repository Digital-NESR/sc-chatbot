import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
    () => NextResponse.next(),
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
