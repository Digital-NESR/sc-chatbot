/**
 * Splitting "how I got this" off the end of an answer.
 *
 * The agents already explain their filters, inconsistently and in the middle
 * of the prose, where it either clutters the answer or gets skipped. Moving it
 * to a fixed place at the end lets the app collapse it: out of the way when
 * the answer looks right, one click away when it does not.
 *
 * It is the direct counter to the two failure modes that have actually bitten
 * here - a fabricated table and a false "there are none" - because both were
 * invisible to anyone reading the answer. A wrong filter is obvious the moment
 * it is written down.
 *
 * The marker is deliberately readable English rather than a comment or a
 * fenced block. If this parser ever fails to match, the reader sees a
 * perfectly sensible bold line at the end of the answer instead of losing the
 * information or seeing markup. Degrading into something useful is the whole
 * design.
 */

import { siteConfig } from '@/config/site';

/** What every agent is told to end its answer with. */
export const DERIVATION_MARKER = '**How I got this:**';

/**
 * Two or three questions the agent thinks are worth asking next.
 *
 * Same idea as the note above and the same failure mode if it goes wrong: a
 * marker that does not parse leaves a sensible bold line at the end of the
 * answer rather than markup or a hole.
 */
export const FOLLOW_UP_MARKER = '**Ask next:**';

/**
 * The line the orchestrator writes BEFORE it calls anyone.
 *
 * Measured: an orchestrated answer spends about forty seconds with nothing on
 * screen while the specialists run, and n8n emits nothing during it. This line
 * arrives at about 1.4 seconds, which makes it the only thing in existence
 * that can say who is being asked. The app shows it as the progress line and
 * takes it out of the answer, so by the time anyone reads the answer it is
 * gone.
 *
 *   **Asking:** Material AI, SourceGuide AI
 */
export const ASKING_MARKER = '**Asking:**';

/**
 * The marker as it actually arrives, bold or not.
 *
 * The prompt asks for `**Asking:**`. Sonnet writes that; Haiku writes a plain
 * `Asking:` about as often, and the orchestrator moved to Haiku for speed. A
 * marker that is not recognised is not merely a missed progress line - the
 * announcement lands in the answer bubble instead, which is worse than never
 * having asked for it.
 */
const ASKING_RE = /^\*{0,2}Asking:\*{0,2}/;

/** The complete forms, for deciding whether half a line is a marker arriving. */
const ASKING_FORMS = ['**Asking:**', 'Asking:'] as const;

/**
 * Who can appear after the marker.
 *
 * Taken from the agent list rather than written out, so a renamed specialist
 * cannot leave this behind - the orchestrator's prompt names the same four.
 * Longest first, so "SC Policy AI" is never matched as a prefix of a longer
 * name that happens to start the same way.
 */
const SPECIALIST_NAMES = siteConfig.agents
    .filter(a => a.id !== 'orchestrator')
    .map(a => a.name)
    .sort((a, b) => b.length - a.length);

/** Long enough and it stops being a chip and starts being a paragraph. */
const MAX_FOLLOW_UP = 90;

/** Three is the most that fits on one line without the answer losing the floor. */
const MAX_FOLLOW_UPS = 3;

/**
 * Lifts the "who am I about to ask" line off the front of an answer.
 *
 * Only ever the first non-empty line: the marker appearing later is the agent
 * talking about asking, not announcing it, and lifting that would cut a
 * sentence out of the middle of an answer.
 *
 * Runs on half an answer as happily as a whole one, because the streaming view
 * calls it on every commit - at 1.4 seconds the line IS the whole content, and
 * what it returns is an empty body, which is what keeps the progress line up
 * instead of showing a bubble with one bold line in it.
 */
export function splitAsking(content: string): { body: string; asking: string[] } {
    /* Repeatedly, because the orchestrator sometimes writes the line twice:
       `**Asking:** Track My Request**Asking:** Track My Request`. One pass
       strips the first and hands back the second as the opening line of the
       answer, where it renders as literal asterisks at the top of the bubble.
       Three passes is well past anything observed and still terminates. */
    let body = content;
    const asking: string[] = [];
    for (let pass = 0; pass < 3; pass++) {
        const step = splitAskingOnce(body);
        if (!step.asking.length) {
            // The marker is still arriving: nothing to show, whatever we found
            // on an earlier pass.
            if (step.body === '' && body !== '') return { body: '', asking };
            break;
        }
        body = step.body;
        for (const name of step.asking) if (!asking.includes(name)) asking.push(name);
    }
    return { body, asking };
}

