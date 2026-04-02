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
                updatedAt: true,
                _count: { select: { messages: true } }
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
                    totalSessions: 0,
                    totalMessages: 0,
                    lastActiveDate: new Date(0), // Setup initial epoch
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

            userData.totalSessions += 1;
            userData.totalMessages += s._count.messages;

            // Track last active date
            const currentUpdatedAt = new Date(s.updatedAt);
            if (currentUpdatedAt > userData.lastActiveDate) {
                userData.lastActiveDate = currentUpdatedAt;
            }

            const currentAgentCount = userData.agentCounts[s.botId] || 0;
            userData.agentCounts[s.botId] = currentAgentCount + 1;
        }

        const users = Array.from(userMap.values()).map(user => {
            // Compute extra fields
            user.averageMessagesPerSession = user.totalSessions > 0 
                ? parseFloat((user.totalMessages / user.totalSessions).toFixed(1)) 
                : 0;
            
            user.uniqueAgentsUsed = Object.keys(user.agentCounts).length;

            const date = user.lastActiveDate.getTime() === 0 ? new Date() : user.lastActiveDate;
            user.lastActiveDateString = date.toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', year: 'numeric' 
            });

            return user;
        });

        users.sort((a, b) => b.totalMessages - a.totalMessages);

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Failed to fetch admin users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
