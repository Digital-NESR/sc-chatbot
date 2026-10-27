/**
 * How many requests one person may make, and in what.
 *
 * There was no limit of any kind on any route. An answer costs real money and
 * holds a connection for up to five minutes, and nothing stopped one signed-in
 * person opening twenty tabs and starting twenty of them - or a loop doing the
 * same thing faster and for longer.
 *
 * The counting happens in Postgres rather than in memory because the app runs
 * as several instances. An in-memory counter would make a limit of thirty into
 * thirty per instance: a limit that looks enforced, is not, and would not
 * announce the difference.
 */

import { prisma } from '@/lib/prisma';

export interface RateLimitRule {
    /** Requests allowed inside one window. */
    limit: number;
    /** Window length, seconds. */
    windowSeconds: number;
}

/**
 * Deliberately generous.
 *
 * These exist to bound a runaway loop or a stuck retry, not to ration anyone's
 * work. A buyer working hard through a morning sends a question every minute
 * or two; thirty in ten minutes is well past that and nowhere near what an
 * unattended script does. If a real person ever hits one of these, the number
 * is wrong and should be raised - the log says who, so that is answerable
 * rather than a guess.
 */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
    chat: { limit: 30, windowSeconds: 600 },
    // Written by the browser on any failure, with up to 4KB of its own text.
    // Nothing read it back, so an error loop could fill a table nobody watched.
    errors: { limit: 60, windowSeconds: 600 },
};

export interface RateLimitResult {
    allowed: boolean;
    /** How many are left in this window, floored at zero. */
    remaining: number;
    /** Seconds until the window resets. */
    retryAfter: number;
}

/**
 * Counts one request, atomically, and says whether it may proceed.
 *
 * The read-modify-write is a single statement on purpose. Doing it as a select
 * then an update would let two requests arriving together both read the same
 * count and both write count + 1, so a limit of thirty would be passed by
 * however many arrive in the same instant - which is exactly the traffic a
 * rate limit exists for.
 *
 * Fails OPEN. If the database is unreachable, this returns allowed, because a
 * limiter that takes the product down when it cannot count is worse than the
 * unbounded requests it was guarding against.
 */
export async function checkRateLimit(
    route: keyof typeof RATE_LIMITS,
    identity: string,
): Promise<RateLimitResult> {
    const rule = RATE_LIMITS[route];
    const key = `${route}:${identity.toLowerCase()}`;

    try {
        const rows = await prisma.$queryRaw<{ count: number; window_start: Date }[]>`
            INSERT INTO "RateLimit" ("key", "windowStart", "count")
            VALUES (${key}, now(), 1)
            ON CONFLICT ("key") DO UPDATE SET
                "count" = CASE
                    WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${rule.windowSeconds}::double precision)
                    THEN 1
                    ELSE "RateLimit"."count" + 1
                END,
                "windowStart" = CASE
                    WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${rule.windowSeconds}::double precision)
                    THEN now()
                    ELSE "RateLimit"."windowStart"
                END
            RETURNING "count", "windowStart" AS window_start
        `;

        const row = rows[0];
        if (!row) return { allowed: true, remaining: rule.limit, retryAfter: 0 };

        const count = Number(row.count);
        const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
        const retryAfter = Math.max(1, Math.ceil(rule.windowSeconds - elapsed));

        return {
            allowed: count <= rule.limit,
            remaining: Math.max(0, rule.limit - count),
            retryAfter,
        };
    } catch (error) {
        console.error(`[rateLimit] could not count ${key}, allowing:`, error);
        return { allowed: true, remaining: rule.limit, retryAfter: 0 };
    }
}
