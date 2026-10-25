import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import https from 'https';
import http from 'http';

export const dynamic = 'force-dynamic';

/**
 * Names a conversation after what it turned out to be about.
 *
 * The first seven words of the first question is a poor name for a thread -
 * "Can you tell me which suppliers we" tells you nothing a week later, and
 * every thread starting with "Can you" sorts into an unreadable column of
 * identical stubs. A sentence of the question plus a line of the answer is
 * enough for a small model to write four useful words.
 *
 * It runs through n8n for the same reason the freshness check does: the model
 * credentials already live there, and this is not worth putting a second
 * provider key into Vercel for. One call, a handful of tokens, once per
 * conversation.
 *
 * Everything here is best-effort. A conversation with the guessed title is
 * mildly worse than one with a good title; a conversation that failed to save
 * because the naming call fell over is much worse. Every failure returns the
 * title that was already there.
 */

// Same reason as the chat route: Next's fetch wrapper cannot be given a custom
// SSL agent, and the internal n8n host needs one.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const UPSTREAM_TIMEOUT_MS = 15_000;

/** What gets sent for naming. Enough to be about something, short enough to be cheap. */
const QUESTION_CHARS = 400;
const ANSWER_CHARS = 600;

/** Four or five words. Anything longer is truncated in the sidebar anyway. */
const MAX_TITLE = 60;

function postUpstream(url: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const req = (isHttps ? https : http).request(
            {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
                agent: isHttps ? insecureAgent : undefined,
            },
            res => {
                let data = '';
                res.on('data', chunk => (data += chunk));
                res.on('end', () =>
                    res.statusCode && res.statusCode >= 200 && res.statusCode < 300
                        ? resolve(data)
                        : reject(new Error(`Title webhook returned ${res.statusCode}`)),
                );
            },
        );

        req.setTimeout(UPSTREAM_TIMEOUT_MS, () => req.destroy(new Error('Title webhook timed out')));
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Pulls a title out of whatever shape the workflow answered in.
 *
 * A Respond node, a Basic LLM Chain and a bare string all end up here, so the
 * usual envelopes are tried before giving up rather than tying this to one
 * workflow layout.
 */
function readTitle(raw: string): string | null {
    const unwrap = (value: unknown): string | null => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.length ? unwrap(value[0]) : null;
        if (value && typeof value === 'object') {
            const o = value as Record<string, unknown>;
            for (const key of ['title', 'text', 'output', 'response', 'message']) {
                if (key in o) return unwrap(o[key]);
            }
        }
        return null;
    };

    let found: string | null;
    try {
        found = unwrap(JSON.parse(raw));
    } catch {
        found = raw;
    }
    if (!found) return null;

    // Models like to answer in quotes, or with a full stop, or with a label in
    // front. None of that belongs in a sidebar.
    const clean = found
        .trim()
        .split('\n')[0]
        .replace(/^(title|chat|conversation)\s*[:-]\s*/i, '')
        .replace(/^["'`]|["'`]$/g, '')
        .replace(/[.]+$/, '')
        .trim()
        .slice(0, MAX_TITLE);

    return clean || null;
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhook = process.env.N8N_TITLE_WEBHOOK;

    try {
        const { sessionId } = await request.json();
        if (!sessionId || typeof sessionId !== 'string') {
            return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        const chat = await prisma.chatSession.findFirst({
            where: { id: sessionId, userEmail, isDeleted: false },
            select: {
                id: true,
                title: true,
                titleSetByUser: true,
                messages: {
                    orderBy: { createdAt: 'asc' },
                    take: 2,
                    select: { role: true, content: true },
                },
            },
        });

        if (!chat) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }
        // A name somebody chose is never replaced by one a model wrote.
        if (chat.titleSetByUser) {
            return NextResponse.json({ title: chat.title, renamed: false });
        }
        if (!webhook) {
            // Not configured is not an error: the guessed title stands.
            return NextResponse.json({ title: chat.title, renamed: false, reason: 'not configured' });
        }

        const question = chat.messages.find(m => m.role === 'user')?.content ?? '';
        const answer = chat.messages.find(m => m.role === 'assistant')?.content ?? '';
        if (!question.trim()) {
            return NextResponse.json({ title: chat.title, renamed: false });
        }

        const raw = await postUpstream(
            webhook,
            JSON.stringify({
                sessionId: chat.id,
                question: question.slice(0, QUESTION_CHARS),
                answer: answer.slice(0, ANSWER_CHARS),
            }),
        );

        const title = readTitle(raw);
        if (!title) {
            return NextResponse.json({ title: chat.title, renamed: false });
        }

        // Re-checked rather than assumed: the user may have renamed the thread
        // in the seconds the model took to answer, and they win.
        const current = await prisma.chatSession.findUnique({
            where: { id: chat.id },
            select: { titleSetByUser: true, title: true },
        });
        if (!current || current.titleSetByUser) {
            return NextResponse.json({ title: current?.title ?? chat.title, renamed: false });
        }

        await prisma.chatSession.update({
            where: { id: chat.id },
            data: { title },
        });

        return NextResponse.json({ title, renamed: true });
    } catch (error) {
        console.error('Failed to name conversation:', error);
        // Deliberately not a 500. Nothing the caller can do about it, and the
        // conversation is perfectly usable under the name it already has.
        return NextResponse.json({ renamed: false }, { status: 200 });
    }
}
