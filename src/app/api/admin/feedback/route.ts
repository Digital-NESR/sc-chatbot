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
            take: 200,
            select: {
                id: true,
                sessionId: true,
                content: true,
                feedback: true,
                feedbackAt: true,
                createdAt: true,
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
            question: askedBefore(m.sessionId, m.createdAt),
            content: m.content,
        }));

        // Thumbs-down first: it is the half anyone acts on.
        items.sort((a, b) => {
            if (a.feedback !== b.feedback) return a.feedback === 'down' ? -1 : 1;
            return (b.feedbackAt?.getTime() ?? 0) - (a.feedbackAt?.getTime() ?? 0);
        });

        return NextResponse.json({
            items,
            up: items.filter(i => i.feedback === 'up').length,
            down: items.filter(i => i.feedback === 'down').length,
        });
    } catch (error) {
        console.error('Failed to fetch feedback:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
