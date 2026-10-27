/**
 * What the guardrails look for.
 *
 * Every rule here is a pure function over a string. No network, no database,
 * no React - so the whole set can be run over the real `Message` table offline
 * to measure how often it would fire on honest traffic, which is the only
 * number that decides whether a rule is fit to enforce.
 *
 * Two things this file is deliberately NOT:
 *
 * It is not an XSS defence. Nothing in this app renders raw HTML - there is no
 * `dangerouslySetInnerHTML` anywhere in src/, `rehype-raw` is not installed, and
 * react-markdown's default urlTransform already neutralises `javascript:` and
 * `data:` hrefs at every call site. A rule that re-checked that would be
 * theatre. Where markup appears below it is as a SIGNAL that something upstream
 * is trying an injection, not as a thing being made safe.
 *
 * It is not a model. Heuristics catch the phrasings people actually type and
 * the shapes an injected SAP field actually takes; they do not catch a
 * determined attacker who rephrases. The classifier in Phase 2 is the answer to
 * that, and it runs only on messages a rule here has already flagged.
 */

/** What a rule does when it matches. Stored per rule, overridable from /admin. */
export type RuleAction = 'off' | 'shadow' | 'enforce';

export type RuleSurface = 'input' | 'output';

export type RuleSeverity = 'low' | 'medium' | 'high';

export interface GuardrailRule {
    id: string;
    label: string;
    /** Shown in the console under the rule, in plain words. */
    hint: string;
    surface: RuleSurface;
    severity: RuleSeverity;
    /** Grouping in the console only. */
    group: string;
    /**
     * Ships as 'shadow' for every rule.
     *
     * Not caution for its own sake: nobody has yet seen how often any of these
     * fire on real NESR questions, and a guardrail that refuses a buyer mid-task
     * is worse than no guardrail, because it teaches people the product is
     * unreliable. Promote from the console once the false-positive count says it
     * is safe.
     */
    defaultAction: RuleAction;
    /**
     * Not a regex. A rule marked this way is judged somewhere else - the
     * classifier is an LLM behind a webhook and cannot be a pure function -
     * so evaluate() skips it and the caller runs it itself. It still lives in
     * this list because it should be visible and settable in exactly the same
     * place as everything else; being implemented differently is not a reason
     * to be configured differently.
     */
    model?: boolean;
    /** The matched span, or null. Keep it short - it is stored. */
    test(text: string): string | null;
}

/** First capture group, or the whole match, trimmed and clipped. */
function hit(re: RegExp, text: string, span = 120): string | null {
    const m = text.match(re);
    if (!m) return null;
    return (m[0] ?? '').trim().slice(0, span) || null;
}

/* Whose addresses are personal data here.
   A supplier's address is a business contact and the AVL exists to hand it
   out; a colleague's, in bulk, is a staff list falling out of an approval
   queue. Counting both made the rule fire on 3% of all answers for doing
   exactly what it was asked. */
const INTERNAL_DOMAIN = 'nesr.com';

/* Allowed link destinations in an answer. An agent has no business linking
   anywhere else, and a link into an answer is how a poisoned SAP field would
   try to move a reader somewhere. */
const LINK_ALLOWLIST = [
    'nesr.com',
    'shipwaves.com',
    'app.powerbi.com',
    'sharepoint.com',
    'microsoft.com',
    'office.com',
];

/* Distinctive lines from the agents' own system prompts. If one of these comes
   back inside an answer, the prompt is being echoed rather than followed. They
   are chosen to be phrases no ordinary answer would contain. */
const PROMPT_FINGERPRINTS = [
    'You are the NESR Supply Chain AI orchestrator',
    'NEVER INVENT ROWS',
    'EVERY CELL IN EVERY TABLE YOU PRINT',
    'SET TRANSACTION READ ONLY',
    '$fromAI',
    'query_track_db',
    'query_materials_db',
    'query_sourceguide_db',
    'ask_material_ai',
    'ask_track_my_request',
    'You must NOT query',
    'Hard rules',
];

