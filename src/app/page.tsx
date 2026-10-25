'use client';

import { useState, useRef, useEffect, useMemo, memo } from 'react';
import Image from 'next/image';
import { ArrowUp, LogOut, Copy, Check, Menu, ThumbsUp, ThumbsDown, Trash2, LayoutGrid, FileSpreadsheet, Loader2, HelpCircle, PlayCircle, Lightbulb, Square, Microscope, ChevronRight } from 'lucide-react';
import CapabilitiesPanel from '@/components/CapabilitiesPanel';
import HelpPanel from '@/components/HelpPanel';
import ChartBlock from '@/components/ChartBlock';
import BetaBadge from '@/components/BetaBadge';
import StreamingMarkdown from '@/components/StreamingMarkdown';
import FreshnessIndicator from '@/components/FreshnessIndicator';
import { markdownComponents } from '@/components/markdownComponents';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { siteConfig, agentEndpoint, type AgentId } from '@/config/site';
import { parseMarkdownTables, splitByTables, normalizeAnswerMarkdown } from '@/lib/markdownTable';
import { splitDerivation } from '@/lib/derivation';
import { exportTablesToXlsx, safeFileName } from '@/lib/exportTables';
import { readChatStream } from '@/lib/chatStream';

const { agents, suggestions, thinkingWords, colors, images, text, help } = siteConfig;

// Marks the intro video as watched. Versioned on purpose: bump the suffix when
// the video is replaced and everyone sees the new one once, rather than only
// people who have never signed in.
const INTRO_SEEN_KEY = 'scai.introSeen.v1';

/* Which agents read the SAP extract that track.data_freshness describes.
   SC Policy AI answers from policy documents in a vector store and SourceGuide
   AI from three other databases, none of which this load time covers - showing
   it there would be a claim about data they never touch. */
const FRESHNESS_AGENTS = new Set<AgentId>(['orchestrator', 'material', 'trackrequest']);

interface Message {
  // Local only, and only ever a React key. Fresh messages get a timestamp;
  // loaded ones get their row id, which is a cuid.
  id: string | number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  // The row id, once the message has actually been written. Feedback needs it
  // and an unsaved message cannot carry a rating, so it stays optional.
  dbId?: string;
  feedback?: 'up' | 'down' | null;
  // Set when the user pressed stop, or when the connection dropped partway.
  // Either way the text below is real but incomplete, and saying so is the
  // whole point - a truncated answer that looks finished is a wrong answer.
  incomplete?: 'stopped' | 'interrupted';
}

interface ChatSessionMeta {
  id: string;
  botId: string;
  title: string;
  updatedAt: string;
}

/* ── Rotating status line shown while an agent is working ── */
const THINKING_WORD_MS = 3000;

function ThinkingIndicator({ agentId }: { agentId: AgentId }) {
  const words = (thinkingWords as Record<string, readonly string[]>)[agentId]
    ?? thinkingWords.material;

  // null until the first word is picked, so nothing flashes a fixed opening
  // word before the random one takes over.
  const [index, setIndex] = useState<number | null>(null);
  const currentRef = useRef<number | null>(null);

  useEffect(() => {
    const total = words.length;

    // Math.random() lives here, in a timer callback, rather than in render or
    // a state updater - both of those must stay pure, and React may run them
    // more than once per commit.
    const pick = () => {
      let next = Math.floor(Math.random() * total);
      if (total > 1) {
        while (next === currentRef.current) {
          next = Math.floor(Math.random() * total);
        }
      }
      currentRef.current = next;
      setIndex(next);
    };

    pick();
    const id = setInterval(pick, THINKING_WORD_MS);
    return () => clearInterval(id);
  }, [words]);

  // Deliberately unstyled: no bubble, no dots. Just the word sitting on the
  // page, so the answer bubble arriving afterwards reads as the thing that
  // pops up.
  return (
    <span className="animate-pulse">
      {index !== null && (
        <span
          key={index}
          className="animate-in fade-in duration-700 text-xs text-slate-400 font-medium"
        >
          {words[index]}…
        </span>
      )}
    </span>
  );
}

