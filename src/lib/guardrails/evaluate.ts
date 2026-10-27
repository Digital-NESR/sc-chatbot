/**
 * Running the rules, and deciding what the verdict means.
 *
 * The action in force per rule is module state layered over the defaults in
 * rules.ts - the same shape as src/config/dataNames.ts, for the same reason:
 * the thing that needs it is a plain function called from inside a request
 * handler, and threading a provider through to change four words would be a
 * worse trade than one mutable map kept beside the function that reads it.
 */

import {
    RULES,
    DEFAULT_ACTIONS,
    type GuardrailRule,
    type RuleAction,
    type RuleSurface,
} from './rules';

export interface RuleMatch {
    ruleId: string;
    label: string;
    severity: GuardrailRule['severity'];
    /** The action in force when this ran - not the rule's default. */
    action: RuleAction;
    excerpt: string;
}

export interface Verdict {
    /** 'block' only when a matching rule is actually enforcing. */
    verdict: 'allow' | 'flag' | 'block';
    matches: RuleMatch[];
}

let active: Record<string, RuleAction> = { ...DEFAULT_ACTIONS };

/** Lays the stored actions over the defaults. Called once, on load. */
export function setRuleActions(overrides: Record<string, RuleAction>): void {
    active = { ...DEFAULT_ACTIONS, ...overrides };
}

/** What a rule will do right now. Unknown ids fall back to off, not on. */
export function actionFor(ruleId: string): RuleAction {
    return active[ruleId] ?? 'off';
}

export function currentActions(): Readonly<Record<string, RuleAction>> {
    return active;
}

/**
 * Runs every rule for one surface.
 *
 * A rule that throws is treated as not matching. A regex that blows up on one
 * odd input must not take an answer down with it - the guardrails are there to
 * make the product safer, and a guardrail that can fail the request is a new
 * way for the product to break.
 */
export function evaluate(surface: RuleSurface, text: string): Verdict {
    if (!text) return { verdict: 'allow', matches: [] };

    const matches: RuleMatch[] = [];

    for (const rule of RULES) {
        if (rule.surface !== surface) continue;
        const action = actionFor(rule.id);
        if (action === 'off') continue;

        let excerpt: string | null = null;
        try {
            excerpt = rule.test(text);
        } catch (err) {
            console.error(`[guardrails] rule ${rule.id} threw`, err);
            continue;
        }
        if (!excerpt) continue;

        matches.push({
            ruleId: rule.id,
            label: rule.label,
            severity: rule.severity,
            action,
            excerpt,
        });
    }

    if (!matches.length) return { verdict: 'allow', matches: [] };

    const enforcing = matches.some(m => m.action === 'enforce');
    return { verdict: enforcing ? 'block' : 'flag', matches };
}
