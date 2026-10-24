import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * Every failure behind the "chatbot is busy" line, newest first.
 *
 * Grouped as well as listed: one dead webhook produces fifty identical rows,
 * and fifty rows of the same thing reads as fifty problems. The count is what
 * says how bad it is; the stage and message are what say what it is.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const rows = await prisma.errorLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 300,
        });

        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

        // Same stage and same message is the same problem, however many users
        // walked into it.
        const groups = new Map<string, { stage: string; message: string; count: number; last: Date; botIds: Set<string> }>();
        for (const r of rows) {
            const key = `${r.stage}::${r.message}`;
            const g = groups.get(key) ?? { stage: r.stage, message: r.message, count: 0, last: r.createdAt, botIds: new Set<string>() };
            g.count += 1;
            if (r.createdAt > g.last) g.last = r.createdAt;
            if (r.botId) g.botIds.add(r.botId);
            groups.set(key, g);
        }

        return NextResponse.json({
            items: rows,
            open: rows.filter(r => r.reviewStatus !== 'resolved').length,
            last24h: rows.filter(r => r.createdAt.getTime() > dayAgo).length,
            groups: [...groups.values()]
                .map(g => ({ ...g, botIds: [...g.botIds], last: g.last }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8),
            fetchedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to fetch errors:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/** Triage, exactly as for a rated answer. */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { errorId, reviewNote, reviewStatus } = await request.json();

        if (!errorId || typeof errorId !== 'string') {
            return NextResponse.json({ error: 'Missing errorId' }, { status: 400 });
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

        const updated = await prisma.errorLog.update({
            where: { id: errorId },
            data,
            select: { id: true, reviewNote: true, reviewStatus: true, reviewedAt: true },
        });

        return NextResponse.json({ success: true, ...updated });
    } catch (error) {
        console.error('Failed to save review:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
