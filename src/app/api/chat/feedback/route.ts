import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { siteConfig } from '@/config/site';

export const dynamic = 'force-dynamic';

/** 'up', 'down', or null to take a rating back. */
const VALID = ['up', 'down'] as const;

/** The offered reasons, by id. Anything else is not stored. */
const REASONS = siteConfig.text.feedback.reasons.map(r => r.id);

/** A note is a few words, not an essay pasted into the box. */
const MAX_NOTE = 500;

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
        const { messageId, feedback, reason, note } = await request.json();

        if (!messageId || typeof messageId !== 'string') {
            return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });
        }
        if (feedback !== null && !VALID.includes(feedback)) {
            return NextResponse.json({ error: 'feedback must be "up", "down" or null' }, { status: 400 });
        }
        if (reason != null && !REASONS.includes(reason)) {
            return NextResponse.json({ error: 'Unknown reason' }, { status: 400 });
        }
        if (note != null && typeof note !== 'string') {
            return NextResponse.json({ error: 'note must be text' }, { status: 400 });
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

        /* Taking the rating back takes the reason with it. A reason without a
           thumb is a complaint about an answer nobody is complaining about,
           and it would still be counted on /admin/feedback. */
        const data = feedback
            ? {
                  feedback,
                  feedbackAt: new Date(),
                  // Only ever written when it was sent: a second call carrying
                  // the thumb alone must not wipe a reason given a moment ago.
                  ...(reason !== undefined ? { feedbackReason: reason || null } : {}),
                  ...(note !== undefined ? { feedbackNote: note ? note.slice(0, MAX_NOTE) : null } : {}),
              }
            : { feedback: null, feedbackAt: null, feedbackReason: null, feedbackNote: null };

        await prisma.message.update({ where: { id: messageId }, data });

        return NextResponse.json({ success: true, feedback });
    } catch (error) {
        console.error('Failed to save feedback:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
