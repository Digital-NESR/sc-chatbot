'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { ArrowUp, LogOut, Copy, Check, Menu, ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { siteConfig, type AgentId } from '@/config/site';

const { agents, suggestions, colors, images, text } = siteConfig;

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatSessionMeta {
  id: string;
  botId: string;
  title: string;
  updatedAt: string;
}

/* ── Assistant Bubble (own component so each message has independent state) ── */
function AssistantBubble({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy text');
    }
  };

  const toggleFeedback = (type: 'up' | 'down') => {
    setFeedback(prev => (prev === type ? null : type));
  };

  return (
    <div
      className="relative p-4 text-sm leading-relaxed shadow-sm transition-all duration-200 hover:shadow-md rounded-2xl rounded-tl-sm"
      style={{
        backgroundColor: colors.assistantBubbleBg,
        border: `1px solid ${colors.assistantBubbleBorder}`,
        color: colors.assistantTextColor,
      }}
    >
      {/* Message Content */}
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
            <thead className="text-xs uppercase text-slate-500 bg-slate-100">
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
          h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 text-black">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-3 text-black">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 text-slate-800">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>

      {/* ── Action Bar ── */}
      <div className="flex items-center justify-end gap-1 mt-3 pt-2 border-t border-slate-200">
        {/* Copy */}
        <button
          onClick={handleCopy}
          aria-label="Copy message"
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors duration-150"
        >
          {copied ? (
            <Check size={16} className="text-emerald-500" />
          ) : (
            <Copy size={16} />
          )}
        </button>

        {/* Thumbs Up */}
        <button
          onClick={() => toggleFeedback('up')}
          aria-label="Thumbs up"
          className={`p-1.5 rounded-md transition-colors duration-150 ${feedback === 'up'
              ? 'text-emerald-500 bg-emerald-50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
            }`}
        >
          <ThumbsUp size={16} fill={feedback === 'up' ? 'currentColor' : 'none'} />
        </button>

        {/* Thumbs Down */}
        <button
          onClick={() => toggleFeedback('down')}
          aria-label="Thumbs down"
          className={`p-1.5 rounded-md transition-colors duration-150 ${feedback === 'down'
              ? 'text-red-400 bg-red-50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
            }`}
        >
          <ThumbsDown size={16} fill={feedback === 'down' ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeAgentId, setActiveAgentId] = useState<AgentId>('material');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);

  // Start with empty messages to show the Welcome View
  const [messages, setMessages] = useState<Message[]>([]);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  const activeAgent = agents.find(a => a.id === activeAgentId) || agents[0];
  const activeAgentName = activeAgent.name;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Auth guard — redirect to login if session is not valid
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/chat/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error('Failed to fetch sessions', e);
    }
  };

  const loadSessionHistory = async (sessionId: string, botId: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/chat/history?sessionId=${sessionId}`);
      if (res.ok) {
         const data = await res.json();
         if (Array.isArray(data)) {
             setMessages(data.map((m: any) => ({
                 id: m.id,
                 role: m.role as 'user' | 'assistant' | 'system',
                 content: m.content
             })));
             setActiveSessionId(sessionId);
             setActiveAgentId(botId as AgentId);
             setIsSidebarOpen(false);
         }
      }
    } catch (e) {
      console.error('Failed to fetch history', e);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
       fetchSessions();
    }
  }, [status]);

  // Don't render anything while the session is being checked or if redirecting
  if (status === 'loading' || status === 'unauthenticated') return null;

  const handleAgentChange = (id: AgentId) => {
    setActiveAgentId(id);
    setActiveSessionId(null);
    setMessages([]); // Clear chat effectively starts new session
    setIsSidebarOpen(false); // Close sidebar on mobile after selecting agent
  };

  const handleDeleteSession = async (sessionId: string) => {
    // Optimistic UI update — remove from the sidebar immediately
    setSessions(prev => prev.filter(s => s.id !== sessionId));

    // If the deleted session is currently active, clear the view
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }

    try {
      await fetch(`/api/chat/session/${sessionId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete session:', err);
      // Re-fetch to restore state if the API call failed
      fetchSessions();
    }
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    // Add User Message
    const newUserMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: messageText,
    };

    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // 1. Save user message to database
      let currentSessionId = activeSessionId;
      try {
        const saveRes = await fetch('/api/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            botId: activeAgentId,
            role: 'user',
            content: messageText
          })
        });

        if (saveRes.ok) {
           const saveData = await saveRes.json();
           if (saveData.sessionId && !currentSessionId) {
               currentSessionId = saveData.sessionId;
               setActiveSessionId(currentSessionId);
               fetchSessions(); // refresh history sidebar
           }
        }
      } catch (err) {
        console.error('Failed to save user message:', err);
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl: activeAgent.webhookUrl,
          message: messageText,
          agent: activeAgent.name,
          sessionId: currentSessionId || crypto.randomUUID(),
        }),
      });

      // If the backend returned a non-ok status, show the generic error
      if (!response.ok) {
        console.error(`Backend error: ${response.status}`);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          role: 'assistant',
          content: text.genericError,
        }]);
        return;
      }

      const data = await response.json();
      let aiContent = '';

      if (typeof data === 'object' && data !== null) {
        if (data.output) aiContent = String(data.output);
        else if (data.message) aiContent = String(data.message);
        else if (data.text) aiContent = String(data.text);
        else aiContent = JSON.stringify(data);
      } else {
        aiContent = String(data);
      }

      // ── Sanity Check: intercept leaked JSON or garbage responses ──
      const trimmed = aiContent.trim();
      if (
        trimmed.startsWith('{') ||
        trimmed.startsWith('[') ||
        trimmed.includes('{"output":') ||
        trimmed.includes('"error"') ||
        !trimmed
      ) {
        console.warn('Intercepted malformed AI response:', trimmed.slice(0, 200));
        aiContent = text.genericError;
      }

      const newAiMessage: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: aiContent,
      };

      setMessages(prev => [...prev, newAiMessage]);

      // 2. Save AI message to database in the background
      if (currentSessionId) {
        fetch('/api/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            botId: activeAgentId,
            role: 'assistant',
            content: aiContent
          })
        }).catch(err => console.error('Failed to save AI message:', err));
      }

    } catch (error) {
      // Network failure, timeout, or unexpected crash — show as a normal assistant bubble
      console.error("Failed to send message:", error);
      setMessages(prev => [...prev, {
        id: Date.now() + 2,
        role: 'assistant',
        content: text.genericError,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => {
    const msg = inputValue.trim();
    if (msg) {
      setInputValue('');
      // Reset textarea height back to single-line after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      sendMessage(msg);
    }
  };

  const handleSuggestionClick = (suggestionText: string) => {
    setInputValue(suggestionText);

    // Focus the textarea
    if (textareaRef.current) {
      textareaRef.current.focus();

      // We need a slight delay for autoResize to calculate the correct scrollHeight 
      // based on the newly inserted text
      setTimeout(() => {
        autoResize();
      }, 0);
    }
  };



  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden font-sans text-slate-900">

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 
        SIDEBAR 
        Width: 280px (fixed)
      */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-gray-50 border-r border-gray-100 flex-shrink-0 flex flex-col h-full transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Branding Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative h-8 w-8 rounded-full overflow-hidden shadow-sm ring-1 ring-gray-200">
              <Image
                src={images.logo}
                alt={text.appName}
                fill
                className="object-cover"
              />
            </div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">{text.sidebarTitle}</h1>
          </div>
        </div>

        {/* Agent List */}
        <div className="flex-none max-h-[40%] overflow-y-auto px-4 pt-6 pb-2 space-y-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">
            {text.agentsLabel}
          </div>

          {agents.map((agent) => {
            const isActive = activeAgentId === agent.id && activeSessionId === null;
            return (
              <button
                key={agent.id}
                onClick={() => handleAgentChange(agent.id as AgentId)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium relative group ${isActive
                  ? 'bg-nesr-green/10 text-gray-900 shadow-sm ring-1 ring-black/5'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                {/* Active Indicator Border */}
                {isActive && (
                  <div className="absolute left-0 top-1 bottom-1 w-1 bg-nesr-green rounded-r-md" />
                )}

                {/* Icon */}
                <agent.icon
                  size={20}
                  className={`transition-colors ${isActive ? 'text-nesr-green' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                />

                {/* Name */}
                <div className="flex flex-col items-start text-left">
                  <span className={isActive ? 'font-semibold text-nesr-green' : ''}>
                    {agent.name}
                  </span>
                  {isActive && <span className="text-[10px] text-gray-500 font-normal opacity-80 leading-tight">{agent.description}</span>}
                </div>
              </button>
            );
          })}
        </div>
        
        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-1 mt-4 border-t border-gray-100 pt-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">
            Chat History
          </div>
          {sessions.map(session => {
              const sessionAgent = agents.find(a => a.id === session.botId);
              const isActive = activeSessionId === session.id;
              return (
                  <div
                     key={session.id}
                     onClick={() => loadSessionHistory(session.id, session.botId)}
                     className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all text-sm font-medium relative group cursor-pointer ${isActive ? 'bg-nesr-green/10 text-gray-900 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                  >
                      {isActive && (
                          <div className="absolute left-0 top-1 bottom-1 w-1 bg-nesr-green rounded-r-md" />
                      )}
                      <div className="flex flex-col items-start min-w-0 text-left flex-1 overflow-hidden">
                           <span className={`truncate w-full ${isActive ? 'font-semibold text-nesr-green' : ''}`}>{session.title}</span>
                           <span className="text-[10px] text-gray-400 uppercase tracking-wider truncate w-full">{sessionAgent?.name || 'Bot'}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.id);
                        }}
                        aria-label="Delete chat"
                        className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
                      >
                        <Trash2 size={14} />
                      </button>
                  </div>
              );
          })}
        </div>

        {/* User Profile + Sign Out */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg mb-1">
            {session?.user?.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || text.defaultUserName}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full ring-2 ring-white object-cover"
              />
            ) : (
              <div
                className="h-8 w-8 rounded-full ring-2 ring-white flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: colors.fallbackAvatarBg }}
              >
                {(session?.user?.name || 'U')
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <div className="text-sm flex-1 min-w-0">
              <p className="font-medium text-gray-700 truncate">
                {session?.user?.name || text.defaultUserName}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {session?.user?.jobTitle || text.defaultJobTitle}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all duration-150 group"
          >
            <LogOut size={15} className="transition-colors group-hover:text-red-500" />
            <span className="font-medium">{text.signOutButton}</span>
          </button>
        </div>
      </aside>

      {/* 
        MAIN CHAT AREA 
      */}
      <main className="flex-1 flex flex-col h-full relative bg-white">

        {/* Header */}
        <header className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-50 bg-white/80 backdrop-blur-md sticky top-0 z-10 text-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            {/* Hamburger Button (Mobile Only) */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <Menu size={20} />
            </button>

            <span className="text-gray-400 text-sm hidden sm:inline">{text.chattingWith}</span>
            <div className="flex items-center gap-2 bg-nesr-green/5 px-3 py-1 rounded-full border border-nesr-green/10">
              <activeAgent.icon size={14} className="text-nesr-green" />
              <span className="text-nesr-green font-semibold text-sm">
                {activeAgentName}
              </span>
            </div>
          </div>
          <div className="flex gap-4 text-gray-400">
            {/* Header Actions Placeholder */}
          </div>
        </header>

        {/* Message Container / Welcome View */}
        {/* Added extra padding bottom to ensure last messages are visible above the floating input */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-32 md:pb-40 scroll-smooth">

          {messages.length === 0 ? (
            /* Welcome View (Gemini Style) */
            <div className="h-full w-full max-w-[100vw] overflow-x-hidden flex flex-col items-center justify-center -mt-10 px-4 animate-in fade-in duration-500">
              <div className="relative h-24 w-24 rounded-full overflow-hidden shadow-xl mb-8 ring-4 ring-gray-50 bg-white p-1 shrink-0">
                <div className="relative h-full w-full rounded-full overflow-hidden">
                  <Image
                    src={images.logo}
                    alt={text.appName}
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
              </div>

              <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-gray-900 mb-2 tracking-tight text-center w-full max-w-full break-words whitespace-normal">
                {text.welcomeGreeting(activeAgentName)}
              </h2>
              <p className="text-base md:text-lg text-gray-400 font-medium mb-10 text-center w-full max-w-full break-words whitespace-normal leading-relaxed px-2">
                {activeAgent.description}. <br className="hidden sm:block" />
                <span className="text-sm md:text-base opacity-80">{activeAgent.tagline}</span>
              </p>

              {/* Suggestion Chips */}
              <div className="flex flex-col md:flex-row md:flex-wrap items-center justify-center gap-3 w-full">
                {(suggestions as Record<string, readonly string[]>)[activeAgentId]?.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full md:w-auto max-w-full text-left whitespace-normal break-words px-4 py-2.5 bg-white border border-gray-200 shadow-sm rounded-lg text-sm font-medium text-gray-600 hover:border-nesr-green hover:text-nesr-green transition-all hover:bg-nesr-green/5 hover:shadow-md"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message List */
            <div className="max-w-3xl lg:max-w-5xl mx-auto flex flex-col gap-6 pt-8">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="flex flex-col gap-1 max-w-[85%] lg:max-w-[90%]">
                    {/* Name label for clarity */}
                    <span className={`text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      {msg.role === 'user' ? text.youLabel : activeAgentName}
                    </span>

                    {msg.role === 'user' ? (
                      <div
                        className="relative p-4 text-sm leading-relaxed shadow-sm transition-all duration-200 hover:shadow-md bg-nesr-green text-white rounded-2xl rounded-tr-sm shadow-nesr-green/20"
                      >
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </div>
                    ) : msg.role === 'system' ? (
                      <div
                        className="relative p-4 text-sm leading-relaxed shadow-sm transition-all duration-200 hover:shadow-md bg-red-50 text-red-600 rounded-xl border border-red-100"
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <AssistantBubble content={msg.content} />
                    )}
                  </div>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex w-full justify-start mt-2">
                  <div
                    className="rounded-2xl rounded-tl-sm px-6 py-4 flex items-center gap-2 shadow-sm"
                    style={{
                      backgroundColor: colors.assistantBubbleBg,
                      border: `1px solid ${colors.assistantBubbleBorder}`,
                    }}
                  >
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}

        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pt-0 pointer-events-none bg-gradient-to-t from-white via-white/80 to-transparent z-20">
          <div className="max-w-[700px] lg:max-w-5xl mx-auto pointer-events-auto mt-4">
            <div className="relative shadow-[0_8px_40px_rgb(0,0,0,0.08)] hover:shadow-[0_8px_40px_rgb(0,0,0,0.12)] transition-shadow duration-300 rounded-2xl bg-white/90 backdrop-blur-xl ring-1 ring-gray-200 group focus-within:ring-2 focus-within:ring-nesr-green/20">


              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  autoResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={text.inputPlaceholder(activeAgentName)}
                className="w-full min-h-[52px] max-h-40 py-3.5 px-5 pr-14 bg-transparent border-none focus:ring-0 focus:outline-none placeholder-gray-400 text-gray-700 font-medium resize-none overflow-y-auto"
                rows={1}
              />

              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                className={`absolute right-3 bottom-3 h-9 w-9 rounded-lg flex items-center justify-center text-white transition-all duration-200 ${inputValue.trim() && !isLoading
                  ? 'bg-nesr-green hover:bg-nesr-green/80 shadow-sm hover:scale-105 active:scale-95'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
              >
                <ArrowUp size={18} strokeWidth={3} />
              </button>
            </div>

            <p className="text-center text-[10px] text-gray-400 mt-3 font-medium tracking-wide">
              {text.disclaimer(activeAgent.disclaimer)}
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