export const RULES: readonly GuardrailRule[] = [
    /* ── What someone typed ─────────────────────────────────────────────── */
    {
        id: 'instruction-override',
        label: 'Told to ignore its instructions',
        hint: '"ignore previous instructions", "forget your rules", "disregard the above".',
        surface: 'input',
        severity: 'high',
        group: 'Direct injection',
        defaultAction: 'shadow',
        test: t => hit(
            /\b(ignore|disregard|forget|override|bypass|skip)\b[^.\n]{0,40}\b(previous|prior|above|earlier|initial|original|all|any|your)\b[^.\n]{0,30}\b(instruction|rule|prompt|direction|guideline|restriction|constraint)/i,
            t,
        ),
    },
    {
        id: 'prompt-extraction',
        label: 'Asked for its own prompt',
        hint: 'Asking the agent to print, repeat or summarise its system prompt or rules.',
        surface: 'input',
        severity: 'high',
        group: 'Direct injection',
        defaultAction: 'shadow',
        test: t => hit(
            /\b(show|print|repeat|reveal|output|display|tell me|what (is|are))\b[^.\n]{0,40}\b(your |the )?(system )?(prompt|instructions|rules|configuration|directive)\b|\brepeat everything (above|before)\b|\bverbatim\b[^.\n]{0,30}\b(prompt|instruction)/i,
            t,
        ),
    },
    {
        id: 'role-reassignment',
        label: 'Told to be something else',
        hint: '"you are now", "pretend to be", "act as", "developer mode". A buyer asking a supply chain question never needs this.',
        surface: 'input',
        severity: 'medium',
        group: 'Direct injection',
        defaultAction: 'shadow',
        test: t => hit(
            /\byou are (now|no longer)\b|\b(pretend|roleplay|role-play) (to be|as|that you)\b|\bact as (an?|the) \w+\b|\bdeveloper mode\b|\bjailbreak\b|\bDAN mode\b|\bfrom now on,? you\b/i,
            t,
        ),
    },
    {
        id: 'fake-system-turn',
        label: 'Forged system message',
        hint: 'Text shaped like a system or assistant turn - <system>, [INST], <|im_start|>, "SYSTEM:" - trying to look like part of the conversation rather than content in it.',
        surface: 'input',
        severity: 'high',
        group: 'Direct injection',
        defaultAction: 'shadow',
        test: t => hit(
            /<\|?(im_start|im_end|system|assistant)\|?>|\[\/?INST\]|\[\/?SYS\]|^\s*(system|assistant)\s*:/im,
            t,
        ),
    },
    {
        id: 'encoded-payload',
        label: 'Encoded block',
        hint: 'A long run of base64, or a pile of unicode escapes. Legitimate questions are written in words.',
        surface: 'input',
        severity: 'medium',
        group: 'Direct injection',
        defaultAction: 'shadow',
        test: t =>
            hit(/\b[A-Za-z0-9+/]{60,}={0,2}\b/, t, 60) ??
            (((t.match(/\\u[0-9a-fA-F]{4}/g) ?? []).length >= 8)
                ? hit(/(\\u[0-9a-fA-F]{4}){8,}/, t, 60)
                : null),
    },
    {
        id: 'sql-in-question',
        label: 'SQL written into the question',
        hint: 'A statement rather than a question. The SQL guard in n8n refuses what matters; this records that someone tried.',
        surface: 'input',
        severity: 'medium',
        group: 'Data access',
        defaultAction: 'shadow',
        test: t => hit(
            /\b(drop\s+table|delete\s+from|insert\s+into|update\s+\w+\s+set|truncate\s+table|union\s+select|alter\s+table|grant\s+(all|select)|pg_read_file|dblink)\b/i,
            t,
        ),
    },
    {
        id: 'exfiltration-request',
        label: 'Asked to send data somewhere',
        hint: 'Combining data with an outbound destination - post it to a URL, email it, put it in a webhook. No agent here can do it, and asking is a signal.',
        surface: 'input',
        severity: 'high',
        group: 'Data access',
        defaultAction: 'shadow',
        test: t => hit(
            /\b(send|post|upload|email|exfiltrate|forward|transmit|leak)\b[^.\n]{0,50}\b(to|at)\b[^.\n]{0,20}(https?:\/\/|www\.|[\w.-]+@[\w.-]+\.\w+)/i,
            t,
        ),
    },
    {
        id: 'repetition-flood',
        label: 'One line repeated to fill the message',
        hint: 'The same line over and over, making up most of the message - a way of pushing earlier instructions out of a model\'s attention. Requires it to DOMINATE: people legitimately paste hundreds of PO and material numbers, and some of those lists contain duplicates.',
        surface: 'input',
        severity: 'low',
        group: 'Direct injection',
        defaultAction: 'shadow',
        test: t => {
            const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 20) return null;
            const counts = new Map<string, number>();
            for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
            for (const [line, n] of counts) {
                // Both tests matter. A pasted list of 400 identifiers can repeat
                // one of them 25 times and mean nothing by it; a flood is one
                // line BEING the message.
                if (n >= 20 && n / lines.length >= 0.5) {
                    return `${n} of ${lines.length} lines are "${line.slice(0, 50)}"`;
                }
            }
            return null;
        },
    },

    /* ── What came back ─────────────────────────────────────────────────── */
    {
        id: 'prompt-leak',
        label: 'Answer contains its own instructions',
        hint: 'A distinctive line from an agent\'s system prompt appearing in an answer. Means the prompt is being repeated rather than followed.',
        surface: 'output',
        severity: 'high',
        group: 'Leakage',
        defaultAction: 'shadow',
        test: t => {
            for (const f of PROMPT_FINGERPRINTS) {
                if (t.includes(f)) return f;
            }
            return null;
        },
    },
    {
        id: 'credential-shape',
        label: 'Answer contains something that looks like a secret',
        hint: 'An API key, a bearer token or a database connection string in an answer. Never legitimate.',
        surface: 'output',
        severity: 'high',
        group: 'Leakage',
        defaultAction: 'shadow',
        test: t => hit(
            /\bsk-ant-[\w-]{8,}|\bBearer\s+ey[\w.-]{10,}|\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s"'<]{8,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/,
            t,
            40,
        ),
    },
    {
        id: 'bulk-email',
        label: 'Several colleagues\' email addresses',
        hint: `Four or more distinct @${INTERNAL_DOMAIN} addresses in one answer. Supplier addresses are not counted: listing those is SourceGuide's job, and counting them flagged 3% of all answers for doing it correctly. Internal addresses in bulk are a different thing - that is a staff directory coming out of an approval queue.`,
        surface: 'output',
        severity: 'medium',
        group: 'Personal data',
        defaultAction: 'shadow',
        test: t => {
            const found = t.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? [];
            const internal = [...new Set(
                found.map(e => e.toLowerCase()).filter(e => e.endsWith(`@${INTERNAL_DOMAIN}`)),
            )];
            return internal.length >= 4
                ? `${internal.length} internal addresses, e.g. ${internal[0]}`
                : null;
        },
    },
    {
        id: 'offsite-link',
        label: 'Link to somewhere unexpected',
        hint: `A markdown link whose host is not one of: ${LINK_ALLOWLIST.join(', ')}. The likely source is a poisoned free-text field in SAP.`,
        surface: 'output',
        severity: 'medium',
        group: 'Injected content',
        defaultAction: 'shadow',
        test: t => {
            const links = t.match(/\]\(\s*(https?:\/\/[^\s)]+)/gi) ?? [];
            for (const raw of links) {
                const url = raw.replace(/^\]\(\s*/, '');
                let host = '';
                try {
                    host = new URL(url).hostname.toLowerCase();
                } catch {
                    return url.slice(0, 80);
                }
                if (!LINK_ALLOWLIST.some(d => host === d || host.endsWith(`.${d}`))) {
                    return url.slice(0, 80);
                }
            }
            return null;
        },
    },
    {
        id: 'markup-in-answer',
        label: 'Script or iframe markup in the answer',
        hint: 'It cannot render - nothing here parses raw HTML - but an SAP description containing a <script> tag is someone having tried, and that is worth knowing.',
        surface: 'output',
        severity: 'medium',
        group: 'Injected content',
        defaultAction: 'shadow',
        test: t => hit(/<\s*(script|iframe|object|embed|form)\b[^>]{0,60}>|javascript\s*:/i, t, 80),
    },
    {
        id: 'injected-instruction',
        label: 'Instruction text inside the data',
        hint: 'An answer repeating a phrase like "ignore previous instructions" - which, in an answer, usually means it was read out of a material description or a supplier name.',
        surface: 'output',
        severity: 'high',
        group: 'Injected content',
        defaultAction: 'shadow',
        test: t => hit(
            /\b(ignore|disregard)\b[^.\n]{0,30}\b(previous|prior|above)\b[^.\n]{0,20}\b(instruction|prompt)|<\|?im_start\|?>|\bnew instructions?:\s/i,
            t,
        ),
    },

    /* ── Judged by a model, not a pattern ───────────────────────────────── */
    {
        id: 'classifier',
        label: 'Second opinion from a model',
        hint: 'Runs ONLY on a message another rule has already flagged, and only while this is not Off. Claude Haiku 5.5 reads it and says whether it is really an attempt to redirect the assistant - which is how a flagged-but-ordinary question gets cleared. Roughly a tenth of a cent each, on about one message in two thousand.',
        surface: 'input',
        severity: 'high',
        group: 'Second opinion',
        /* The only rule that ships Off rather than Watch, because it is the
           only one that costs money and adds a second of latency when it
           runs. Everything else is free to leave watching. */
        defaultAction: 'off',
        model: true,
        test: () => null,
    },
] as const;

/** Every rule id, for validating what the console sends back. */
export const RULE_IDS: readonly string[] = RULES.map(r => r.id);

export const RULES_BY_ID: Readonly<Record<string, GuardrailRule>> = Object.fromEntries(
    RULES.map(r => [r.id, r]),
);

/** Defaults, flattened. The stored overrides are layered over this. */
export const DEFAULT_ACTIONS: Readonly<Record<string, RuleAction>> = Object.fromEntries(
    RULES.map(r => [r.id, r.defaultAction]),
);
