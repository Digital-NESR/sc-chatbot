import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (session?.user?.email !== 'mfarhan1@nesr.com') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    try {
        const sessions = await prisma.chatSession.findMany({
            where: { 
                userId,
                isDeleted: false
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        return NextResponse.json({ sessions });
    } catch (error) {
        console.error('Failed to fetch admin sessions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
