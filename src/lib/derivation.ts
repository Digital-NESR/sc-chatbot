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
    const lines = content.split('\n');
    let first = 0;
    while (first < lines.length && !lines[first].trim()) first++;

    const line = lines[first]?.trimStart() ?? '';
    if (!line.startsWith(ASKING_MARKER)) return { body: content, asking: [] };

    const named = line
        .slice(ASKING_MARKER.length)
        .split(',')
        .map(name => name.trim())
        .filter(Boolean);

    // A marker with nobody after it is worth less than no marker: it would
    // leave the progress line saying "Asking" and nothing else.
    if (!named.length) return { body: content, asking: [] };

    return { body: lines.slice(first + 1).join('\n').trimStart(), asking: named };
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
