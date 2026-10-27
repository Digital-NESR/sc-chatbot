import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { logAppError, type ErrorStage } from '@/lib/logError';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * A failure the browser saw and the server did not.
 *
 * Most things break server side, where /api/chat logs them with the upstream
 * body attached. The rest only exist in the tab: the connection dropping
 * mid-request, a reply that arrived but could not be used, a conversation
 * that would not start. Those would otherwise be invisible.
 *
 * The user's email comes from their session, never from the body, so a report
 * cannot be filed against someone else.
 */
const STAGES: ErrorStage[] = ['upstream', 'timeout', 'network', 'malformed', 'session'];

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    /* This endpoint writes a row with up to 4KB of text the browser chose, and
       the row is rendered in /admin. Nothing read it back, so a retry loop in
       one tab could quietly fill the failure queue that somebody is supposed
       to be able to scan. Reporting a failure is best-effort by design, so
       being held back here costs nothing. */
    const rate = await checkRateLimit('errors', userEmail);
    if (!rate.allowed) {
        return NextResponse.json({ success: false, throttled: true }, { status: 200 });
    }

    try {
        const { stage, message, status, detail, sessionId, botId, question } = await request.json();

        if (!STAGES.includes(stage)) {
            return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
        }
        if (!message || typeof message !== 'string') {
            return NextResponse.json({ error: 'Missing message' }, { status: 400 });
        }

        await logAppError({
            stage,
            message,
            status: typeof status === 'number' ? status : null,
            detail,
            sessionId,
            botId,
            question,
            userEmail,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to record a client error:', error);
        // Deliberately not a 500. The caller is already handling a failure of
        // its own and has nothing useful to do with a second one.
        return NextResponse.json({ success: false });
    }
}
