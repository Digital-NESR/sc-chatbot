export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('botId');

    if (!botId) {
        return NextResponse.json({ error: 'Missing botId' }, { status: 400 });
    }

    try {
        const chatSession = await prisma.chatSession.findUnique({
            where: {
                userId_botId: {
                    userId: session.user.email,
                    botId: botId,
                },
            },
            include: {
                messages: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });

        // ChatSession will hold array of messages, or null
        return NextResponse.json(chatSession?.messages || []);
    } catch (error) {
        console.error('Failed to fetch chat history:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
