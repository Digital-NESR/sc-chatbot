'use client';

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import Image from 'next/image';
import { ArrowUp, LogOut, Copy, Check, Menu, ThumbsUp, ThumbsDown, Trash2, LayoutGrid, FileSpreadsheet, Loader2, HelpCircle, PlayCircle, Lightbulb, Square, Microscope, ChevronRight, X, RefreshCw, Pencil, CornerDownRight, Search, PanelLeftClose, PanelLeftOpen, ArrowDown, Table2, ChevronUp } from 'lucide-react';
import CapabilitiesPanel from '@/components/CapabilitiesPanel';
import HelpPanel from '@/components/HelpPanel';
import ChartBlock from '@/components/ChartBlock';
import BetaBadge from '@/components/BetaBadge';
import AgentSection, { AgentButton } from '@/components/AgentSection';
import StreamingMarkdown from '@/components/StreamingMarkdown';
import FreshnessIndicator from '@/components/FreshnessIndicator';
import { markdownComponents } from '@/components/markdownComponents';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { siteConfig, agentEndpoint, type AgentId } from '@/config/site';
import { parseMarkdownTables, splitByTables, normalizeAnswerMarkdown } from '@/lib/markdownTable';
import { splitAnswer } from '@/lib/derivation';
import { applyDisplayNames } from '@/config/dataNames';
import { exportTablesToXlsx, tablesToTsv, safeFileName } from '@/lib/exportTables';
import { readChatStream, RETRYABLE, type ChatFailure, type ChatPhase } from '@/lib/chatStream';

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
  // Only ever set alongside a thumbs-down, and only when the user chose to say.
  feedbackReason?: string | null;
  feedbackNote?: string | null;
  // Set when the user pressed stop, or when the connection dropped partway.
  // Either way the text below is real but incomplete, and saying so is the
  // whole point - a truncated answer that looks finished is a wrong answer.
  incomplete?: 'stopped' | 'interrupted';
  // Set on a failure bubble: the question that did not get an answer, kept so
  // it can be asked again without being typed again. Never persisted - a
  // failure is not a turn in the conversation. Absent on a failure nothing
  // can be done about, where offering the same click again is a lie.
  retry?: string;
  /** Which kind of failure, for a note under a half-finished answer. */
  failure?: ChatFailure;
}

interface ChatSessionMeta {
  id: string;
  botId: string;
  title: string;
  updatedAt: string;
}

/* Remembers whether the sidebar was put away, per browser. */
const SIDEBAR_COLLAPSED_KEY = 'scai.sidebarCollapsed.v1';

/* Whether the four specialists are folded down to a row of icons. */
const AGENTS_COLLAPSED_KEY = 'scai.agentsCollapsed.v1';

/* Past this many characters a sidebar title is cut off, so hovering it scrolls
   it. Judged on length rather than measured: a measurement per row, repeated
   on every render of a list that grows forever, costs more than it is worth
   for a decision this reversible. */
const MARQUEE_AFTER = 26;

/**
 * Which heading a conversation sits under.
 *
 * By when it was last used rather than when it was started, because that is
 * what someone looking for "the one I was doing this morning" remembers.
 */
const GROUP_ORDER = ['today', 'yesterday', 'week', 'older'] as const;
type GroupKey = (typeof GROUP_ORDER)[number];

function groupFor(iso: string): GroupKey {
    // Whole days between the two midnights, so 23:55 last night and 00:05
    // this morning land either side of the line rather than both in 'today'.
    const then = new Date(iso);
    then.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return 'week';
    return 'older';
}

/**
 * While a stored conversation is being fetched.
 *
 * Three grey blocks rather than a spinner: the shape of what is coming says
 * more than a dot does, and the view does not jump when the real messages
 * replace them. Hidden from screen readers - the live region says "Loading
 * conversation" once, which is the whole of the information.
 */
