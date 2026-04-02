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
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId parameter' }, { status: 400 });
    }

    try {
        const messages = await prisma.message.findMany({
            where: { 
                sessionId 
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        return NextResponse.json({ messages });
    } catch (error) {
        console.error('Failed to fetch admin messages:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
