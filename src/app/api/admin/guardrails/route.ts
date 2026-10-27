import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';
import { RULES_BY_ID } from '@/lib/guardrails/rules';

export const dynamic = 'force-dynamic';

/**
 * Every guardrail that fired, newest first.
 *
 * Shaped like /api/admin/errors on purpose - the same list, clusters and
 * counts, so the tab that reads it can be the Errors tab with different words.
 * The counts are computed here rather than in the client because the badge
 * wants one number and should not have to fetch three hundred rows for it.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const rows = await prisma.guardrailEvent.findMany({
            orderBy: { createdAt: 'desc' },
            take: 300,
        });

        const items = rows.map(r => ({
            id: r.id,
            createdAt: r.createdAt,
            userEmail: r.userEmail,
            sessionId: r.sessionId,
            botId: r.botId,
            surface: r.surface,
            ruleId: r.ruleId,
            // The label lives in code, not in the row: renaming a rule should
            // not need a migration, and an old row should show the new name.
            ruleLabel: RULES_BY_ID[r.ruleId]?.label ?? r.ruleId,
            severity: r.severity,
            verdict: r.verdict,
            enforced: r.enforced,
            backfilled: r.backfilled,
            excerpt: r.excerpt,
            question: r.question,
            falsePositive: r.falsePositive,
            reviewNote: r.reviewNote,
            reviewStatus: r.reviewStatus,
            reviewedAt: r.reviewedAt,
        }));

        // What fired most, so a rule misbehaving is visible without reading
        // three hundred rows one at a time.
        const byRule = new Map<string, { ruleId: string; label: string; count: number; falsePositives: number }>();
        for (const i of items) {
            const e = byRule.get(i.ruleId) ?? {
                ruleId: i.ruleId,
                label: i.ruleLabel,
                count: 0,
                falsePositives: 0,
            };
            e.count += 1;
            if (i.falsePositive) e.falsePositives += 1;
            byRule.set(i.ruleId, e);
        }
        const groups = [...byRule.values()].sort((a, b) => b.count - a.count).slice(0, 8);

        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

        return NextResponse.json({
            items,
            groups,
            open: items.filter(i => i.reviewStatus !== 'resolved' && !i.falsePositive).length,
            blocked: items.filter(i => i.enforced).length,
            last24h: items.filter(i => i.createdAt.getTime() >= dayAgo).length,
            fetchedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to fetch guardrail events:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Triage one event.
 *
 * falsePositive is the load-bearing field: it is what decides whether a rule
 * is ready to enforce, so it is a column rather than a phrase inside the note.
 * Marking one also marks it resolved - a match that should not have happened
 * is not work left to do.
 */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { eventId, reviewNote, reviewStatus, falsePositive } = await request.json();

        if (!eventId || typeof eventId !== 'string') {
            return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
        }
        if (reviewStatus !== undefined && reviewStatus !== null && reviewStatus !== 'resolved') {
            return NextResponse.json({ error: 'reviewStatus must be "resolved" or null' }, { status: 400 });
        }
        if (falsePositive !== undefined && falsePositive !== null && typeof falsePositive !== 'boolean') {
            return NextResponse.json({ error: 'falsePositive must be true, false or null' }, { status: 400 });
        }

        const data: {
            reviewNote?: string | null;
            reviewStatus?: string | null;
            reviewedAt?: Date | null;
            falsePositive?: boolean | null;
        } = {};

        if (reviewNote !== undefined) data.reviewNote = reviewNote || null;
        if (reviewStatus !== undefined) {
            data.reviewStatus = reviewStatus;
            data.reviewedAt = reviewStatus ? new Date() : null;
        }
        if (falsePositive !== undefined) {
            data.falsePositive = falsePositive;
            if (falsePositive === true && reviewStatus === undefined) {
                data.reviewStatus = 'resolved';
                data.reviewedAt = new Date();
            }
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
        }

        const updated = await prisma.guardrailEvent.update({
            where: { id: eventId },
            data,
            select: {
                id: true,
                reviewNote: true,
                reviewStatus: true,
                reviewedAt: true,
                falsePositive: true,
            },
        });

        return NextResponse.json({ success: true, ...updated });
    } catch (error) {
        console.error('Failed to save guardrail triage:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