/**
 * Tells the server why an answer never arrived.
 *
 * Every failure below shows the user the same line, which is deliberate - they
 * do not need to know whether n8n was down or the reply was malformed. This is
 * the other half of that: the real cause goes somewhere it can be read later,
 * on /admin/feedback, instead of into a console nobody opens.
 *
 * Fire and forget, and it swallows its own errors. The caller is already
 * handling a failure; a failure to report it must not become a second one.
 */
/** A failure that reportFailure has already been told about. */
class ReportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportedError';
  }
}

function reportFailure(input: {
  stage: 'upstream' | 'timeout' | 'network' | 'malformed' | 'session';
  message: string;
  status?: number;
  detail?: string;
  sessionId?: string | null;
  botId?: string;
  question?: string;
}) {
  try {
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Nothing sensible to do here.
  }
}

/* ── Assistant Bubble (own component so each message has independent state) ── */
const AssistantBubble = memo(function AssistantBubble({
  content,
  agentName,
  messageId,
  initialFeedback = null,
  incomplete,
}: {
  content: string;
  agentName: string;
  /** The row id. Absent until the message has been saved. */
  messageId?: string;
  initialFeedback?: 'up' | 'down' | null;
  incomplete?: 'stopped' | 'interrupted';
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(initialFeedback);
  const [exporting, setExporting] = useState(false);
  const [showDerivation, setShowDerivation] = useState(false);

  // The answer, and the note about how it was reached, which every agent is
  // told to put at the end. Split before anything else looks at the content:
  // the note is prose about the query, so charting or exporting it would be
  // charting the method rather than the data.
  const { body: rawBody, derivation } = useMemo(() => splitDerivation(content), [content]);

  // Repair the answer's Markdown before anything parses or renders it: a
  // <br> in a cell shows as literal text and stops the column parsing as a
  // number, and a miscounted delimiter row stops the table being a table.
  const body = useMemo(() => normalizeAnswerMarkdown(rawBody), [rawBody]);

  // Only messages that actually contain a Markdown table get an export button.
  const tables = useMemo(() => parseMarkdownTables(body), [body]);

  // The same answer, cut into prose and tables, so each table can offer its
  // own chart views where it stands.
  const segments = useMemo(() => splitByTables(body), [body]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy text');
    }
  };

  const handleExportTables = async () => {
    if (exporting || tables.length === 0) return;
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
      const fileName = `${safeFileName(`${text.exportFilePrefix}-${agentName}-${stamp}`)}.xlsx`;
      await exportTablesToXlsx(tables, fileName);
    } catch (err) {
      console.error('Failed to export tables:', err);
    } finally {
      setExporting(false);
    }
  };

  const toggleFeedback = async (type: 'up' | 'down') => {
    const next = feedback === type ? null : type;
    const previous = feedback;

    // Optimistic: a rating is one click and the user should not wait on a
    // round trip to see it land. If the write fails it goes back, because a
    // thumb that looks saved and is not is worse than one that never moved.
    setFeedback(next);
    if (!messageId) return;

    try {
      const res = await fetch('/api/chat/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, feedback: next }),
      });
      if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
    } catch (err) {
      console.error('Failed to save feedback:', err);
      setFeedback(previous);
    }
  };

  return (
    <div
      className="relative px-4 py-3 text-[13.5px] leading-[1.6] transition-colors duration-200 rounded-xl rounded-tl-md animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-300"
      style={{
        backgroundColor: colors.assistantBubbleBg,
        border: `1px solid ${colors.assistantBubbleBorder}`,
        color: colors.assistantTextColor,
      }}
    >
      {/* The answer, cut around its tables so each one can be read as a
          table or as a chart in place. A message with no table is a single
          text segment and renders exactly as it did before. */}
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {seg.markdown}
          </ReactMarkdown>
        ) : (
          <ChartBlock key={i} table={seg.table} />
        )
      )}

      {/* How the answer was reached. Collapsed, because on a good answer
          nobody needs it - and because an explanation shown on every answer is
          one nobody reads. It is there for the answer that looks wrong, where
          the filter is usually what was wrong. */}
      {derivation && (
        <div className="mt-2 pt-1.5 border-t border-slate-200/70">
          <button
            onClick={() => setShowDerivation(v => !v)}
            aria-expanded={showDerivation}
            className="inline-flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Microscope size={11} />
            {text.derivationLabel}
            <ChevronRight
              size={10}
              className={`transition-transform ${showDerivation ? 'rotate-90' : ''}`}
            />
          </button>

          {showDerivation && (
            // break-words and the overflow guard matter here: this is where
            // raw SQL, long regexes and 18-character material IDs end up, and
            // without them one identifier pushes the whole bubble sideways.
            <div className="mt-1.5 rounded-lg bg-white/70 border border-slate-200 px-3 py-2.5
                            text-[12px] leading-[1.6] text-slate-600 break-words overflow-x-auto
                            [&_p]:mb-2 [&_p:last-child]:mb-0
                            [&_ul]:mt-0 [&_ul]:mb-0 [&_ul]:space-y-1
                            [&_code]:bg-slate-100 [&_code]:text-slate-700 [&_code]:text-[11px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {derivation}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="flex items-center justify-end gap-0.5 -mr-1 mt-1.5 opacity-60 hover:opacity-100 transition-opacity duration-200">
        {/* Export tables to Excel — only rendered when the message has one */}
        {tables.length > 0 && (
          <button
            onClick={handleExportTables}
            disabled={exporting}
            aria-label={text.exportTable}
            title={text.exportTable}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors duration-150 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={14} />
            )}
          </button>
        )}

        {/* Copy */}
        <button
          onClick={handleCopy}
          aria-label="Copy message"
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors duration-150"
        >
          {copied ? (
            <Check size={14} className="text-emerald-500" />
          ) : (
            <Copy size={14} />
          )}
        </button>

        {/* Thumbs. Held back until the answer has a row to write to, which is
            a moment after it appears. A rating taken before then would have
            nowhere to go and would quietly disappear on the next reload. */}
        <button
          onClick={() => toggleFeedback('up')}
          disabled={!messageId}
          aria-label="Thumbs up"
          className={`p-1 rounded-md transition-colors duration-150 disabled:opacity-40 ${feedback === 'up'
              ? 'text-emerald-500 bg-emerald-50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
            }`}
        >
          <ThumbsUp size={14} fill={feedback === 'up' ? 'currentColor' : 'none'} />
        </button>

        <button
          onClick={() => toggleFeedback('down')}
          disabled={!messageId}
          aria-label="Thumbs down"
          className={`p-1 rounded-md transition-colors duration-150 disabled:opacity-40 ${feedback === 'down'
              ? 'text-red-400 bg-red-50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
            }`}
        >
          <ThumbsDown size={14} fill={feedback === 'down' ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* An answer that did not finish says so, on the answer itself. Anyone
          reading it later - including us, in the feedback view - needs to know
          the text stops early for a reason that is not the agent's. */}
      {incomplete && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-700">
          <Square size={9} className="fill-current shrink-0" />
          {incomplete === 'stopped' ? text.stoppedLabel : text.streamInterrupted}
        </p>
      )}

    </div>
  );
});

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Lands on the orchestrator, which routes to whichever specialist the
  // question needs. Opening on one specialist made it the default for people
  // who never switched, including for questions it cannot answer.
  const [activeAgentId, setActiveAgentId] = useState<AgentId>('orchestrator');
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [helpView, setHelpView] = useState<'video' | 'guide' | null>(null);
  // The intro plays once. Kept in localStorage rather than on the user record
  // so this needed no schema change; the cost is that a new browser or a
  // cleared cache shows it again, which for a welcome video is acceptable.
  const [showIntro, setShowIntro] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // The answer being written right now, held outside `messages` on purpose.
  // It changes ten times a second; the message list does not need to be
  // rebuilt at that rate, and keeping it separate means every settled bubble
  // stays untouched while this one grows.
  const [streaming, setStreaming] = useState<{ id: number; content: string } | null>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);

  // Start with empty messages to show the Welcome View
  const [messages, setMessages] = useState<Message[]>([]);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Holds the in-flight agent request so it can be dropped when the user moves
  // on. Without this an answer can arrive after the view has been cleared and
  // render into whatever conversation is open now.
  const abortRef = useRef<AbortController | null>(null);

  // Tells a deliberate stop apart from the aborts that happen when someone
  // switches agent or opens another conversation. A stop keeps what arrived;
  // the others throw it away, because it belongs to the view just left.
  const stoppedByUserRef = useRef(false);

  const abortInFlight = () => {
    stoppedByUserRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(null);
  };

  const handleStopGenerating = () => {
    if (!abortRef.current) return;
    stoppedByUserRef.current = true;
    abortRef.current.abort();
  };
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

  // The orchestrator is presented as the master agent sitting above the rest
  // rather than as a fifth peer. Its id stays "orchestrator" so stored session
  // botIds and the webhook env var keep working.
  const MASTER_AGENT_ID = 'orchestrator';
  const masterAgent = agents.find(a => a.id === MASTER_AGENT_ID);
  const subordinateAgents = agents.filter(a => a.id !== MASTER_AGENT_ID);

  // Rendered for both groups, so the master agent and the subordinates stay
  // visually identical apart from where they sit.
  const renderAgentButton = (agent: (typeof agents)[number]) => {
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
  };

  /**
   * Following the answer down, without fighting anyone who scrolls up.
   *
   * The old version scrolled smoothly on every change to `messages`. At ten
   * commits a second that is a smooth scroll starting before the last one has
   * finished, and scrolling back to read something becomes impossible - the
   * view drags you to the bottom again every hundred milliseconds.
   *
   * So: remember whether the user was at the bottom BEFORE the content grew,
   * and only follow if they were. Checking after the fact gets it wrong, since
   * a chunk that adds two hundred pixels leaves even a pinned reader
   * measurably far from the bottom.
   */
  const stickToBottomRef = useRef(true);

  const isNearBottom = () => {
    const el = scrollAreaRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const scrollToBottom = (smooth: boolean) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    // A message the user just sent always scrolls into view - they are looking
    // for it. Anything else respects where they have put the viewport.
    const last = messages[messages.length - 1];
    if (last?.role === 'user' || stickToBottomRef.current) scrollToBottom(true);
  }, [messages, isLoading]);

  // Instant, not smooth: a smooth scroll per chunk never finishes before the
  // next one starts, which reads as a permanently drifting page.
  useEffect(() => {
    if (streaming && stickToBottomRef.current) scrollToBottom(false);
  }, [streaming]);

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
    abortInFlight();
    try {
      setIsLoading(true);
      const res = await fetch(`/api/chat/history?sessionId=${sessionId}`);
      if (res.ok) {
         const data = await res.json();
         if (Array.isArray(data)) {
             setMessages(data.map((m: any) => ({
                 id: m.id,
                 dbId: m.id,
                 role: m.role as 'user' | 'assistant' | 'system',
                 content: m.content,
                 feedback: m.feedback ?? null,
                 incomplete: m.incomplete ?? undefined,
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

      try {
        if (!localStorage.getItem(INTRO_SEEN_KEY)) setShowIntro(true);
      } catch {
        // Private browsing or blocked storage: skip the intro rather than
        // showing it on every single visit.
      }
    }
  }, [status]);

  // Don't render anything while the session is being checked or if redirecting
  if (status === 'loading' || status === 'unauthenticated') return null;

  const handleAgentChange = (id: AgentId) => {
    abortInFlight();
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

    const controller = new AbortController();
    abortRef.current = controller;
    stoppedByUserRef.current = false;

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

      // The session id is the memory key n8n groups a conversation by, AND the
      // row the reply gets written to. A random fallback here used to hide a
      // failed save: the agent silently lost the thread, and the answer was
      // never persisted either, because currentSessionId stayed falsy. Better
      // to say so than to half-work.
      if (!currentSessionId) {
        reportFailure({
          stage: 'session',
          message: 'Could not start or load the conversation',
          detail: 'Saving the user message returned no sessionId',
          botId: activeAgentId,
          question: messageText,
        });
        throw new ReportedError('Could not start or load the conversation');
      }

      // Per agent, from config. The specialists each have a second webhook in
      // streaming mode; the orchestrator streams on its only one. An agent
      // with streaming off, or with no stream webhook configured, falls back
      // to the buffered webhook without anything breaking.
      const { url: endpoint, stream: wantsStream } = agentEndpoint(activeAgent);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl: endpoint,
          message: messageText,
          agent: activeAgent.name,
          sessionId: currentSessionId,
          stream: wantsStream,
        }),
        signal: controller.signal,
      });

      // If the backend returned a non-ok status, show the generic error
      if (!response.ok) {
        console.error(`Backend error: ${response.status}`);
        // 502 and 504 are already logged server side with the upstream body,
        // which is the part worth having. Anything else reaching here is ours,
        // so read what the route said before throwing the body away.
        if (response.status !== 502 && response.status !== 504) {
          const detail = await response.text().catch(() => '');
          reportFailure({
            stage: 'upstream',
            status: response.status,
            message: `Chat proxy returned ${response.status}`,
            detail,
            sessionId: currentSessionId,
            botId: activeAgentId,
            question: messageText,
          });
        }
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          role: 'assistant',
          content: text.genericError,
        }]);
        return;
      }

      let aiContent = '';
      // Set when the text below stops short of a finished answer.
      let incomplete: 'stopped' | 'interrupted' | undefined;

      if (wantsStream && response.body) {
        const streamId = Date.now() + 1;
        setStreaming({ id: streamId, content: '' });

        /* Commits are throttled to about ten a second.
           Every delta is a React render and a Markdown reparse of the tail
           block, and a fast model emits far more than ten tokens a second.
           Committing per token makes the tab stutter without making the text
           appear any sooner than the eye can follow. */
        let lastCommit = 0;
        const commit = (force: boolean) => {
          const now = Date.now();
          if (!force && now - lastCommit < 100) return;
          lastCommit = now;
          const snapshot = aiContent;
          setStreaming(s => (s && s.id === streamId ? { id: s.id, content: snapshot } : s));
        };

        try {
          for await (const event of readChatStream(response.body)) {
            if (event.t === 'delta') {
              aiContent += event.v;
              commit(false);
            } else if (event.t === 'error') {
              // Bytes are already on the wire, so this cannot come back as a
              // status. Keep what arrived and mark it.
              incomplete = 'interrupted';
              reportFailure({
                stage: 'network',
                message: event.message,
                detail: `Mid-stream failure after ${aiContent.length} chars`,
                sessionId: currentSessionId,
                botId: activeAgentId,
                question: messageText,
              });
              break;
            }
            // 'ping' does its work by existing; 'done' ends the loop naturally.
          }
        } catch (streamError) {
          // A stop, or the connection going away. Either way the partial text
          // is still worth keeping - at these durations someone who stops at
          // ninety seconds has usually read something they wanted.
          if (streamError instanceof DOMException && streamError.name === 'AbortError') {
            if (!stoppedByUserRef.current) throw streamError;
            incomplete = 'stopped';
          } else {
            throw streamError;
          }
        }

        // Nothing at all arrived before the stop. There is no answer to keep,
        // and an empty bubble saying "stopped" is just noise.
        if (incomplete === 'stopped' && aiContent.trim().length < 40) {
          setStreaming(null);
          return;
        }
      } else {
        const data = await response.json();

        if (typeof data === 'object' && data !== null) {
          if (data.output) aiContent = String(data.output);
          else if (data.message) aiContent = String(data.message);
          else if (data.text) aiContent = String(data.text);
          else aiContent = JSON.stringify(data);
        } else {
          aiContent = String(data);
        }
      }

      // ── Sanity Check: intercept leaked JSON or garbage responses ──
      //
      // This used to reject anything CONTAINING the substring '"error"'
      // anywhere, which binned legitimate answers: an agent explaining a data
      // quality problem, or quoting a column value, lost its whole reply. The
      // check now only fires when the response IS a JSON envelope rather than
      // prose that happens to mention one.
      const trimmed = aiContent.trim();
      const looksLikeRawJson =
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'));

      // An answer that was stopped or cut off is short for a reason we already
      // know, and it is already labelled. Running it through the malformed
      // check would replace real text with "the chatbot is busy".
      if (!incomplete && (!trimmed || looksLikeRawJson || trimmed.startsWith('{"output":'))) {
        console.warn('Intercepted malformed AI response:', trimmed.slice(0, 200));
        reportFailure({
          stage: 'malformed',
          message: trimmed ? 'Agent returned a JSON envelope instead of an answer' : 'Agent returned an empty answer',
          detail: trimmed,
          sessionId: currentSessionId,
          botId: activeAgentId,
          question: messageText,
        });
        aiContent = text.genericError;
      }

      const localId = Date.now() + 1;
      const newAiMessage: Message = {
        id: localId,
        role: 'assistant',
        content: aiContent,
        incomplete,
      };

      // Both in one go. React batches adjacent updates, so the finished bubble
      // replaces the streaming one in a single paint rather than leaving a
      // frame with neither on screen.
      setMessages(prev => [...prev, newAiMessage]);
      setStreaming(null);

      // 2. Save AI message to database in the background.
      // Still fire and forget as far as the user is concerned, but the row id
      // comes back and is attached to the message, so the thumbs have
      // something to write to without waiting for a reload.
      if (currentSessionId) {
        fetch('/api/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            botId: activeAgentId,
            role: 'assistant',
            content: aiContent,
            incomplete,
          })
        })
          .then(res => (res.ok ? res.json() : null))
          .then(saved => {
            const dbId = saved?.message?.id;
            if (!dbId) return;
            setMessages(prev =>
              prev.map(m => (m.id === localId ? { ...m, dbId } : m))
            );
          })
          .catch(err => console.error('Failed to save AI message:', err));
      }

    } catch (error) {
      // Abandoned on purpose - the user switched agent or opened another
      // conversation. Nothing to show, and the input belongs to the view they
      // left rather than the one they are looking at.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      // Network failure, timeout, or unexpected crash — show as a normal assistant bubble
      console.error("Failed to send message:", error);
      // Anything that reported itself on the way up is not logged twice.
      if (!(error instanceof ReportedError)) reportFailure({
        stage: 'network',
        message: error instanceof Error ? error.message : String(error),
        detail: error instanceof Error ? error.stack : undefined,
        sessionId: activeSessionId,
        botId: activeAgentId,
        question: messageText,
      });
      setMessages(prev => [...prev, {
        id: Date.now() + 2,
        role: 'assistant',
        content: text.genericError,
      }]);
      // Hand the text back. It was cleared optimistically on send, and losing
      // a long question to a network blip is worse than a briefly odd input box.
      setInputValue(prev => (prev.trim() ? prev : messageText));
    } finally {
      // Only the request that is still current may clear the loading state.
      // An aborted one settles a tick after its replacement has already set
      // it, and would otherwise switch off the spinner for the new view.
      // abortInFlight() nulls the ref, so a superseded request fails this test.
      if (abortRef.current === controller) {
        abortRef.current = null;
        stoppedByUserRef.current = false;
        setIsLoading(false);
        setStreaming(null);
      }
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
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">
              {text.sidebarTitle}{' '}
              <BetaBadge className="-translate-y-0.5" />
            </h1>
          </div>
        </div>

        {/* All Tools Button */}
        <div className="px-4">
          <a
            href="https://scagents.nesr.com"
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 group"
          >
            <LayoutGrid
              size={20}
              className="text-gray-400 group-hover:text-gray-600 transition-colors"
            />
            <span>All Tools</span>
          </a>
        </div>

        {/* Agent List */}
        <div className="flex-none max-h-[40%] overflow-y-auto px-4 pt-6 pb-2 space-y-1">
          {masterAgent && (
            <>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">
                {text.masterAgentLabel}
              </div>
              {renderAgentButton(masterAgent)}
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-5 px-2">
                {text.agentsLabel}
              </div>
            </>
          )}

          {subordinateAgents.map(renderAgentButton)}
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
          <div className="flex items-center gap-4 text-gray-400">
            {/* Both stay in the header because they are wanted mid-conversation,
                unlike "What can I do?", which sits with the greeting and goes
                once the chat starts. Labels hide on narrow screens. */}
            <button
              onClick={() => setHelpView('video')}
              title={help.videoTitle}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-500
                         hover:text-nesr-green hover:bg-nesr-green/5 transition-colors"
            >
              <PlayCircle size={16} />
              <span className="hidden sm:inline">{help.videoButton}</span>
            </button>
            <button
              onClick={() => setHelpView('guide')}
              title={help.guide.title}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-500
                         hover:text-nesr-green hover:bg-nesr-green/5 transition-colors"
            >
              <Lightbulb size={16} />
              <span className="hidden sm:inline">{help.guide.button}</span>
            </button>
          </div>
        </header>

        {/* Message Container / Welcome View */}
        {/* Added extra padding bottom to ensure last messages are visible above the floating input */}
        {/* scroll-smooth is gone from here on purpose: as a CSS property it
            overrides scrollIntoView's `auto`, so every streaming chunk would
            animate no matter what the JS asked for. */}
        <div
          ref={scrollAreaRef}
          onScroll={() => { stickToBottomRef.current = isNearBottom(); }}
          className="flex-1 overflow-y-auto px-4 sm:px-8 pb-32 md:pb-40"
        >

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
                <BetaBadge className="ml-2 -translate-y-1" />
              </h2>

              {/* Sits with the greeting rather than the header, so it is next to
                  the agent's name at the moment someone is deciding what to ask. */}
              <button
                onClick={() => setShowCapabilities(true)}
                className="mb-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200
                           bg-white text-sm text-gray-500 hover:text-nesr-green hover:border-nesr-green/40
                           hover:bg-nesr-green/5 transition-colors shadow-sm"
              >
                <HelpCircle size={14} />
                What can I do?
              </button>
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
            <div className="max-w-3xl lg:max-w-6xl xl:max-w-7xl mx-auto flex flex-col gap-4 pt-8">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex flex-col gap-0.5 ${msg.role === 'user' ? 'max-w-[85%] lg:max-w-[70%]' : 'max-w-[92%] lg:max-w-full'}`}>
                    {/* Name label for clarity */}
                    <span className={`text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      {msg.role === 'user' ? text.youLabel : activeAgentName}
                    </span>

                    {msg.role === 'user' ? (
                      <div
                        className="relative px-4 py-2.5 text-[13.5px] leading-[1.6] bg-nesr-green text-white rounded-xl rounded-tr-md"
                      >
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </div>
                    ) : msg.role === 'system' ? (
                      <div
                        className="relative px-4 py-2.5 text-[13.5px] leading-[1.6] bg-red-50 text-red-600 rounded-xl border border-red-100"
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline break-words"
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <AssistantBubble
                        content={msg.content}
                        agentName={activeAgentName}
                        messageId={msg.dbId}
                        initialFeedback={msg.feedback ?? null}
                        incomplete={msg.incomplete}
                      />
                    )}
                  </div>
                </div>
              ))}

              {/* The answer as it is written. No action bar and no table views
                  yet - those need the whole answer to be right about, and a
                  chart of half a table would be wrong rather than early. */}
              {streaming && streaming.content && (
                <div className="flex w-full justify-start">
                  <div className="flex flex-col gap-0.5 max-w-[92%] lg:max-w-full">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 text-left">
                      {activeAgentName}
                    </span>
                    <div
                      className="relative px-4 py-3 text-[13.5px] leading-[1.6] rounded-xl rounded-tl-md"
                      style={{
                        backgroundColor: colors.assistantBubbleBg,
                        border: `1px solid ${colors.assistantBubbleBorder}`,
                        color: colors.assistantTextColor,
                      }}
                    >
                      <StreamingMarkdown content={streaming.content} />
                    </div>
                  </div>
                </div>
              )}

              {/* Loading Indicator. Stands down the moment real text appears,
                  but stays up through the orchestrator's long silent stretch
                  while it is asking specialists - which is most of a slow
                  answer, and exactly when it is needed. */}
              {isLoading && !streaming?.content && (
                <div className="flex w-full justify-start mt-2 px-1">
                  <ThinkingIndicator agentId={activeAgentId} />
                </div>
              )}

              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}

        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pt-0 pointer-events-none bg-gradient-to-t from-white via-white/80 to-transparent z-20">
          <div className="max-w-[700px] lg:max-w-6xl xl:max-w-7xl mx-auto pointer-events-auto mt-4">
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

              {/* Send, or stop while an answer is on its way.
                  One button in one place: a separate stop control somewhere
                  else means hunting for it, and the send button is useless
                  during a request anyway. */}
              {isLoading ? (
                <button
                  onClick={handleStopGenerating}
                  aria-label={text.stopGenerating}
                  title={text.stopGenerating}
                  className="absolute right-3 bottom-3 h-9 w-9 rounded-lg flex items-center justify-center
                             bg-slate-700 text-white shadow-sm hover:bg-slate-800 transition-all duration-200
                             hover:scale-105 active:scale-95"
                >
                  <Square size={13} strokeWidth={3} className="fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  className={`absolute right-3 bottom-3 h-9 w-9 rounded-lg flex items-center justify-center text-white transition-all duration-200 ${inputValue.trim()
                    ? 'bg-nesr-green hover:bg-nesr-green/80 shadow-sm hover:scale-105 active:scale-95'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    }`}
                >
                  <ArrowUp size={18} strokeWidth={3} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 mt-3">
              <p className="text-center text-[10px] text-gray-400 font-medium tracking-wide">
                {text.disclaimer(activeAgent.disclaimer)}
              </p>
              {/* Only for the agents that actually read the SAP extract. On
                  SC Policy AI or SourceGuide AI this load time would be a
                  claim about data they do not use. */}
              {FRESHNESS_AGENTS.has(activeAgentId) && (
                <>
                  <span className="text-[10px] text-gray-300">•</span>
                  <FreshnessIndicator />
                </>
              )}
            </div>
          </div>
        </div>

      </main>

      {showIntro && (
        <HelpPanel
          view="video"
          firstVisit
          onClose={() => {
            setShowIntro(false);
            try { localStorage.setItem(INTRO_SEEN_KEY, new Date().toISOString()); } catch { /* storage blocked */ }
          }}
        />
      )}

      {helpView && <HelpPanel view={helpView} onClose={() => setHelpView(null)} />}

      {showCapabilities && (
        <CapabilitiesPanel
          agentId={activeAgentId}
          agentName={activeAgentName}
          onClose={() => setShowCapabilities(false)}
          onPickExample={handleSuggestionClick}
        />
      )}
    </div>
  );
}
