'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ArrowLeft, Loader2, User, MessageSquare } from 'lucide-react';
import { siteConfig } from '@/config/site';

// Helper to get agent name
const getAgentName = (botId: string) => {
    const agent = siteConfig.agents.find(a => a.id === botId);
    return agent ? agent.name : botId;
};

export default function AdminDashboard() {
    const [users, setUsers] = useState<any[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);

    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [sessions, setSessions] = useState<any[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);

    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);

    // Fetch users on load
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await fetch('/api/admin/users');
                if (res.ok) {
                    const data = await res.json();
                    setUsers(data.users);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingUsers(false);
            }
        };
        fetchUsers();
    }, []);

    // Fetch sessions when a user is selected
    useEffect(() => {
        if (!selectedUser) return;
        const fetchSessions = async () => {
            setLoadingSessions(true);
            try {
                const res = await fetch(`/api/admin/sessions?userId=${encodeURIComponent(selectedUser.email)}`);
                if (res.ok) {
                    const data = await res.json();
                    setSessions(data.sessions);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingSessions(false);
            }
        };
        fetchSessions();
    }, [selectedUser]);

    // Fetch messages when a session is selected
    useEffect(() => {
        if (!selectedSession) return;
        const fetchMessages = async () => {
            setLoadingMessages(true);
            try {
                const res = await fetch(`/api/admin/messages?sessionId=${encodeURIComponent(selectedSession.id)}`);
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingMessages(false);
            }
        };
        fetchMessages();
    }, [selectedSession]);

    // Level 3: Transcript View
    if (selectedSession) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[80vh]">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50">
                    <button 
                        onClick={() => setSelectedSession(null)}
                        className="p-2 -ml-2 rounded-lg hover:bg-slate-200 transition-colors text-slate-600"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="font-semibold text-slate-800">{selectedSession.title}</h2>
                        <p className="text-sm text-slate-500">
                            {getAgentName(selectedSession.botId)} • {new Date(selectedSession.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50 relative">
                    {loadingMessages ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        messages.length === 0 ? (
                            <p className="text-center text-slate-500 mt-10">No messages in this session.</p>
                        ) : (
                            messages.map((msg, idx) => {
                                const isUser = msg.role === 'user';
                                return (
                                    <div key={msg.id || idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                        <div 
                                            className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                                                isUser 
                                                    ? 'bg-[#307c4c] text-white rounded-br-sm' 
                                                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                                            }`}
                                        >
                                            <p className="text-sm font-medium mb-1 opacity-75">
                                                {isUser ? selectedUser?.displayName : getAgentName(selectedSession.botId)}
                                            </p>
                                            <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                                {msg.content}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )
                    )}
                </div>
            </div>
        );
    }

    // Level 2: Sessions View
    if (selectedUser) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[80vh]">
                <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center gap-4">
                    <button 
                        onClick={() => setSelectedUser(null)}
                        className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">{selectedUser.displayName}</h2>
                        <p className="text-sm text-slate-500">{selectedUser.email}</p>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-0">
                    {loadingSessions ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 font-medium">
                                    <th className="p-4 pl-6 font-medium">Session Title</th>
                                    <th className="p-4 font-medium hidden sm:table-cell">Agent</th>
                                    <th className="p-4 font-medium hidden md:table-cell">Date Created</th>
                                    <th className="p-4 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sessions.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-slate-500">
                                            No sessions found.
                                        </td>
                                    </tr>
                                ) : (
                                    sessions.map((session) => (
                                        <tr 
                                            key={session.id} 
                                            onClick={() => setSelectedSession(session)}
                                            className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                        >
                                            <td className="p-4 pl-6 font-medium text-slate-800">
                                                <div className="flex items-center gap-3">
                                                    <MessageSquare className="w-4 h-4 text-slate-400 group-hover:text-[#307c4c]" />
                                                    <span className="truncate max-w-[200px] sm:max-w-[400px] inline-block">{session.title}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-600 hidden sm:table-cell">
                                                <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200">
                                                    {getAgentName(session.botId)}
                                                </span>
                                            </td>
                                            <td className="p-4 text-slate-500 text-sm hidden md:table-cell">
                                                {new Date(session.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="p-4 pr-6 text-right">
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-600 transition-colors" />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        );
    }

    // Level 1: Users View
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[80vh]">
            <div className="p-4 sm:p-6 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-800">Users Overview</h2>
                <p className="text-sm text-slate-500">Select a user to view their chat history.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0">
                {loadingUsers ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 font-medium">
                                <th className="p-4 pl-6 font-medium">User</th>
                                <th className="p-4 font-medium hidden sm:table-cell">Job Title</th>
                                <th className="p-4 font-medium hidden sm:table-cell">Total Sessions</th>
                                <th className="p-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-500">
                                        No users found.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => {
                                    const totalSessions = Object.values(user.agentCounts).reduce((a: any, b: any) => a + b, 0) as number;
                                    
                                    return (
                                        <tr 
                                            key={user.email} 
                                            onClick={() => setSelectedUser(user)}
                                            className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                        >
                                            <td className="p-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-[#307c4c]/10 group-hover:text-[#307c4c] group-hover:border-[#307c4c]/20 transition-colors">
                                                        <User className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-800">{user.displayName}</p>
                                                        <p className="text-xs text-slate-500">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-600 text-sm hidden sm:table-cell">
                                                {user.jobTitle}
                                            </td>
                                            <td className="p-4 text-slate-600 hidden sm:table-cell">
                                                <div className="flex items-center gap-1.5 font-medium">
                                                    <span className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded text-xs border border-slate-200">
                                                        {totalSessions}
                                                    </span>
                                                    <span className="text-xs text-slate-400">Total</span>
                                                </div>
                                            </td>
                                            <td className="p-4 pr-6 text-right">
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-600 transition-colors" />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
