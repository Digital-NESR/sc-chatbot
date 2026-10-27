import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';
import { RULES, DEFAULT_ACTIONS, type RuleAction } from '@/lib/guardrails/rules';

export const dynamic = 'force-dynamic';

const ACTIONS: readonly RuleAction[] = ['off', 'shadow', 'enforce'];
const STATS_WINDOW_DAYS = 7;

/**
 * Every rule, what it is set to, and how it has behaved.
 *
 * The same "defaults in code, overrides in a sparse table" shape as display
 * names: a row exists only where somebody moved a rule off what it ships with,
 * so a new rule needs no migration and restoring a default is a delete.
 *
 * The counts are the point. Deciding whether to enforce a rule from its
 * description is guesswork; deciding from "fired 40 times last week, 38 of
 * them wrong" is not. That is why they are served beside the setting rather
 * than on a different page.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const since = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const [overrides, hits, falsePositives] = await Promise.all([
            prisma.guardrailRule.findMany({ select: { id: true, action: true, updatedBy: true } }),
            prisma.guardrailEvent.groupBy({
                by: ['ruleId'],
                where: { createdAt: { gte: since } },
                _count: { _all: true },
            }),
            prisma.guardrailEvent.groupBy({
                by: ['ruleId'],
                where: { createdAt: { gte: since }, falsePositive: true },
                _count: { _all: true },
            }),
        ]);

        const stored = new Map(overrides.map(o => [o.id, o]));
        const hitCount = new Map(hits.map(h => [h.ruleId, h._count._all]));
        const fpCount = new Map(falsePositives.map(h => [h.ruleId, h._count._all]));

        const items = RULES.map(r => {
            const override = stored.get(r.id);
            return {
                id: r.id,
                label: r.label,
                hint: r.hint,
                group: r.group,
                surface: r.surface,
                severity: r.severity,
                defaultAction: r.defaultAction,
                action: (override?.action as RuleAction | undefined) ?? r.defaultAction,
                isDefault: !override,
                updatedBy: override?.updatedBy ?? null,
                hits: hitCount.get(r.id) ?? 0,
                falsePositives: fpCount.get(r.id) ?? 0,
            };
        });

        return NextResponse.json({
            items,
            windowDays: STATS_WINDOW_DAYS,
            changed: overrides.length,
            total: RULES.length,
            enforcing: items.filter(i => i.action === 'enforce').length,
            fetchedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to fetch guardrail rules:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Change what one rule does.
 *
 * Setting a rule back to its default DELETES the row rather than storing the
 * default value, so that a later change to a default reaches everyone who
 * never touched it. Same reasoning as the display-name editor, and the
 * response carries isDefault so the client can mirror the decision instead of
 * guessing at it.
 */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { id, action } = await request.json();

        if (typeof id !== 'string' || !(id in DEFAULT_ACTIONS)) {
            return NextResponse.json({ error: 'Unknown rule' }, { status: 400 });
        }
        if (!ACTIONS.includes(action)) {
            return NextResponse.json(
                { error: 'action must be "off", "shadow" or "enforce"' },
                { status: 400 },
            );
        }

        if (action === DEFAULT_ACTIONS[id]) {
            await prisma.guardrailRule.deleteMany({ where: { id } });
            return NextResponse.json({ success: true, id, action, isDefault: true });
        }

        await prisma.guardrailRule.upsert({
            where: { id },
            update: { action, updatedBy: session?.user?.email ?? null },
            create: { id, action, updatedBy: session?.user?.email ?? null },
        });

        // Worth a server-side line: this is the one setting here that can stop
        // a real question reaching an agent.
        if (action === 'enforce') {
            console.warn(`[guardrails] ${id} set to ENFORCE by ${session?.user?.email}`);
        }

        return NextResponse.json({ success: true, id, action, isDefault: false });
    } catch (error) {
        console.error('Failed to save guardrail rule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
