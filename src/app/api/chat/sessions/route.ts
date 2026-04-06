import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const chatSessions = await prisma.chatSession.findMany({
            where: {
                userEmail: session.user.email,
                isDeleted: false,
            },
            orderBy: {
                updatedAt: 'desc',
            },
            select: {
                id: true,
                botId: true,
                title: true,
                updatedAt: true,
            },
        });

        return NextResponse.json(chatSessions);
    } catch (error) {
        console.error('Failed to fetch chat sessions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
