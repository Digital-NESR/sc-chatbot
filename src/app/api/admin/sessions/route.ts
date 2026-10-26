import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('userEmail');
    const q = searchParams.get('q')?.trim();

    // Two modes: one user's sessions, or a title search across everyone's. The
    // second is how you find a conversation when you remember what it was
    // about but not who had it.
    if (!userEmail && !q) {
        return NextResponse.json({ error: 'Missing userEmail or q parameter' }, { status: 400 });
    }

    try {
        const sessions = await prisma.chatSession.findMany({
            where: userEmail
                ? { userEmail }
                : { title: { contains: q as string, mode: 'insensitive' } },
            orderBy: {
                updatedAt: 'desc'
            },
            // A search is a way in, not a report - the directory is still there
            // for anyone wanting the whole list.
            ...(userEmail ? {} : { take: 25 }),
        });

        return NextResponse.json({ sessions });
    } catch (error) {
        console.error('Failed to fetch admin sessions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
