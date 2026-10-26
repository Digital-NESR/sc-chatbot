import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';
import { DISPLAY_NAMES } from '@/config/dataNames';

export const dynamic = 'force-dynamic';

/** Long enough for a phrase, short enough to sit mid-sentence in a note. */
const MAX_LABEL = 80;

/**
 * Rewords one name.
 *
 * Two things are deliberate. A key that is not a known default is refused:
 * this is for rewording what the agents already say, not for inventing
 * replacements for arbitrary text, and an open-ended find-and-replace over
 * every answer is a much larger thing than it looks.
 *
 * And a label equal to the default - or empty - DELETES the row rather than
 * storing it. That keeps "has anyone changed this" answerable by the presence
 * of a row, and means a later change to a default reaches everyone who never
 * touched it.
 */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { key, label } = await request.json();

        if (typeof key !== 'string' || !(key in DISPLAY_NAMES)) {
            return NextResponse.json({ error: 'Unknown name' }, { status: 400 });
        }
        if (label != null && typeof label !== 'string') {
            return NextResponse.json({ error: 'label must be text' }, { status: 400 });
        }

        const clean = (label ?? '').trim().slice(0, MAX_LABEL);
        const isDefault = clean === '' || clean === DISPLAY_NAMES[key];

        if (isDefault) {
            await prisma.displayName.deleteMany({ where: { key } });
            return NextResponse.json({ key, label: DISPLAY_NAMES[key], isDefault: true });
        }

        await prisma.displayName.upsert({
            where: { key },
            create: { key, label: clean, updatedBy: session?.user?.email ?? null },
            update: { label: clean, updatedBy: session?.user?.email ?? null },
        });

        return NextResponse.json({ key, label: clean, isDefault: false });
    } catch (error) {
        console.error('Failed to save display name:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
