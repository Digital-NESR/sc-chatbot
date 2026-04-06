'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ArrowLeft, Loader2, User, MessageSquare, Users, Activity, BarChart2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { siteConfig } from '@/config/site';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Helper to get agent name
const getAgentName = (botId: string) => {
    const agent = siteConfig.agents.find(a => a.id === botId);
    return agent ? agent.name : botId;
};

export default function AdminDashboard() {
    const [users, setUsers] = useState<any[]>([]);
    const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
    const [activeTodayCount, setActiveTodayCount] = useState<number>(0);
    const [loadingUsers, setLoadingUsers] = useState(true);

    const [selectedJobTitle, setSelectedJobTitle] = useState<string>('');
    const [selectedDepartment, setSelectedDepartment] = useState<string>('');
    const [selectedCountry, setSelectedCountry] = useState<string>('');
    const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('');
    const [chartMode, setChartMode] = useState<'combined' | 'agent'>('combined');

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
                    setUsers(data.users || []);
                    setTimeSeriesData(data.timeSeriesData || []);
                    setActiveTodayCount(data.activeTodayCount || 0);
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
                const res = await fetch(`/api/admin/sessions?userEmail=${encodeURIComponent(selectedUser.email)}`);
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

    // --- Derived UI State (ALL HOOKS MUST BE ABOVE EARLY RETURNS) ---
    const totalUsers = users.length;
    const totalSessions = useMemo(() => users.reduce((acc, u) => acc + u.totalSessions, 0), [users]);
    const totalMessages = useMemo(() => users.reduce((acc, u) => acc + u.totalMessages, 0), [users]);

    const uniqueJobTitles = useMemo(() => {
        const titles = new Set(users.map(u => u.jobTitle));
        return Array.from(titles).filter(Boolean).sort();
    }, [users]);

    const uniqueDepartments = useMemo(() => {
        const depts = new Set(users.map(u => u.department));
        return Array.from(depts).filter(Boolean).sort();
    }, [users]);

    const uniqueCountries = useMemo(() => {
        const countries = new Set(users.map(u => u.country));
        return Array.from(countries).filter(Boolean).sort();
    }, [users]);

    const uniqueAgents = useMemo(() => {
        return siteConfig.agents.map(a => ({ id: a.id, name: a.name }));
    }, []);

    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            if (selectedJobTitle && u.jobTitle !== selectedJobTitle) return false;
            if (selectedDepartment && u.department !== selectedDepartment) return false;
            if (selectedCountry && u.country !== selectedCountry) return false;
            if (selectedAgentFilter && !u.agentCounts[selectedAgentFilter]) return false;
            return true;
        });
    }, [users, selectedJobTitle, selectedDepartment, selectedCountry, selectedAgentFilter]);

    const chartColors = ['#e11d48', '#0284c7', '#d97706', '#7c3aed', '#10b981', '#f43f5e', '#3b82f6'];
    // -----------------------------------------------------------------

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
                                                    <MessageSquare className={`w-4 h-4 ${session.isDeleted ? 'text-red-300' : 'text-slate-400 group-hover:text-[#307c4c]'}`} />
                                                    <div className="flex items-center gap-2">
                                                        <span className={`truncate max-w-[150px] sm:max-w-[300px] inline-block ${session.isDeleted ? 'line-through text-slate-400 italic' : ''}`}>
                                                            {session.title}
                                                        </span>
                                                        {session.isDeleted && (
                                                            <span className="bg-red-100/80 border border-red-200 text-red-700 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">
                                                                Deleted
                                                            </span>
                                                        )}
                                                    </div>
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
        <div className="flex flex-col gap-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center">
                    <Users className="w-6 h-6 text-[#307c4c] mb-2" />
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Users</p>
                    <p className="text-3xl font-bold text-slate-800 mt-1">{totalUsers}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center">
                    <MessageSquare className="w-6 h-6 text-[#307c4c] mb-2" />
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Sessions</p>
                    <p className="text-3xl font-bold text-slate-800 mt-1">{totalSessions}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center">
                    <BarChart2 className="w-6 h-6 text-[#307c4c] mb-2" />
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Messages</p>
                    <p className="text-3xl font-bold text-slate-800 mt-1">{totalMessages}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center outline outline-2 outline-offset-2 outline-[#307c4c]/20">
                    <Activity className="w-6 h-6 text-[#307c4c] mb-2" />
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Today</p>
                    <p className="text-3xl font-bold text-[#307c4c] mt-1">{activeTodayCount}</p>
                </div>
            </div>

            {/* Recharts Analytics */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">Usage Over Time</h2>
                        <p className="text-sm text-slate-500">Daily session volume across the platform.</p>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setChartMode('combined')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${chartMode === 'combined' ? 'bg-white shadow-sm text-[#307c4c]' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Combined
                        </button>
                        <button 
                            onClick={() => setChartMode('agent')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${chartMode === 'agent' ? 'bg-white shadow-sm text-[#307c4c]' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            By Agent
                        </button>
                    </div>
                </div>
                
                <div className="h-[300px] w-full">
                    {timeSeriesData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={timeSeriesData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} stroke="#94a3b8" />
                                <YAxis tick={{fontSize: 12}} stroke="#94a3b8" />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '5 5' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                {chartMode === 'combined' ? (
                                    <Line type="monotone" dataKey="totalSessions" name="Total Sessions" stroke="#307c4c" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                                ) : (
                                    uniqueAgents.map((agent, idx) => (
                                        <Line 
                                            key={agent.id} 
                                            type="monotone" 
                                            dataKey={(d) => d.agents[agent.id] || 0} 
                                            name={agent.name} 
                                            stroke={idx === 0 ? '#307c4c' : chartColors[idx % chartColors.length]} 
                                            strokeWidth={2} 
                                            dot={{r: 3}} 
                                            activeDot={{r: 5}} 
                                        />
                                    ))
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                            <BarChart2 className="w-10 h-10 mb-2 opacity-20" />
                            <p>No time-series data available</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[700px]">
                <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">User Directory</h2>
                        <p className="text-sm text-slate-500">Select a user to drill down into their specific chat history.</p>
                    </div>
                    
                    {/* Slicers */}
                    <div className="flex flex-wrap sm:flex-nowrap gap-3">
                        <select 
                            value={selectedJobTitle}
                            onChange={(e) => setSelectedJobTitle(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#307c4c] focus:border-[#307c4c] block w-full p-2.5"
                        >
                            <option value="">All Job Titles</option>
                            {uniqueJobTitles.map((title: any) => (
                                <option key={title} value={title}>{title}</option>
                            ))}
                        </select>
                        <select 
                            value={selectedDepartment}
                            onChange={(e) => setSelectedDepartment(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#307c4c] focus:border-[#307c4c] block w-full p-2.5"
                        >
                            <option value="">All Departments</option>
                            {uniqueDepartments.map((dept: any) => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                        <select 
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#307c4c] focus:border-[#307c4c] block w-full p-2.5"
                        >
                            <option value="">All Countries</option>
                            {uniqueCountries.map((country: any) => (
                                <option key={country} value={country}>{country}</option>
                            ))}
                        </select>
                        <select 
                            value={selectedAgentFilter}
                            onChange={(e) => setSelectedAgentFilter(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#307c4c] focus:border-[#307c4c] block w-full p-2.5"
                        >
                            <option value="">All Agents</option>
                            {uniqueAgents.map((agent: any) => (
                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-0">
                    {loadingUsers ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 animate-spin text-[#307c4c]" />
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 font-medium">
                                    <th className="p-4 pl-6 font-medium">User</th>
                                    <th className="p-4 font-medium hidden md:table-cell">Job Title</th>
                                    <th className="p-4 font-medium hidden lg:table-cell">Department</th>
                                    <th className="p-4 font-medium hidden 2xl:table-cell text-center">Country</th>
                                    <th className="p-4 font-medium hidden sm:table-cell">Sessions</th>
                                    <th className="p-4 font-medium hidden sm:table-cell text-center">Active</th>
                                    <th className="p-4 font-medium hidden sm:table-cell text-center">Deleted</th>
                                    <th className="p-4 font-medium hidden sm:table-cell">Messages</th>
                                    <th className="p-4 font-medium hidden lg:table-cell">Avg Msg/Session</th>
                                    <th className="p-4 font-medium hidden xl:table-cell">Unique Agents</th>
                                    <th className="p-4 font-medium hidden md:table-cell">Last Active</th>
                                    <th className="p-4 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-slate-500">
                                        No users match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => {
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
                                            <td className={`p-4 text-sm hidden lg:table-cell ${hasMessages ? 'text-slate-600' : 'text-slate-400'}`}>
                                                {user.department}
                                            </td>
                                            <td className={`p-4 text-sm hidden 2xl:table-cell text-center ${hasMessages ? 'text-slate-600' : 'text-slate-400'}`}>
                                                {user.country}
                                            </td>
                                            <td className="p-4 hidden sm:table-cell">
                                                <div className="flex items-center gap-1.5 font-medium">
                                                    <span className={`px-2 py-1 flex items-center justify-center bg-slate-100 rounded text-xs border border-slate-200 ${hasMessages ? 'text-slate-700' : 'text-slate-400'}`}>
                                                        {user.totalSessions} 
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 hidden sm:table-cell text-center">
                                                <span className={`text-sm ${user.activeSessions > 0 ? 'text-slate-600 font-medium' : 'text-slate-300'}`}>
                                                    {user.activeSessions}
                                                </span>
                                            </td>
                                            <td className="p-4 hidden sm:table-cell text-center">
                                                <span className={`text-sm ${user.deletedSessions > 0 ? 'text-red-500 font-medium bg-red-50 px-2 py-1 rounded-md' : 'text-slate-300'}`}>
                                                    {user.deletedSessions}
                                                </span>
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
        </div>
    );
}
