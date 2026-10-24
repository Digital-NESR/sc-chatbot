import { prisma } from '@/lib/prisma';

/**
 * Records why an answer failed.
 *
 * The user is shown one fixed line whatever goes wrong, which is right for
 * them and useless for us. This keeps the real cause.
 *
 * It never throws and never rejects. A failure to log a failure must not turn
 * into a second failure on the request that is already going badly, so
 * everything here is best effort and the worst case is a console line.
 */

export type ErrorStage = 'upstream' | 'timeout' | 'network' | 'malformed' | 'session';

/** Enough to diagnose, bounded so one runaway body cannot fill the table. */
const MAX_DETAIL = 4000;
const MAX_MESSAGE = 1000;
const MAX_QUESTION = 2000;

const clip = (value: unknown, max: number): string | null => {
    if (value === null || value === undefined) return null;
    const s = typeof value === 'string' ? value : String(value);
    const t = s.trim();
    if (!t) return null;
    return t.length > max ? `${t.slice(0, max)}… [${t.length} chars]` : t;
};

export interface AppErrorInput {
    stage: ErrorStage;
    message: string;
    status?: number | null;
    detail?: unknown;
    userEmail?: string | null;
    sessionId?: string | null;
    botId?: string | null;
    question?: string | null;
}

export async function logAppError(input: AppErrorInput): Promise<void> {
    try {
        await prisma.errorLog.create({
            data: {
                stage: input.stage,
                message: clip(input.message, MAX_MESSAGE) ?? 'Unknown error',
                status: input.status ?? null,
                detail: clip(input.detail, MAX_DETAIL),
                userEmail: clip(input.userEmail, 320),
                sessionId: clip(input.sessionId, 64),
                botId: clip(input.botId, 64),
                question: clip(input.question, MAX_QUESTION),
            },
        });
    } catch (err) {
        console.error('[logAppError] could not record the failure:', err);
    }
}
