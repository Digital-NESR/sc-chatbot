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

export interface SplitAnswer {
    /** The answer itself, with the note and any separator before it removed. */
    body: string;
    /** The note, marker stripped. Null when the agent did not include one. */
    derivation: string | null;
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
function findMarkerLine(lines: string[]): number {
    let inFence = false;
    let found = -1;

    for (let i = 0; i < lines.length; i++) {
        if (/^\s*(```|~~~)/.test(lines[i])) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        if (lines[i].trimStart().startsWith(DERIVATION_MARKER)) found = i;
    }
    return found;
}

export function splitDerivation(content: string): SplitAnswer {
    if (!content.includes(DERIVATION_MARKER)) return { body: content, derivation: null };

    const lines = content.split('\n');
    const at = findMarkerLine(lines);
    if (at === -1) return { body: content, derivation: null };

    const noteLines = lines.slice(at);
    noteLines[0] = noteLines[0].trimStart().slice(DERIVATION_MARKER.length).trimStart();
    const derivation = noteLines.join('\n').trim();

    // A marker with nothing after it says less than no marker at all.
    if (!derivation) return { body: content, derivation: null };

    // Drop the horizontal rule the agents are told to put above the note, plus
    // the blank lines around it, so the answer does not end on a stray divider.
    let end = at;
    while (end > 0 && lines[end - 1].trim() === '') end--;
    if (end > 0 && /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[end - 1])) {
        end--;
        while (end > 0 && lines[end - 1].trim() === '') end--;
    }

    return { body: lines.slice(0, end).join('\n').trimEnd(), derivation };
}
