import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * The wording in force, for the chat to lay over its defaults.
 *
 * Only the edits are returned - a few rows at most - because the defaults are
 * already in the bundle. Sending the whole table would be sending back most of
 * what the caller already has.
 *
 * Any signed-in user may read this. It is what their own answers are rendered
 * with, and it is a list of friendly words, not of what the database contains.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const rows = await prisma.displayName.findMany({ select: { key: true, label: true } });
        const names: Record<string, string> = {};
        for (const row of rows) names[row.key] = row.label;

        return NextResponse.json({ names });
    } catch (error) {
        console.error('Failed to read display names:', error);
        // The defaults are perfectly serviceable, so this is not worth failing
        // an answer over.
        return NextResponse.json({ names: {} });
    }
}
