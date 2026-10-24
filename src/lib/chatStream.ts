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
    /** The answer finished normally. */
    | { t: 'done' }
    /** It did not. Terminal; nothing follows. */
    | { t: 'error'; message: string; status?: number };

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
 */
export interface N8nStreamChunk {
    type: 'begin' | 'item' | 'end' | string;
    content?: string;
    metadata?: Record<string, unknown>;
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
