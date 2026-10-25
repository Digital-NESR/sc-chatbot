import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

/** Long enough for a real sentence, short enough to sit in the sidebar. */
const MAX_TITLE = 120;

/**
 * Renames one conversation.
 *
 * `titleSetByUser` is the point of it. Once somebody has named a thread by
 * hand, nothing else may rename it - not the auto-summary, not a later first
 * question - because having a name overwritten is worse than never getting one.
 */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });
    }

    try {
        const { title } = await request.json();
        const clean = typeof title === 'string' ? title.trim().slice(0, MAX_TITLE) : '';
        if (!clean) {
            return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
        }

        const existing = await prisma.chatSession.findFirst({
            where: { id, userEmail: session.user.email, isDeleted: false },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const updated = await prisma.chatSession.update({
            where: { id },
            data: { title: clean, titleSetByUser: true },
            select: { id: true, title: true },
        });

        return NextResponse.json({ success: true, ...updated });
    } catch (error) {
        console.error('Failed to rename session:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // In newer Next.js versions params is a promise
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In Next.js 15, route params is asynchronous
    // Depending on the version it might not be a Promise, but let's await it to be safe
    const params = await context.params;
    const { id } = params;

    if (!id) {
        return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });
    }

    try {
        // First verify the session belongs to the user
        const existingSession = await prisma.chatSession.findFirst({
            where: {
                id,
                userEmail: session.user.email,
                isDeleted: false,
            },
        });

        if (!existingSession) {
            return NextResponse.json({ error: 'Session not found or already deleted' }, { status: 404 });
        }

        // Soft delete by updating isDeleted
        await prisma.chatSession.update({
            where: { id },
            data: { isDeleted: true },
        });

        return NextResponse.json({ success: true, message: 'Session deleted' });
    } catch (error) {
        console.error('Error soft deleting session:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
