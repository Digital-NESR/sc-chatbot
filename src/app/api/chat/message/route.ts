import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

function generateTitle(content: string): string {
    const words = content.trim().split(/\s+/);
    if (words.length <= 7) return content;
    return words.slice(0, 7).join(' ') + '...';
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { sessionId, botId, role, content } = body;

        if (!botId || !role || !content) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        let currentSessionId = sessionId;

        if (!currentSessionId) {
            const newTitle = generateTitle(content);
            const chatSession = await prisma.chatSession.create({
                data: {
                    userId: session.user.email,
                    botId: botId,
                    title: newTitle,
                },
            });
            currentSessionId = chatSession.id;
        } else {
            const existingSession = await prisma.chatSession.findFirst({
                where: {
                    id: currentSessionId,
                    userId: session.user.email
                }
            });
            if (!existingSession) {
                return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 404 });
            }

            await prisma.chatSession.update({
                where: { id: currentSessionId },
                data: { updatedAt: new Date() }
            });
        }

        const newMessage = await prisma.message.create({
            data: {
                sessionId: currentSessionId,
                role: role,
                content: content,
            },
        });

        return NextResponse.json({ success: true, message: newMessage, sessionId: currentSessionId });
    } catch (error) {
        console.error('Failed to save message:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
