import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

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
