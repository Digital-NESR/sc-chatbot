/**
 * Writing a guardrail event, and never failing because of it.
 *
 * Same contract as logError.ts, for the same reason: this is called from the
 * request path, and a logging failure must never become an answer failure.
 * Worst case here is a console line and a missing row.
 *
 * It also loads the stored rule actions, because the engine is module state
 * and something has to put the admin's edits into it before the first request
 * uses them.
 */

import { prisma } from '@/lib/prisma';
import { setRuleActions } from '@/lib/guardrails/evaluate';
import { RULE_IDS } from '@/lib/guardrails/rules';
import type { RuleMatch } from '@/lib/guardrails/evaluate';
import type { RuleAction } from '@/lib/guardrails/rules';

const MAX_EXCERPT = 2000;
const MAX_QUESTION = 2000;

function clip(value: string | null | undefined, max: number): string | null {
    if (!value) return null;
    const s = String(value);
    return s.length <= max ? s : `${s.slice(0, max)}… [${s.length} chars]`;
}

export interface GuardrailEventInput {
    userEmail?: string | null;
    sessionId?: string | null;
    botId?: string | null;
    surface: 'input' | 'output' | 'sql';
    verdict: 'flag' | 'block';
    /** True only when the request was actually stopped. */
    enforced: boolean;
    question?: string | null;
    matches: RuleMatch[];
}

/**
 * One row per rule that matched, not one per message.
 *
 * Two rules firing on one question are two different things to judge, and
 * marking one a false positive should not quietly absolve the other.
 */
export async function logGuardrailEvents(input: GuardrailEventInput): Promise<void> {
    if (!input.matches.length) return;

    try {
        await prisma.guardrailEvent.createMany({
            data: input.matches.map(m => ({
                userEmail: clip(input.userEmail, 320),
                sessionId: clip(input.sessionId, 64),
                botId: clip(input.botId, 64),
                surface: input.surface,
                ruleId: m.ruleId,
                severity: m.severity,
                verdict: input.verdict,
                // Per rule: only the rule that is enforcing stopped anything.
                enforced: input.enforced && m.action === 'enforce',
                excerpt: clip(m.excerpt, MAX_EXCERPT),
                question: clip(input.question, MAX_QUESTION),
            })),
        });
    } catch (error) {
        console.error('[guardrails] could not record events:', error);
    }
}

/**
 * Puts the stored rule actions into the engine.
 *
 * Called at the top of the chat route. Cheap enough to do per request - one
 * indexed read of a table with at most a couple of dozen rows - and doing it
 * per request is what makes a change in the console take effect on the next
 * answer rather than on the next deploy.
 *
 * A failure here leaves the defaults in place, which is shadow mode, which is
 * the safe direction to fail in.
 */
export async function loadRuleActions(): Promise<void> {
    try {
        const rows = await prisma.guardrailRule.findMany({
            select: { id: true, action: true },
        });
        const overrides: Record<string, RuleAction> = {};
        for (const row of rows) {
            if (!RULE_IDS.includes(row.id)) continue;
            if (row.action === 'off' || row.action === 'shadow' || row.action === 'enforce') {
                overrides[row.id] = row.action;
            }
        }
        setRuleActions(overrides);
    } catch (error) {
        console.error('[guardrails] could not load rule actions, defaults stand:', error);
    }
}
