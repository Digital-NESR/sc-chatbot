import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { botId, role, content } = body;

        if (!botId || !role || !content) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const chatSession = await prisma.chatSession.upsert({
            where: {
                userId_botId: {
                    userId: session.user.email,
                    botId: botId,
                },
            },
            update: {},
            create: {
                userId: session.user.email,
                botId: botId,
            },
        });

        const newMessage = await prisma.message.create({
            data: {
                sessionId: chatSession.id,
                role: role,
                content: content,
            },
        });

        return NextResponse.json({ success: true, message: newMessage });
    } catch (error) {
        console.error('Failed to save message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
