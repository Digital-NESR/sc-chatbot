import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const dbUsers = await prisma.user.findMany({
            include: {
                chatSessions: {
                    select: {
                        botId: true,
                        isDeleted: true,
                        updatedAt: true,
                        _count: { select: { messages: true } }
                    }
                }
            }
        });

        const usersData: any[] = [];
        
        // Group by date for time-series charts
        const timeSeriesMap = new Map<string, any>();
        let activeTodayCount = 0;
        const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' in local timezone

        for (const u of dbUsers) {
            const userData = {
                email: u.email,
                displayName: u.displayName || 'Unknown',
                jobTitle: u.jobTitle || 'Unknown',
                department: u.department || 'General',
                country: u.country || 'Unknown',
                employeeId: u.employeeId || '',
                totalSessions: 0,
                activeSessions: 0,
                deletedSessions: 0,
                totalMessages: 0,
                lastActiveDate: new Date(0), // Setup initial epoch
                agentCounts: {} as Record<string, number>
            };

            for (const s of u.chatSessions) {
                userData.totalSessions += 1;
                if (s.isDeleted) {
                    userData.deletedSessions += 1;
                } else {
                    userData.activeSessions += 1;
                }
                userData.totalMessages += s._count.messages;

                // Track last active date
                const currentUpdatedAt = new Date(s.updatedAt);
                if (currentUpdatedAt > userData.lastActiveDate) {
                    userData.lastActiveDate = currentUpdatedAt;
                }

                userData.agentCounts[s.botId] = (userData.agentCounts[s.botId] || 0) + 1;
                
                // Build time series data
                const dateStr = currentUpdatedAt.toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
                
                if (dateStr === todayStr) {
                    activeTodayCount++;
                }

                if (!timeSeriesMap.has(dateStr)) {
                    timeSeriesMap.set(dateStr, {
                        date: dateStr,
                        totalSessions: 0,
                        totalMessages: 0,
                        agents: {} as Record<string, number>
                    });
                }
                
                const dayData = timeSeriesMap.get(dateStr);
                dayData.totalSessions += 1;
                dayData.totalMessages += s._count.messages;
                dayData.agents[s.botId] = (dayData.agents[s.botId] || 0) + 1;
            }

            usersData.push(userData);
        }

        const users = usersData.map(user => {
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

        // Sort time series chronologically
        const timeSeriesData = Array.from(timeSeriesMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json({ 
            users,
            timeSeriesData,
            activeTodayCount
        });
    } catch (error) {
        console.error('Failed to fetch admin users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
