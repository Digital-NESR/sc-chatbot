import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** 'up', 'down', or null to take a rating back. */
const VALID = ['up', 'down'] as const;

/**
 * Records a thumbs up or down on one assistant answer.
 *
 * Ownership is checked through the session rather than on the message itself:
 * a Message has no userEmail, so the only thing that makes it yours is the
 * ChatSession it belongs to. Without that check any signed-in user could rate
 * anyone's answers by guessing a cuid.
 */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { messageId, feedback } = await request.json();

        if (!messageId || typeof messageId !== 'string') {
            return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });
        }
        if (feedback !== null && !VALID.includes(feedback)) {
            return NextResponse.json({ error: 'feedback must be "up", "down" or null' }, { status: 400 });
        }

        const message = await prisma.message.findFirst({
            where: { id: messageId, session: { userEmail } },
            select: { id: true, role: true },
        });

        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }
        // Rating your own question would be meaningless, and it would skew any
        // count of how the agents are doing.
        if (message.role !== 'assistant') {
            return NextResponse.json({ error: 'Only assistant messages can be rated' }, { status: 400 });
        }

        await prisma.message.update({
            where: { id: messageId },
            data: { feedback, feedbackAt: feedback ? new Date() : null },
        });

        return NextResponse.json({ success: true, feedback });
    } catch (error) {
        console.error('Failed to save feedback:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
