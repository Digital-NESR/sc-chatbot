'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ArrowLeft, Loader2, User, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
                        <Loader2 className="w-8 h-8 animate-spin text-[#307c4c]" />
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
                                            <div className="text-sm leading-relaxed markdown-admin-view">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: ({ children }) => (
                                                            <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>
                                                        ),
                                                        table: ({ children }) => (
                                                            <div className="w-full overflow-x-auto my-4">
                                                                <table className="w-full text-sm text-left border-collapse border border-slate-300 rounded-lg">
                                                                    {children}
                                                                </table>
                                                            </div>
                                                        ),
                                                        thead: ({ children }) => (
                                                            <thead className="text-xs uppercase text-slate-500 bg-slate-100/50">
                                                                {children}
                                                            </thead>
                                                        ),
                                                        th: ({ children }) => (
                                                            <th className="px-4 py-2 font-semibold whitespace-nowrap border-b border-slate-300">{children}</th>
                                                        ),
                                                        td: ({ children }) => (
                                                            <td className="px-4 py-1.5 border-b border-slate-200 last:border-0 whitespace-nowrap">{children}</td>
                                                        ),
                                                        ul: ({ children }) => (
                                                            <ul className="list-disc list-inside mb-2 space-y-1 pl-1">{children}</ul>
                                                        ),
                                                        ol: ({ children }) => (
                                                            <ol className="list-decimal list-inside mb-2 space-y-1 pl-1">{children}</ol>
                                                        ),
                                                        li: ({ children }) => (
                                                            <li>{children}</li>
                                                        ),
                                                        strong: ({ children }) => (
                                                            <strong className="font-semibold">{children}</strong>
                                                        ),
                                                        code: ({ children }) => (
                                                            <code className="bg-slate-200 text-slate-800 rounded px-1 py-0.5 font-mono text-xs">{children}</code>
                                                        ),
                                                        pre: ({ children }) => (
                                                            <pre className="bg-slate-800 text-slate-100 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono border border-slate-700">{children}</pre>
                                                        ),
                                                        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3">{children}</h1>,
                                                        h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-3">{children}</h2>,
                                                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
                                                        a: ({ href, children }) => (
                                                            <a
                                                                href={href}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-400 hover:text-blue-300 underline break-words"
                                                            >
                                                                {children}
                                                            </a>
                                                        ),
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
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
                        <Loader2 className="w-8 h-8 animate-spin text-[#307c4c]" />
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
                                            className="hover:bg-[#307c4c]/5 cursor-pointer transition-colors group"
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
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#307c4c] transition-colors" />
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
                                <th className="p-4 font-medium hidden md:table-cell">Job Title</th>
                                <th className="p-4 font-medium hidden sm:table-cell">Sessions</th>
                                <th className="p-4 font-medium hidden sm:table-cell">Messages</th>
                                <th className="p-4 font-medium hidden lg:table-cell">Avg Msg/Session</th>
                                <th className="p-4 font-medium hidden xl:table-cell">Unique Agents</th>
                                <th className="p-4 font-medium hidden md:table-cell">Last Active</th>
                                <th className="p-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-slate-500">
                                        No users found.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => {
                                    const hasMessages = user.totalMessages > 0;
                                    const isHighEngagement = user.totalMessages >= 20;

                                    return (
                                        <tr 
                                            key={user.email} 
                                            onClick={() => setSelectedUser(user)}
                                            className="hover:bg-[#307c4c]/5 cursor-pointer transition-colors group"
                                        >
                                            <td className="p-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center transition-colors ${hasMessages ? 'text-slate-600 group-hover:bg-[#307c4c]/10 group-hover:text-[#307c4c] group-hover:border-[#307c4c]/20' : 'text-slate-300'}`}>
                                                        <User className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className={`font-medium ${hasMessages ? 'text-slate-800' : 'text-slate-400'}`}>{user.displayName}</p>
                                                        <p className="text-xs text-slate-500">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`p-4 text-sm hidden md:table-cell ${hasMessages ? 'text-slate-600' : 'text-slate-400'}`}>
                                                {user.jobTitle}
                                            </td>
                                            <td className="p-4 hidden sm:table-cell">
                                                <div className="flex items-center gap-1.5 font-medium">
                                                    <span className={`px-2 py-1 flex items-center justify-center bg-slate-100 rounded text-xs border border-slate-200 ${hasMessages ? 'text-slate-700' : 'text-slate-400'}`}>
                                                        {user.totalSessions} 
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 hidden sm:table-cell">
                                                <span className={`px-2 py-1 rounded text-xs border font-semibold ${
                                                    isHighEngagement ? 'bg-[#307c4c]/10 border-[#307c4c]/20 text-[#307c4c]' : 
                                                    hasMessages ? 'bg-blue-50 border-blue-100 text-blue-700' : 
                                                    'bg-slate-50 border-slate-200 text-slate-400'
                                                }`}>
                                                    {user.totalMessages}
                                                </span>
                                            </td>
                                            <td className={`p-4 text-sm hidden lg:table-cell ${hasMessages ? 'text-slate-600' : 'text-slate-400'}`}>
                                                {user.averageMessagesPerSession}
                                            </td>
                                            <td className={`p-4 text-sm hidden xl:table-cell ${hasMessages ? 'text-slate-600' : 'text-slate-400'}`}>
                                                {user.uniqueAgentsUsed}
                                            </td>
                                            <td className={`p-4 text-sm hidden md:table-cell ${hasMessages ? 'text-slate-500' : 'text-slate-300'}`}>
                                                {user.lastActiveDateString}
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