function HistorySkeleton() {
  return (
    <div
      aria-hidden="true"
      className="max-w-3xl lg:max-w-6xl xl:max-w-7xl mx-auto flex flex-col gap-4 pt-8 animate-pulse"
    >
      {[0, 1, 2].map(i => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`rounded-xl bg-slate-100 ${i % 2 === 0 ? 'h-10 w-1/3' : 'h-28 w-4/5'}`}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * The live line while an answer is being worked out.
 *
 * It replaces a word that changed every three seconds and meant nothing. The
 * phase comes from the agent's own run boundaries - the only thing n8n tells
 * us during the wait - and the seconds come from the clock, which is what
 * separates "slow" from "hung" for a reader who cannot see either.
 */
function PhaseIndicator({ phase, agentId }: { phase: ChatPhase; agentId: AgentId }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    // Restarts with each phase, so the number is the age of what is happening
    // now rather than of the whole question.
    setSeconds(0);
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const words = agentId === 'orchestrator' ? text.phases.orchestrator : text.phases.specialist;

  return (
    <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
      <Loader2 size={11} className="animate-spin text-slate-300" />
      <span className="animate-in fade-in duration-500">{words[phase]}</span>
      {/* Only once the wait is long enough to be worth timing. Before that the
          number is noise that draws the eye to a question already answered. */}
      {seconds >= 3 && <span className="tabular-nums text-slate-300">{seconds}s</span>}
    </span>
  );
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
/**
 * The line a user reads for a failure, and whether to offer another go.
 *
 * Everything that fails in here ends up going through this, so there is one
 * answer to "what does this look like" rather than one per catch block.
 */
function failureBubble(kind: ChatFailure | null, question: string): Message {
  return {
    id: Date.now() + 2,
    role: 'assistant',
    content: kind ? text.failures[kind] : text.genericError,
    // A refusal is the one that must not offer a retry: the click would do
    // exactly what just failed, for the same reason, and say so again.
    retry: !kind || RETRYABLE.has(kind) ? question : undefined,
    failure: kind ?? undefined,
  };
}

/** Not an error: the user's turn was saved the first time round. */
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
  initialReason = null,
  initialNote = null,
  incomplete,
  failure,
  onAsk,
  onAnnounce,
}: {
  content: string;
  agentName: string;
  /** Sends one of the agent's suggested next questions. Stable identity. */
  onAsk: (question: string) => void;
  /** Says something to a screen reader. Stable identity. */
  onAnnounce: (message: string) => void;
  /** The row id. Absent until the message has been saved. */
  messageId?: string;
  initialFeedback?: 'up' | 'down' | null;
  initialReason?: string | null;
  initialNote?: string | null;
  incomplete?: 'stopped' | 'interrupted';
  /** Why it stopped, when the agent stopped it. Not persisted, so a reloaded
      conversation falls back to the general note. */
  failure?: ChatFailure;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedTable, setCopiedTable] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(initialFeedback);
  const [reason, setReason] = useState<string | null>(initialReason);
  const [note, setNote] = useState<string | null>(initialNote);
  const [noteDraft, setNoteDraft] = useState(initialNote ?? '');
  // The reason row is open while it is being answered and closed afterwards.
  // A reloaded conversation opens closed: the rating was given, and asking
  // again about an answer from last week is asking the wrong person.
  const [askReason, setAskReason] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDerivation, setShowDerivation] = useState(false);

  // The answer, and the note about how it was reached, which every agent is
  // told to put at the end. Split before anything else looks at the content:
  // the note is prose about the query, so charting or exporting it would be
  // charting the method rather than the data.
  const { body: rawBody, derivation, followUps } = useMemo(() => splitAnswer(content), [content]);

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
      onAnnounce(text.a11y.copied);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy text');
    }
  };

  /* Tab-separated, so the cells arrive in a spreadsheet as cells. Copying the
     Markdown puts each row in one cell, and the Excel export is a file to open
     rather than something to paste - this is the one someone building a sheet
     out of three answers actually wants. */
  const handleCopyTable = async () => {
    if (tables.length === 0) return;
    try {
      await navigator.clipboard.writeText(tablesToTsv(tables));
      setCopiedTable(true);
      onAnnounce(text.a11y.tableCopied);
      setTimeout(() => setCopiedTable(false), 2000);
    } catch {
      console.error('Failed to copy table');
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

  const save = async (payload: {
    feedback: 'up' | 'down' | null;
    reason?: string | null;
    note?: string | null;
  }) => {
    if (!messageId) return false;
    try {
      const res = await fetch('/api/chat/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...payload }),
      });
      if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
      return true;
    } catch (err) {
      console.error('Failed to save feedback:', err);
      return false;
    }
  };

  const toggleFeedback = async (type: 'up' | 'down') => {
    const next = feedback === type ? null : type;
    const was = { feedback, reason, note };

    // Optimistic: a rating is one click and the user should not wait on a
    // round trip to see it land. If the write fails it goes back, because a
    // thumb that looks saved and is not is worse than one that never moved.
    setFeedback(next);
    onAnnounce(next ? text.a11y.ratingSaved : text.a11y.ratingCleared);
    setReason(null);
    setNote(null);
    setNoteDraft('');
    // The thumb is already on its way. Everything below is an extra, which is
    // why it appears after the rating rather than in front of it.
    setAskReason(next === 'down');

    if (!messageId) return;
    if (!(await save({ feedback: next, reason: null, note: null }))) {
      setFeedback(was.feedback);
      setReason(was.reason);
      setNote(was.note);
      setAskReason(false);
    }
  };

  const chooseReason = async (id: string) => {
    const next = reason === id ? null : id;
    const was = reason;
    setReason(next);
    if (next !== 'other') {
      setNote(null);
      setNoteDraft('');
    }
    if (!(await save({ feedback: 'down', reason: next, note: next === 'other' ? note : null }))) {
      setReason(was);
    }
  };

  const saveNote = async () => {
    const text = noteDraft.trim();
    if (text === (note ?? '')) return;
    setNote(text || null);
    await save({ feedback: 'down', reason: 'other', note: text || null });
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

      {/* Two or three questions the agent thinks are worth asking next.
          Deliberately a single quiet line: these are a nudge for someone who
          does not know what else to ask, not a menu, and an answer that ends
          in six buttons has stopped being an answer. */}
      {followUps.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <CornerDownRight size={11} className="text-slate-300 shrink-0" />
          {followUps.map((q, i) => (
            <button
              key={i}
              onClick={() => onAsk(q)}
              title={q}
              className="px-2 py-0.5 rounded-full border border-slate-200 bg-white/70
                         text-[11px] text-slate-500 transition-colors
                         hover:border-nesr-green/40 hover:text-nesr-green hover:bg-nesr-green/5"
            >
              {q}
            </button>
          ))}
        </div>
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
                {applyDisplayNames(derivation)}
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

        {/* Copy the tables as cells, for pasting into a sheet */}
        {tables.length > 0 && (
          <button
            onClick={handleCopyTable}
            aria-label={text.copyTable}
            title={text.copyTable}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors duration-150"
          >
            {copiedTable ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Table2 size={14} />
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

      {/* Why, for anyone who wants to say. It only ever appears after the
          thumbs-down has already been saved, so ignoring it, dismissing it or
          closing the tab all leave the rating exactly as it was. */}
      {askReason && feedback === 'down' && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-200/70">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] text-slate-400 mr-auto">
              {text.feedback.prompt}{' '}
              <span className="text-slate-300">({text.feedback.optional})</span>
            </span>
            {text.feedback.reasons.map(r => (
              <button
                key={r.id}
                onClick={() => chooseReason(r.id)}
                aria-pressed={reason === r.id}
                className={`px-2 py-0.5 rounded-full border text-[10.5px] transition-colors ${reason === r.id
                    ? 'border-red-200 bg-red-50 text-red-500'
                    : 'border-slate-200 bg-white/70 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setAskReason(false)}
              aria-label={text.feedback.dismiss}
              title={text.feedback.dismiss}
              className="p-0.5 rounded text-slate-300 hover:text-slate-500 transition-colors"
            >
              <X size={12} />
            </button>
          </div>

          {reason === 'other' && (
            <input
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              onBlur={saveNote}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              placeholder={text.feedback.notePlaceholder}
              autoFocus
              className="mt-1.5 w-full px-2 py-1 rounded-md border border-slate-200 bg-white
                         text-[11.5px] text-slate-600 placeholder-slate-300
                         focus:outline-none focus:border-slate-300"
            />
          )}
        </div>
      )}

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

  // Where the agent has got to, while there is still nothing to show.
  const [phase, setPhase] = useState<ChatPhase | null>(null);

  // What a screen reader is told. Nothing else renders it.
  const [announcement, setAnnouncement] = useState('');

  // Shown when the reader has scrolled away from the bottom, so there is a way
  // back to the answer still being written.
  const [showJump, setShowJump] = useState(false);

  // A stored conversation on its way. Separate from isLoading, which also
  // means "an agent is working" and puts a different thing on screen.
  const [loadingHistory, setLoadingHistory] = useState(false);

  /**
   * Says something to a screen reader, once.
   *
   * A live region announces on CHANGE, so saying "Copied" twice in a row would
   * be silent the second time. The zero-width space makes the text different
   * without making it different to read.
   */
  const announce = useCallback((message: string) => {
    setAnnouncement(prev => (prev.replace(/​+$/, '') === message ? message + '​' : message));
  }, []);


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
    setPhase(null);
  };

  const handleStopGenerating = useCallback(() => {
    if (!abortRef.current) return;
    stoppedByUserRef.current = true;
    abortRef.current.abort();
  }, []);
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
  const pickAgent = (id: string) => handleAgentChange(id as AgentId);

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

  // Mirrors showJump so the scroll handler, which fires continuously, only
  // calls setState on the frame the answer actually changes.
  const jumpRef = useRef(false);

  const handleScroll = () => {
    const near = isNearBottom();
    stickToBottomRef.current = near;
    if (jumpRef.current !== !near) {
      jumpRef.current = !near;
      setShowJump(!near);
    }
  };

  const jumpToLatest = () => {
    stickToBottomRef.current = true;
    scrollToBottom(true);
  };

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
      setLoadingHistory(true);
      announce(text.a11y.loadingHistory);
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
                 feedbackReason: m.feedbackReason ?? null,
                 feedbackNote: m.feedbackNote ?? null,
                 incomplete: m.incomplete ?? undefined,
             })));
             setActiveSessionId(sessionId);
             setActiveAgentId(botId as AgentId);
             setIsSidebarOpen(false);
             announce(text.a11y.conversationLoaded(data.length));
         }
      }
    } catch (e) {
      console.error('Failed to fetch history', e);
      setMessages([]);
    } finally {
      setIsLoading(false);
      setLoadingHistory(false);
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

  /**
   * `resend` is a second go at a question that already failed.
   *
   * The user's turn is already on screen and already in the database - the
   * failure happened after both - so repeating either would leave the
   * conversation asking itself the same thing twice, and n8n reading it back
   * out of memory that way.
   */
  const sendMessage = async (messageText: string, options?: { resend?: boolean }) => {
    if (!messageText.trim() || isLoading) return;
    const resend = options?.resend ?? false;
    /* Whether this turn is the one worth naming afterwards.
       A brand-new conversation, obviously - but also one whose only answers so
       far have been failures, because the naming call never ran for those and
       the thread would otherwise keep its guessed title for good. Once a real
       answer exists this is false, so the model is asked once per
       conversation and never again. */
    const isFirstTurn =
      !activeSessionId || !messages.some(m => m.role === 'assistant' && !m.retry);

    if (!resend) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'user',
        content: messageText,
      }]);
    }
    setIsLoading(true);
    setPhase(null);
    announce(text.a11y.working(activeAgentName));

    const controller = new AbortController();
    abortRef.current = controller;
    stoppedByUserRef.current = false;

    try {
      // 1. Save user message to database
      let currentSessionId = activeSessionId;

      // Unless it is already saved. A retry inside an existing conversation
      // has nothing to write - the question was stored the first time and the
      // failure came later - and writing it twice would leave the thread
      // asking itself the same thing twice, in the database and in n8n's
      // memory. A retry with no session yet still saves, because the save is
      // also what creates the session.
      if (!(resend && currentSessionId)) {
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
        // The route's own body says which kind it was. Read it before the
        // branch below consumes it.
        const failed = await response.json().catch(() => null);
        const kind: ChatFailure | null =
          failed && typeof failed.kind === 'string' && failed.kind in text.failures
            ? (failed.kind as ChatFailure)
            : null;

        if (response.status !== 502 && response.status !== 504) {
          const detail = JSON.stringify(failed ?? '');
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
        setMessages(prev => [...prev, failureBubble(kind, messageText)]);
        announce(text.a11y.failed);
        return;
      }

      let aiContent = '';
      // Set when the text below stops short of a finished answer.
      let incomplete: 'stopped' | 'interrupted' | undefined;
      // And why, when it was the agent rather than the user that stopped it.
      let failedWith: ChatFailure | null = null;

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
            } else if (event.t === 'step') {
              setPhase(event.phase);
              announce(text.phases[activeAgentId === 'orchestrator' ? 'orchestrator' : 'specialist'][event.phase]);
            } else if (event.t === 'error') {
              // Bytes are already on the wire, so this cannot come back as a
              // status. Keep what arrived and mark it.
              incomplete = 'interrupted';
              failedWith = event.kind && event.kind in text.failures ? event.kind : null;
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

        /* The agent failed before writing a word. There is no partial answer
           to annotate, so this is a failure rather than an answer that stops
           early - and it gets the line that says what happened. */
        if (incomplete === 'interrupted' && !aiContent.trim()) {
          setStreaming(null);
          setMessages(prev => [...prev, failureBubble(failedWith, messageText)]);
          announce(text.a11y.failed);
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
        failure: failedWith ?? undefined,
        // The malformed check above may have replaced a broken reply with the
        // generic line. That is a failure like any other, so it gets the same
        // way out of it.
        retry: aiContent === text.genericError ? messageText : undefined,
      };

      // Both in one go. React batches adjacent updates, so the finished bubble
      // replaces the streaming one in a single paint rather than leaving a
      // frame with neither on screen.
      setMessages(prev => [...prev, newAiMessage]);
      setStreaming(null);
      announce(incomplete ? text.a11y.stopped : text.a11y.answerReceived);

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
          .then(() => { if (isFirstTurn) nameConversation(currentSessionId); })
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
      setMessages(prev => [...prev, failureBubble('unreachable', messageText)]);
      announce(text.a11y.failed);
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
        setPhase(null);
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

  /** Ask the same question again, in place of the failure it produced. */
  const handleRetry = (failed: Message) => {
    if (!failed.retry || isLoading) return;
    const question = failed.retry;
    setMessages(prev => prev.filter(m => m.id !== failed.id));
    sendMessage(question, { resend: true });
  };

  /* AssistantBubble is memoised, so it must not be handed a new function on
     every render - that would re-render every answer on screen for every
     keystroke in the input box. The ref is updated after each render, and the
     callback itself never changes. */
  const sendRef = useRef(sendMessage);
  useEffect(() => {
    sendRef.current = sendMessage;
  });
  const askFollowUp = useCallback((question: string) => {
    sendRef.current(question);
  }, []);

  /**
   * Replaces the guessed title with one that says what the thread is about.
   *
   * Fire and forget, after the first answer rather than after the first
   * question: the question alone often does not say what came back, and by
   * this point the user is reading rather than waiting. A failure leaves the
   * guessed title in place, which is what the sidebar has always shown.
   */
  const nameConversation = async (sessionId: string) => {
    try {
      const res = await fetch('/api/chat/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.renamed || typeof data.title !== 'string') return;
      setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, title: data.title } : s)));
    } catch {
      // The conversation is perfectly usable under the name it already has.
    }
  };

  /* ── The conversation list ── */

  const [collapsed, setCollapsed] = useState(false);
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const [sessionQuery, setSessionQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Read after mount rather than in the initial state, so the server-rendered
  // markup and the first client render agree about where the sidebar is.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
      setAgentsCollapsed(localStorage.getItem(AGENTS_COLLAPSED_KEY) === '1');
    } catch { /* storage blocked */ }
  }, []);

  const toggleAgents = () => {
    setAgentsCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(AGENTS_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
      return next;
    });
  };

  const toggleSidebar = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
      return next;
    });
  };

  // Titles only. The message bodies are not loaded here, and searching what is
  // on screen is honest in a way that searching half the data would not be.
  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(s => s.title.toLowerCase().includes(q));
  }, [sessions, sessionQuery]);

  const groupedSessions = useMemo(() => {
    const buckets = new Map<GroupKey, ChatSessionMeta[]>();
    for (const s of filteredSessions) {
      const key = groupFor(s.updatedAt);
      const list = buckets.get(key);
      if (list) list.push(s);
      else buckets.set(key, [s]);
    }
    // Fixed order regardless of what came back first.
    return GROUP_ORDER.filter(k => buckets.has(k)).map(k => [k, buckets.get(k)!] as const);
  }, [filteredSessions]);

  /**
   * A blank conversation with the agent already selected.
   *
   * Everything it touches is a setter or a ref, so it never changes identity -
   * which is what lets the keyboard binding below hold it without re-binding
   * on every keystroke in the composer.
   */
  const startNewChat = useCallback(() => {
    stoppedByUserRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(null);
    setActiveSessionId(null);
    setMessages([]);
    setSessionQuery('');
    setIsSidebarOpen(false);
    textareaRef.current?.focus();
  }, []);

  /** Opens the sidebar if it is folded away, then puts the cursor in search. */
  const focusSearch = useCallback(() => {
    setCollapsed(false);
    setIsSidebarOpen(true);
    // After the paint that un-hides it, or there is nothing to focus yet.
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
  }, []);

  /* Bound on the window rather than the composer, because the composer is
     where the hands are but not always where the focus is.

     Ctrl+K searches, which is where nearly every other tool puts it, so new
     chat takes the shift. That is the cheaper of the two to displace: clicking
     an assistant already starts one. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        // Only stop when there is something to stop. Escape has other jobs -
        // it cancels a rename and closes a panel - and stealing it would
        // break both.
        if (abortRef.current) handleStopGenerating();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        if (event.shiftKey) startNewChat();
        else focusSearch();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStopGenerating, startNewChat, focusSearch]);

  /* A menu that stays open after a click somewhere else is a menu in the way. */
  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [profileOpen]);

  const startRename = (chat: ChatSessionMeta) => {
    setRenamingId(chat.id);
    setRenameDraft(chat.title);
  };

  const commitRename = async (id: string) => {
    const title = renameDraft.trim();
    setRenamingId(null);
    const current = sessions.find(s => s.id === id);
    if (!current || !title || title === current.title) return;

    // Optimistic, and put back if the write fails - a name that looks saved
    // and is not is worse than one that never changed.
    setSessions(prev => prev.map(s => (s.id === id ? { ...s, title } : s)));
    try {
      const res = await fetch(`/api/chat/session/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
    } catch (err) {
      console.error('Failed to rename conversation:', err);
      setSessions(prev => prev.map(s => (s.id === id ? { ...s, title: current.title } : s)));
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



  /* Nothing to draw while the session is being checked, or while the redirect
     to /login is on its way.

     This guard has to come AFTER every hook in the component, not before.
     React identifies a hook by the order it was called in, so a return that
     skips nine of them on the first render and runs them on the second is not
     a shortcut - it is a different component as far as React is concerned, and
     it throws rather than guessing which state belongs to which hook. That is
     exactly what happened: the guard sat above the sidebar and follow-up hooks
     and took the whole app down the moment a session resolved. */
  if (status === 'loading' || status === 'unauthenticated') return null;

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
      {/* Nothing inside a put-away sidebar should be reachable by keyboard. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-gray-50 border-r border-gray-100 flex-shrink-0 flex flex-col h-full overflow-hidden transform transition-all duration-200 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${collapsed ? 'md:w-0 md:min-w-0 md:border-r-0 md:-translate-x-full' : ''}`}
        aria-hidden={collapsed ? true : undefined}
      >

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
            <h1 className="text-lg font-bold text-gray-900 tracking-tight flex-1 min-w-0">
              {text.sidebarTitle}{' '}
              <BetaBadge className="-translate-y-0.5" />
            </h1>
            <button
              onClick={toggleSidebar}
              aria-label={text.sidebar.collapse}
              title={text.sidebar.collapse}
              className="hidden md:flex p-1.5 -mr-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <PanelLeftClose size={17} />
            </button>
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

        {/* Agent List.
            Scrolls only while the subordinates are unfolded. Folded, the row
            is short enough not to need it - and overflow-y-auto would clip
            the name pill that hangs below each icon. */}
        <div className={`flex-none max-h-[40%] px-4 pt-3 pb-1 ${agentsCollapsed ? '' : 'overflow-y-auto'}`}>
          {masterAgent && (
            <>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
                {text.masterAgentLabel}
              </div>
              <AgentButton
                agent={masterAgent}
                isActive={activeAgentId === masterAgent.id && activeSessionId === null}
                onPick={pickAgent}
              />
            </>
          )}

          <AgentSection
            label={text.agentsLabel}
            agents={subordinateAgents}
            activeAgentId={activeAgentId}
            activeSessionId={activeSessionId}
            collapsed={agentsCollapsed}
            onToggle={toggleAgents}
            onPick={pickAgent}
          />
        </div>
        
        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 mt-2 border-t border-gray-100 pt-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
            {text.sidebar.history}
          </div>

          {/* Always present once there is anything to search, because the
              shortcut that focuses it is always bound - a key that sometimes
              does nothing is worse than no key. */}
          {sessions.length > 0 && (
            <div className="relative mb-1 group/search">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <input
                ref={searchRef}
                value={sessionQuery}
                onChange={e => setSessionQuery(e.target.value)}
                placeholder={text.sidebar.search}
                aria-label={text.sidebar.search}
                className="peer w-full pl-7 pr-12 py-1.5 rounded-lg border border-gray-200 bg-white text-xs
                           text-gray-600 placeholder-gray-300 focus:outline-none focus:border-nesr-green/40"
              />
              {sessionQuery ? (
                <button
                  onClick={() => setSessionQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-300 hover:text-gray-500"
                >
                  <X size={12} />
                </button>
              ) : (
                /* Gone the moment it is being used, where it would only be
                   telling someone how to do what they are already doing. */
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border
                             border-gray-200 bg-gray-50 px-1 py-px text-[9.5px] font-medium tracking-wide
                             text-gray-300 transition-opacity peer-focus:opacity-0"
                >
                  Ctrl K
                </kbd>
              )}
            </div>
          )}

          {groupedSessions.length === 0 && (
            <p className="px-2 py-4 text-xs text-gray-400">
              {sessionQuery ? text.sidebar.noMatches : text.sidebar.empty}
            </p>
          )}

          {groupedSessions.map(([group, chats]) => (
            <div key={group}>
              <div className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider px-2 pt-3 pb-1">
                {text.sidebar.groups[group]}
              </div>
              <div className="space-y-1">
                {chats.map(chat => {
                  const chatAgent = agents.find(a => a.id === chat.botId);
                  const isActive = activeSessionId === chat.id;
                  const isRenaming = renamingId === chat.id;

                  const ChatIcon = chatAgent?.icon;
                  const long = chat.title.length > MARQUEE_AFTER;

                  return (
                    <div
                      key={chat.id}
                      onClick={() => { if (!isRenaming) loadSessionHistory(chat.id, chat.botId); }}
                      title={chat.title}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-[12.5px] font-medium relative group cursor-pointer ${isActive ? 'bg-nesr-green/10 text-gray-900 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-1 bg-nesr-green rounded-r-md" />
                      )}

                      {/* Which assistant answered, as its own icon rather than
                          a second line of text underneath. The name was
                          costing every row twice its height to say something
                          the icon says at a glance. */}
                      {ChatIcon && !isRenaming && (
                        <ChatIcon
                          size={13}
                          aria-label={chatAgent?.name}
                          className={`shrink-0 ${isActive ? 'text-nesr-green' : 'text-gray-300 group-hover:text-gray-500'}`}
                        />
                      )}

                      <div className="min-w-0 flex-1 overflow-hidden text-left">
                        {isRenaming ? (
                          /* Escape has to cancel without saving, so the draft
                             is dropped before the blur handler can commit it. */
                          <input
                            value={renameDraft}
                            autoFocus
                            onClick={e => e.stopPropagation()}
                            onChange={e => setRenameDraft(e.target.value)}
                            onBlur={() => commitRename(chat.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                              if (e.key === 'Escape') { setRenamingId(null); setRenameDraft(''); }
                            }}
                            title={text.sidebar.renameHint}
                            className="w-full px-1 py-0.5 rounded border border-nesr-green/40 bg-white
                                       text-[12.5px] text-gray-800 focus:outline-none"
                          />
                        ) : (
                          /* A long title scrolls past on hover. The second
                             copy is what makes the loop seamless; it is
                             hidden from screen readers so the title is not
                             read out twice. */
                          <div className="w-full overflow-hidden chat-title-clip">
                            <div className={`chat-title-track ${long ? 'is-long' : ''} ${isActive ? 'font-semibold text-nesr-green' : ''}`}>
                              <span>{chat.title}</span>
                              {long && <span aria-hidden="true">{chat.title}</span>}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Over the title, not beside it. These are wanted for
                          a second every few weeks; the title is wanted every
                          time the list is read. */}
                      {!isRenaming && (
                        <div
                          className={`absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5
                                      opacity-0 transition-opacity duration-150
                                      group-hover:opacity-100 group-focus-within:opacity-100
                                      ${isActive ? 'bg-nesr-green/10' : 'bg-gray-100'} rounded-md pl-1`}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); startRename(chat); }}
                            aria-label={text.sidebar.rename}
                            title={text.sidebar.rename}
                            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-200/70 hover:text-gray-700"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteSession(chat.id); }}
                            aria-label="Delete chat"
                            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* User Profile + Sign Out */}
        <div ref={profileRef} className="relative p-3 border-t border-gray-100 bg-gray-50/50">

          {/* Signing out is a once-a-day action at most, and it was sitting
              permanently under a list people read all day. It lives behind the
              profile now, which is where everything else puts it. */}
          {profileOpen && (
            <div
              role="menu"
              className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border
                         border-gray-200 bg-white p-1 shadow-lg
                         animate-in fade-in slide-in-from-bottom-1 duration-150"
            >
              <button
                role="menuitem"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm
                           text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <LogOut size={15} className="text-gray-400 transition-colors group-hover:text-red-500" />
                <span className="font-medium">{text.signOutButton}</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setProfileOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors
                        ${profileOpen ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
          >
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
            <ChevronUp
              size={14}
              className={`shrink-0 text-gray-300 transition-transform duration-200 ${profileOpen ? '' : 'rotate-180'}`}
            />
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
              aria-label={text.sidebar.expand}
              className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <Menu size={20} />
            </button>

            {/* The way back in on a wide screen. It lives in the header rather
                than floating over the conversation, so it is in the same place
                whether the sidebar is open or shut. */}
            {collapsed && (
              <button
                onClick={toggleSidebar}
                aria-label={text.sidebar.expand}
                title={text.sidebar.expand}
                className="hidden md:flex p-2 -ml-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <PanelLeftOpen size={18} />
              </button>
            )}

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
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-8 pb-32 md:pb-40"
        >

          {loadingHistory ? (
            <HistorySkeleton />
          ) : messages.length === 0 ? (
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
                      <div className="group flex flex-col items-end">
                        <div
                          className="relative px-4 py-2.5 text-[13.5px] leading-[1.6] bg-nesr-green text-white rounded-xl rounded-tr-md"
                        >
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        </div>
                        {/* Iterating on a question is most of how anyone uses
                            this - the same question, one country over. Putting
                            it back in the box is enough; it is sent as a new
                            turn rather than rewriting the one above, so the
                            conversation stays an honest record of what was
                            actually asked. */}
                        <button
                          onClick={() => handleSuggestionClick(msg.content)}
                          aria-label={text.editQuestion}
                          title={text.editQuestion}
                          className="mt-0.5 mr-1 p-1 rounded-md text-slate-300 hover:text-slate-500
                                     hover:bg-slate-100 transition-all duration-150
                                     opacity-40 sm:opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    ) : msg.retry ? (
                      <div className="relative px-4 py-2.5 text-[13.5px] leading-[1.6] bg-red-50 text-red-600 rounded-xl rounded-tl-md border border-red-100">
                        <p>{msg.content}</p>
                        <button
                          onClick={() => handleRetry(msg)}
                          disabled={isLoading}
                          className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-md
                                     border border-red-200 bg-white text-[11.5px] font-medium text-red-600
                                     hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          <RefreshCw size={11} />
                          {text.tryAgain}
                        </button>
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
                        initialReason={msg.feedbackReason ?? null}
                        initialNote={msg.feedbackNote ?? null}
                        incomplete={msg.incomplete}
                        failure={msg.failure}
                        onAsk={askFollowUp}
                        onAnnounce={announce}
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
                  {/* The rotating word only until the agent says where it has
                      got to, which is about a second in. After that the word
                      would be saying less than the line next to it. */}
                  {phase ? (
                    <PhaseIndicator phase={phase} agentId={activeAgentId} />
                  ) : (
                    <ThinkingIndicator agentId={activeAgentId} />
                  )}
                </div>
              )}

              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}

        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pt-0 pointer-events-none bg-gradient-to-t from-white via-white/80 to-transparent z-20">
          <div className="max-w-[700px] lg:max-w-6xl xl:max-w-7xl mx-auto pointer-events-auto mt-4">

            {/* Only while the reader has scrolled away from it. Scrolling up
                mid-answer stops the view following along, which is right - but
                without this there is no way back except scrolling by hand
                against text that is still growing. */}
            {showJump && messages.length > 0 && (
              <div className="flex justify-center mb-2">
                <button
                  onClick={jumpToLatest}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur
                             border border-gray-200 shadow-md text-[11.5px] font-medium text-gray-500
                             hover:text-nesr-green hover:border-nesr-green/40 transition-colors"
                >
                  <ArrowDown size={12} />
                  {text.jumpToLatest}
                </button>
              </div>
            )}

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

      {/* Everything the interface knows and does not show: which agent is
          working, that an answer arrived, that a rating saved. Visually
          nothing; to a screen reader it is the difference between a page that
          narrates itself and ninety seconds of silence. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

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
