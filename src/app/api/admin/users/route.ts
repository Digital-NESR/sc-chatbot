import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (session?.user?.email !== 'mfarhan1@nesr.com') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const sessions = await prisma.chatSession.findMany({
            where: { isDeleted: false },
            select: {
                userId: true,
                displayName: true,
                jobTitle: true,
                botId: true,
            }
        });

        // Group by user
        const userMap = new Map<string, any>();

        for (const s of sessions) {
            if (!userMap.has(s.userId)) {
                userMap.set(s.userId, {
                    email: s.userId,
                    displayName: s.displayName || 'Unknown',
                    jobTitle: s.jobTitle || 'Unknown',
                    agentCounts: {}
                });
            }
            
            const userData = userMap.get(s.userId);
            if (s.displayName && userData.displayName === 'Unknown') {
                userData.displayName = s.displayName;
            }
            if (s.jobTitle && userData.jobTitle === 'Unknown') {
                userData.jobTitle = s.jobTitle;
            }

            const currentCount = userData.agentCounts[s.botId] || 0;
            userData.agentCounts[s.botId] = currentCount + 1;
        }

        const users = Array.from(userMap.values());
        users.sort((a, b) => a.email.localeCompare(b.email));

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Failed to fetch admin users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
