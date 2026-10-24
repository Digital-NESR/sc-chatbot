import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * Every answer a user has rated, worst first.
 *
 * The thumbs are the only quality signal the users can give, and a signal
 * nobody reads is not a signal. Thumbs-down leads, with the question that
 * produced the answer attached, because an answer on its own rarely says what
 * went wrong.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const rated = await prisma.message.findMany({
            where: { feedback: { not: null } },
            orderBy: { feedbackAt: 'desc' },
            take: 300,
            select: {
                id: true,
                sessionId: true,
                content: true,
                feedback: true,
                feedbackAt: true,
                createdAt: true,
                reviewNote: true,
                reviewStatus: true,
                reviewedAt: true,
                session: { select: { botId: true, title: true, userEmail: true } },
            },
        });

        // The question is whatever the user said last before the answer. Done
        // in one query for the sessions involved rather than per message.
        const sessionIds = [...new Set(rated.map(m => m.sessionId))];
        const userTurns = sessionIds.length
            ? await prisma.message.findMany({
                  where: { sessionId: { in: sessionIds }, role: 'user' },
                  orderBy: { createdAt: 'asc' },
                  select: { sessionId: true, content: true, createdAt: true },
              })
            : [];

        const askedBefore = (sessionId: string, at: Date) => {
            let found: string | null = null;
            for (const t of userTurns) {
                if (t.sessionId !== sessionId) continue;
                if (t.createdAt > at) break;
                found = t.content;
            }
            return found;
        };

        const items = rated.map(m => ({
            id: m.id,
            sessionId: m.sessionId,
            botId: m.session.botId,
            sessionTitle: m.session.title,
            userEmail: m.session.userEmail,
            feedback: m.feedback,
            feedbackAt: m.feedbackAt,
            answeredAt: m.createdAt,
            question: askedBefore(m.sessionId, m.createdAt),
            content: m.content,
            reviewNote: m.reviewNote,
            reviewStatus: m.reviewStatus,
            reviewedAt: m.reviewedAt,
        }));

        // Open thumbs-down first: it is the half anyone acts on. Resolved ones
        // sink, so the top of the list is always the work that is left.
        const rank = (i: (typeof items)[number]) =>
            i.reviewStatus === 'resolved' ? 2 : i.feedback === 'down' ? 0 : 1;
        items.sort((a, b) => {
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            return (b.feedbackAt?.getTime() ?? 0) - (a.feedbackAt?.getTime() ?? 0);
        });

        return NextResponse.json({
            items,
            up: items.filter(i => i.feedback === 'up').length,
            down: items.filter(i => i.feedback === 'down').length,
            openDown: items.filter(i => i.feedback === 'down' && i.reviewStatus !== 'resolved').length,
            fetchedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to fetch feedback:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Triage one rated answer: what was wrong with it, and whether it is done.
 *
 * Separate from the user's own thumb, which is never overwritten here. The
 * thumb says someone was unhappy; the note says why, and that is the part
 * worth keeping, because by the time anyone looks the conversation that
 * produced it is cold.
 */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { messageId, reviewNote, reviewStatus } = await request.json();

        if (!messageId || typeof messageId !== 'string') {
            return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });
        }
        if (reviewStatus !== undefined && reviewStatus !== null && reviewStatus !== 'resolved') {
            return NextResponse.json({ error: 'reviewStatus must be "resolved" or null' }, { status: 400 });
        }

        const data: { reviewNote?: string | null; reviewStatus?: string | null; reviewedAt?: Date | null } = {};
        if (reviewNote !== undefined) data.reviewNote = reviewNote || null;
        if (reviewStatus !== undefined) {
            data.reviewStatus = reviewStatus;
            data.reviewedAt = reviewStatus ? new Date() : null;
        }
        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
        }

        const updated = await prisma.message.update({
            where: { id: messageId },
            data,
            select: { id: true, reviewNote: true, reviewStatus: true, reviewedAt: true },
        });

        return NextResponse.json({ success: true, ...updated });
    } catch (error) {
        console.error('Failed to save review:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
