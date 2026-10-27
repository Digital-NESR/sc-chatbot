/**
 * The wire format between /api/chat and the browser.
 *
 * NDJSON, one object per line. The point of it is that a buffered agent and a
 * streaming one look the same to the client: a workflow that still answers in
 * one go becomes a single `delta` followed by `done`, and a converted one
 * becomes many deltas. So agents can be migrated one at a time in n8n without
 * shipping any app code, and the client has one path to get right instead of
 * two.
 *
 * Deliberately not Server-Sent Events. SSE would mean an EventSource or a
 * hand-rolled `data:` parser for no gain - we are not reconnecting, not
 * resuming from an id, and already POSTing a body, which EventSource cannot do.
 */

export type ChatEvent =
    /** A piece of the answer. Append it; never replace. */
    | { t: 'delta'; v: string }
    /**
     * Nothing to say yet, still alive.
     *
     * This matters more here than it looks. The orchestrator spends its first
     * thirty to ninety seconds calling specialists, and n8n sends nothing at
     * all during that time - the stream only starts when the synthesis starts.
     * Without a heartbeat that silence is indistinguishable from a dead
     * connection, to intermediaries as well as to us.
     */
    | { t: 'ping' }
    /**
     * Where the agent has got to, before any of the answer exists.
     *
     * Measured on a real orchestrated question: 0.3s to 3.2s producing tool
     * calls, then 59 SECONDS of silence while the specialists work, then the
     * answer. Four fifths of the wait is that gap, and n8n says nothing during
     * it beyond a keepalive every thirty seconds - no tool node announces
     * itself, so there is nothing to report but the shape of the silence.
     *
     * That shape is still worth reporting. "Asking the specialists, 23s" is a
     * different experience from a word that changes every three seconds and
     * means nothing.
     */
    | { t: 'step'; phase: ChatPhase }
    /** The answer finished normally. */
    | { t: 'done' }
    /** It did not. Terminal; nothing follows. */
    | { t: 'error'; message: string; status?: number; kind?: ChatFailure };

/**
 * Which kind of failure it was, for the one line the user reads.
 *
 * `message` on an error event is the real cause and goes to the failure log;
 * it is written by whatever broke and can say anything, including things no
 * user should be shown. This says only enough for the app to choose its own
 * words - and, more usefully, to know whether trying again is worth the click.
 *
 * - `refused`     the agent was turned away by something upstream of it: a
 *                 usage limit, a key, a safety stop. Retrying does not help
 *                 until somebody changes something.
 * - `timeout`     it ran past the deadline. A narrower question often works.
 * - `unreachable` nothing answered. Usually transient.
 * - `empty`       it answered, with nothing in it.
 * - `dropped`     the connection died partway through.
 */
/**
 * - `thinking`   the agent is working out what to do. It produces tool calls,
 *                which arrive as items with no content.
 * - `consulting` it has stopped producing anything and has not written a word.
 *                On the orchestrator this is the specialists running; on a
 *                specialist it is a database query.
 * - `writing`    it has started again, and text is about to arrive.
 */
export type ChatPhase = 'thinking' | 'consulting' | 'writing';

export type ChatFailure =
    | 'refused' | 'timeout' | 'unreachable' | 'empty' | 'dropped'
    | 'guardrail' | 'rateLimited';

/** Failures where another identical attempt is a reasonable thing to offer. */
export const RETRYABLE: ReadonlySet<ChatFailure> = new Set<ChatFailure>([
    'timeout',
    'unreachable',
    'empty',
    'dropped',
]);

/** One NDJSON line, newline included. */
export function encodeEvent(event: ChatEvent): string {
    return `${JSON.stringify(event)}\n`;
}

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/**
 * Reads an NDJSON body as a stream of events.
 *
 * A chunk boundary has nothing to do with a line boundary - one read can carry
 * half a line, or three and a bit - so lines are reassembled here rather than
 * assumed. A line that will not parse is skipped instead of throwing: losing
 * one token is survivable, losing the rest of the answer is not.
 */
export async function* readChatStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffered += decoder.decode(value, { stream: true });

            let newline: number;
            while ((newline = buffered.indexOf('\n')) !== -1) {
                const line = buffered.slice(0, newline).trim();
                buffered = buffered.slice(newline + 1);
                if (!line) continue;
                const event = parseEvent(line);
                if (event) yield event;
            }
        }

        // A final line with no trailing newline, which is legal NDJSON.
        const tail = buffered.trim();
        if (tail) {
            const event = parseEvent(tail);
            if (event) yield event;
        }
    } finally {
        // Releasing the lock lets an abort actually tear the body down rather
        // than leaving it held by a reader nobody is reading from.
        reader.releaseLock();
    }
}

function parseEvent(line: string): ChatEvent | null {
    try {
        const parsed = JSON.parse(line) as ChatEvent;
        return parsed && typeof parsed.t === 'string' ? parsed : null;
    } catch {
        return null;
    }
}

/* ────────────────────────────────────────────────────────────
   n8n's side of the wire
   ──────────────────────────────────────────────────────────── */