function splitAskingOnce(content: string): { body: string; asking: string[] } {
    const lines = content.split('\n');
    let first = 0;
    while (first < lines.length && !lines[first].trim()) first++;

    const line = lines[first]?.trimStart() ?? '';

    /* The marker is still arriving. Half of it is not an answer, and showing
       it opens a bubble containing "**Asking" with a cursor after it, three
       seconds before there is anything to read. */
    if (line.length > 0 && lines.length === first + 1
        && ASKING_FORMS.some(form => form.startsWith(line))) {
        return { body: '', asking: [] };
    }

    const marker = line.match(ASKING_RE);
    if (!marker) return { body: content, asking: [] };

    /* Read the names off the front, from the set that exists, rather than
       splitting the rest of the line on commas.

       The orchestrator is told to put nothing else on this line and it does it
       anyway - every orchestrated answer in the database runs the answer
       straight on after the last name with no newline:

         **Asking:** Track My Request**There are 722 purchase orders (2,233 ...

       Splitting that on commas made three specialists out of the answer's own
       punctuation, and then took the headline sentence to be part of the line
       and dropped it. The reader lost the sentence that answered the question
       and never knew. Matching known names stops at the last real one and
       hands back everything after it as the answer. */
    let rest = line.slice(marker[0].length);
    const named: string[] = [];
    for (;;) {
        const ahead = rest.replace(/^[\s,]+/, '');
        const hit = SPECIALIST_NAMES.find(
            name => ahead.slice(0, name.length).toLowerCase() === name.toLowerCase(),
        );
        if (!hit) break;
        named.push(hit);
        rest = ahead.slice(hit.length);
    }

    // A marker with nobody after it is worth less than no marker: it would
    // leave the progress line saying "Asking" and nothing else.
    if (!named.length) return { body: content, asking: [] };

    /* Punctuation closing the announcement rather than opening the answer:
       Haiku writes "Asking: Track My Request." and the full stop belongs to
       the line being removed, not to the sentence that follows it. */
    const tail = rest.replace(/^[\s,.;:]+/, '');
    return {
        body: [tail, ...lines.slice(first + 1)].join('\n').trim(),
        asking: named,
    };
}

export interface SplitAnswer {
    /** The answer itself, with both notes and any separator before them removed. */
    body: string;
    /** The note, marker stripped. Null when the agent did not include one. */
    derivation: string | null;
    /** Suggested next questions, bullets stripped. Empty when there were none. */
    followUps: string[];
    /** Who the orchestrator said it was about to ask. Empty for a specialist. */
    asking: string[];
}

/**
 * Finds the marker at the start of a line, outside any fenced code block.
 *
 * The LAST one wins. The orchestrator relays specialist answers that carry
 * their own notes and is told to merge them into one at the very end, so the
 * final marker is the one that describes the whole answer. If it merges
 * imperfectly, an earlier note stays visible in the body as ordinary prose -
 * redundant rather than lost.
 */
function findMarkerLine(lines: string[], marker: string): number {
    let inFence = false;
    let found = -1;

    for (let i = 0; i < lines.length; i++) {
        if (/^\s*(```|~~~)/.test(lines[i])) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        if (lines[i].trimStart().startsWith(marker)) found = i;
    }
    return found;
}

/** Reads the lines under the marker as questions, one per bullet or line. */
function readFollowUps(lines: string[]): string[] {
    return lines
        .map(l => l.trim().replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
        .map(l => l.replace(/^["'`]|["'`]$/g, '').trim())
        // A line of asterisks or dashes is the separator before whatever comes
        // next, not a question.
        .filter(l => l.length > 0 && l.length <= MAX_FOLLOW_UP && !/^[-*_]{3,}$/.test(l))
        .slice(0, MAX_FOLLOW_UPS);
}

/**
 * Cuts an answer into the answer, the note, and the questions to ask next.
 *
 * Both tail sections are found independently and either order works. The
 * agents are told to put the note last, but one of them putting the questions
 * last instead should cost nothing - getting the order wrong is exactly the
 * kind of slip that should degrade into a working answer rather than into a
 * note with a list of questions buried in it.
 */
export function splitAnswer(content: string): SplitAnswer {
    const hasNote = content.includes(DERIVATION_MARKER);
    const hasNext = content.includes(FOLLOW_UP_MARKER);
    // splitAsking still has to run on an answer with no tail sections at all,
    // which is why the early return goes through it too.

    if (!hasNote && !hasNext) return { ...splitAsking(content), derivation: null, followUps: [] };

    const lines = content.split('\n');
    const noteAt = hasNote ? findMarkerLine(lines, DERIVATION_MARKER) : -1;
    const nextAt = hasNext ? findMarkerLine(lines, FOLLOW_UP_MARKER) : -1;

    /* Each section runs to the start of the other one, or to the end of the
       answer when it is the last of the two. */
    const sectionEnd = (at: number, other: number) =>
        other > at ? other : lines.length;

    const section = (at: number, other: number, marker: string) => {
        if (at === -1) return null;
        const own = lines.slice(at, sectionEnd(at, other));
        own[0] = own[0].trimStart().slice(marker.length).trimStart();
        return own;
    };

    const noteLines = section(noteAt, nextAt, DERIVATION_MARKER);
    const nextLines = section(nextAt, noteAt, FOLLOW_UP_MARKER);

    // A marker with nothing after it says less than no marker at all.
    const derivation = noteLines?.join('\n').trim() || null;
    const followUps = nextLines ? readFollowUps(nextLines) : [];

    /* Both markers turned out to be inside a fenced block, where they are
       sample text rather than a section of this answer. Nothing to cut. */
    const starts = [noteAt, nextAt].filter(i => i !== -1);
    if (!starts.length) return { ...splitAsking(content), derivation: null, followUps: [] };

    let end = Math.min(...starts);

    // Drop the horizontal rule the agents are told to put above the note, plus
    // the blank lines around it, so the answer does not end on a stray divider.
    while (end > 0 && lines[end - 1].trim() === '') end--;
    if (end > 0 && /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[end - 1])) {
        end--;
        while (end > 0 && lines[end - 1].trim() === '') end--;
    }

    // Nothing usable behind either marker: leave the answer exactly as it came.
    if (!derivation && !followUps.length) return { ...splitAsking(content), derivation: null, followUps: [] };

    const { body, asking } = splitAsking(lines.slice(0, end).join('\n').trimEnd());
    return { body, asking, derivation, followUps };
}
