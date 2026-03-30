import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);

    // 1. Strictly extract the email so TypeScript doesn't panic
    const userEmail = session?.user?.email;
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Use Next.js's built-in URL parser instead of the standard JS one
    const botId = request.nextUrl.searchParams.get('botId');

    if (!botId) {
        return NextResponse.json({ error: 'Missing botId' }, { status: 400 });
    }

    try {
        const chatSession = await prisma.chatSession.findUnique({
            where: {
                userId_botId: {
                    userId: userEmail,
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

        return NextResponse.json(chatSession?.messages || []);
    } catch (error) {
        console.error('Failed to fetch chat history:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}