/**
 * What an n8n streaming webhook actually emits, captured from a live run
 * rather than from the docs:
 *
 *   {"type":"begin","metadata":{"nodeId":…,"nodeName":"Agent",…}}
 *   {"type":"item","content":"hello","metadata":{…}}
 *   {"type":"item","content":" there","metadata":{…}}
 *   {"type":"end","metadata":{…}}
 *
 * One JSON object per line. `begin` and `end` bracket a node run and carry no
 * text, so only `item` is worth anything to us.
 *
 * There is a fifth kind, and missing it cost a week of mislabelled failures:
 *
 *   {"type":"error","content":"You have reached your specified API usage
 *    limits. You will regain access on 2026-11-01 at 00:00 UTC.","metadata":…}
 *
 * When the model provider refuses, THAT is the whole response - no items ever
 * arrive. Ignoring the line left the route thinking the workflow had simply
 * never been converted to streaming, so it handed the raw NDJSON to the
 * browser as if it were the answer. The user got "the chatbot is busy" and the
 * failure log got "agent returned a JSON envelope", twenty-four times, while
 * the actual sentence explaining it sat unread in the body.
 */
export interface N8nStreamChunk {
    type: 'begin' | 'item' | 'end' | 'error' | string;
    content?: string;
    metadata?: Record<string, unknown>;
}

/**
 * A node run starting or finishing, and which node it was.
 *
 * `begin` and `end` carry no text, which is exactly why they are useful: they
 * mark the edges of the silence. Returns null for anything else, including
 * n8n's own `keepalive`, which says only that the socket is open - something
 * this app already asserts for itself with its own heartbeat.
 */
export function runEdgeFromN8nLine(line: string): { edge: 'begin' | 'end'; nodeId: string } | null {
    let parsed: N8nStreamChunk;
    try {
        parsed = JSON.parse(line) as N8nStreamChunk;
    } catch {
        return null;
    }
    if (parsed?.type !== 'begin' && parsed?.type !== 'end') return null;

    const nodeId = parsed.metadata?.nodeId;
    return { edge: parsed.type, nodeId: typeof nodeId === 'string' ? nodeId : '' };
}

/** One line of an n8n stream that carries text, and which node produced it. */
export interface N8nItem {
    text: string;
    nodeId: string;
}

/**
 * The text in one line of an n8n streaming response, or null if that line
 * carries no text.
 *
 * **Every node streams, not only the agent.** A workflow that keeps a Respond
 * to Webhook node - which the four specialists must, because the orchestrator
 * reads them as JSON - emits a second `item` from that node whose content is
 * the entire `{"output":"…"}` envelope. Treating every item as answer text
 * appends the whole answer again as raw JSON, which is exactly what it looked
 * like. So the node is returned alongside the text and the caller keeps only
 * one of them.
 *
 * Returns null for anything unrecognised too, which is what makes the "did
 * this upstream stream at all" test work: a workflow still answering with a
 * single `{"output":"…"}` body produces no items, so the caller knows to fall
 * back to reading the whole body.
 */
export function itemFromN8nLine(line: string): N8nItem | null {
    let parsed: N8nStreamChunk;
    try {
        parsed = JSON.parse(line) as N8nStreamChunk;
    } catch {
        return null;
    }
    if (parsed?.type !== 'item') return null;
    if (typeof parsed.content !== 'string') return null;

    const nodeId = parsed.metadata?.nodeId;
    return { text: parsed.content, nodeId: typeof nodeId === 'string' ? nodeId : '' };
}

/**
 * The upstream's own error message from one line, or null.
 *
 * Returned verbatim. This is the one place where the agent gets to say what
 * actually went wrong, and paraphrasing it would throw away the only thing
 * that makes the failure actionable - a quota ceiling, a revoked key and a
 * malformed tool call all read identically once they have been summarised
 * into "the agent failed".
 */
export function errorFromN8nLine(line: string): string | null {
    let parsed: N8nStreamChunk;
    try {
        parsed = JSON.parse(line) as N8nStreamChunk;
    } catch {
        return null;
    }
    if (parsed?.type !== 'error') return null;

    const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
    return content || 'The agent reported an error with no detail';
}

/**
 * Whether a body is n8n's own stream rather than an answer.
 *
 * The buffered fallback exists for a workflow that was never converted to
 * streaming, and it must never fire for one that streamed and failed: handing
 * a page of `{"type":"begin"…}` to the browser as the answer is how this went
 * unnoticed in the first place.
 */
export function looksLikeN8nStream(body: string): boolean {
    const first = body.trimStart().slice(0, 200);
    return /^\{"type"\s*:\s*"(begin|item|end|error)"/.test(first);
}

/**
 * Pulls the answer out of a buffered (non-streaming) agent reply.
 *
 * Mirrors what the client used to do with `response.json()`, kept in one place
 * now that both the streaming and the buffered path need it.
 */
export function textFromBufferedBody(body: string): string {
    const trimmed = body.trim();
    if (!trimmed) return '';
    try {
        const data: unknown = JSON.parse(trimmed);
        if (data && typeof data === 'object') {
            const record = data as Record<string, unknown>;
            for (const key of ['output', 'message', 'text'] as const) {
                if (typeof record[key] === 'string') return record[key];
            }
            return JSON.stringify(data);
        }
        return String(data);
    } catch {
        return trimmed;
    }
}
