import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';
import { siteConfig } from '@/config/site';

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
            // Either thumb puts an answer in here: the user's, or an admin's
            // given from the transcript on /admin.
            where: { OR: [{ feedback: { not: null } }, { adminFeedback: { not: null } }] },
            // By when the answer was written rather than when it was rated,
            // because an admin-only rating has no feedbackAt and Postgres
            // sorts those nulls to the top of a DESC.
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: {
                id: true,
                sessionId: true,
                content: true,
                feedback: true,
                feedbackAt: true,
                feedbackReason: true,
                feedbackNote: true,
                adminFeedback: true,
                adminFeedbackBy: true,
                adminFeedbackAt: true,
                adminFeedbackReason: true,
                adminFeedbackNote: true,
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
            // What the user said was wrong, as opposed to reviewNote, which is
            // what we concluded afterwards. Keeping them apart matters: one is
            // evidence and the other is our reading of it.
            feedbackReason: m.feedbackReason,
            feedbackNote: m.feedbackNote,
            adminFeedback: m.adminFeedback,
            adminFeedbackBy: m.adminFeedbackBy,
            adminFeedbackAt: m.adminFeedbackAt,
            adminFeedbackReason: m.adminFeedbackReason,
            adminFeedbackNote: m.adminFeedbackNote,
            answeredAt: m.createdAt,
            question: askedBefore(m.sessionId, m.createdAt),
            content: m.content,
            reviewNote: m.reviewNote,
            reviewStatus: m.reviewStatus,
            reviewedAt: m.reviewedAt,
        }));

        // Open thumbs-down first: it is the half anyone acts on. A down from
        // either side counts, so an answer an admin flagged queues alongside
        // one a user complained about. Resolved ones sink, so the top of the
        // list is always the work that is left.
        const isDown = (i: (typeof items)[number]) =>
            i.feedback === 'down' || i.adminFeedback === 'down';
        const ratedAt = (i: (typeof items)[number]) =>
            Math.max(i.feedbackAt?.getTime() ?? 0, i.adminFeedbackAt?.getTime() ?? 0);
        const rank = (i: (typeof items)[number]) =>
            i.reviewStatus === 'resolved' ? 2 : isDown(i) ? 0 : 1;
        items.sort((a, b) => {
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            return ratedAt(b) - ratedAt(a);
        });

        return NextResponse.json({
            items,
            up: items.filter(i => i.feedback === 'up').length,
            down: items.filter(i => i.feedback === 'down').length,
            adminUp: items.filter(i => i.adminFeedback === 'up').length,
            adminDown: items.filter(i => i.adminFeedback === 'down').length,
            openDown: items.filter(i => isDown(i) && i.reviewStatus !== 'resolved').length,
            fetchedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to fetch feedback:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Rate or triage one answer, as an admin.
 *
 * Three separate things live on a message and none of them overwrites
 * another: the user's own thumb, an admin's thumb, and the review note. The
 * user's thumb says somebody was unhappy, the admin's says whether we agree,
 * and the note says why - by the time anyone looks, the conversation that
 * produced it is cold and the note is all that still explains it.
 *
 * Only an assistant answer can be rated. Rating a question would store a
 * verdict on something the product did not write.
 */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!isAdmin(email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const {
            messageId, reviewNote, reviewStatus,
            adminFeedback, adminFeedbackReason, adminFeedbackNote,
        } = await request.json();

        if (!messageId || typeof messageId !== 'string') {
            return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });
        }
        if (reviewStatus !== undefined && reviewStatus !== null && reviewStatus !== 'resolved') {
            return NextResponse.json({ error: 'reviewStatus must be "resolved" or null' }, { status: 400 });
        }
        if (adminFeedback !== undefined && adminFeedback !== null
            && adminFeedback !== 'up' && adminFeedback !== 'down') {
            return NextResponse.json({ error: 'adminFeedback must be "up", "down" or null' }, { status: 400 });
        }

        const reasonIds = siteConfig.text.feedback.reasons.map(r => r.id);
        if (adminFeedbackReason !== undefined && adminFeedbackReason !== null
            && !reasonIds.includes(adminFeedbackReason)) {
            return NextResponse.json({ error: 'Unknown adminFeedbackReason' }, { status: 400 });
        }

        const data: {
            reviewNote?: string | null; reviewStatus?: string | null; reviewedAt?: Date | null;
            adminFeedback?: string | null; adminFeedbackBy?: string | null; adminFeedbackAt?: Date | null;
            adminFeedbackReason?: string | null; adminFeedbackNote?: string | null;
        } = {};
        if (reviewNote !== undefined) data.reviewNote = reviewNote || null;
        if (reviewStatus !== undefined) {
            data.reviewStatus = reviewStatus;
            data.reviewedAt = reviewStatus ? new Date() : null;
        }
        if (adminFeedback !== undefined) {
            const target = await prisma.message.findUnique({
                where: { id: messageId },
                select: { role: true },
            });
            if (!target) {
                return NextResponse.json({ error: 'No such message' }, { status: 404 });
            }
            if (target.role !== 'assistant') {
                return NextResponse.json({ error: 'Only an assistant answer can be rated' }, { status: 400 });
            }
            data.adminFeedback = adminFeedback;
            // Cleared together, so a withdrawn rating leaves no stale author,
            // and no reason hanging off a thumb that is no longer there.
            data.adminFeedbackBy = adminFeedback ? email ?? null : null;
            data.adminFeedbackAt = adminFeedback ? new Date() : null;
            if (!adminFeedback) {
                data.adminFeedbackReason = null;
                data.adminFeedbackNote = null;
            }
        }
        // Settable on their own, so picking a reason later does not re-stamp
        // the rating's time or move it to whoever happened to add the detail.
        if (adminFeedbackReason !== undefined) data.adminFeedbackReason = adminFeedbackReason || null;
        if (adminFeedbackNote !== undefined) data.adminFeedbackNote = adminFeedbackNote || null;
        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
        }

        const updated = await prisma.message.update({
            where: { id: messageId },
            data,
            select: {
                id: true, reviewNote: true, reviewStatus: true, reviewedAt: true,
                adminFeedback: true, adminFeedbackBy: true, adminFeedbackAt: true,
                adminFeedbackReason: true, adminFeedbackNote: true,
            },
        });

        return NextResponse.json({ success: true, ...updated });
    } catch (error) {
        console.error('Failed to save review:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Take one answer out of the review queue entirely.
 *
 * This clears the feedback, not the answer: the message, the conversation and
 * the usage figures are untouched. What goes is everything anyone recorded
 * about it - the user's thumb and their words, an admin's thumb and theirs,
 * and the triage note.
 *
 * Withdrawing your own rating never needed this; clicking the thumb again
 * does that. This is for feedback that should not have been left at all - a
 * test click, a mis-click, a complaint already dealt with elsewhere - and
 * because it throws away somebody else's words, nothing here is recoverable
 * and the caller is expected to have asked first.
 */
export async function DELETE(request: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { messageId } = await request.json();
        if (!messageId || typeof messageId !== 'string') {
            return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });
        }

        const existing = await prisma.message.findUnique({
            where: { id: messageId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'No such message' }, { status: 404 });
        }

        await prisma.message.update({
            where: { id: messageId },
            data: {
                feedback: null,
                feedbackAt: null,
                feedbackReason: null,
                feedbackNote: null,
                adminFeedback: null,
                adminFeedbackBy: null,
                adminFeedbackAt: null,
                adminFeedbackReason: null,
                adminFeedbackNote: null,
                reviewNote: null,
                reviewStatus: null,
                reviewedAt: null,
            },
        });

        console.warn(`Feedback cleared on message ${messageId} by ${session?.user?.email}`);
        return NextResponse.json({ success: true, id: messageId });
    } catch (error) {
        console.error('Failed to delete feedback:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
