import { type Components } from 'react-markdown';

/**
 * How an answer's Markdown is rendered, everywhere it is rendered.
 *
 * Module scope on purpose: a fresh object per render would give ReactMarkdown
 * new component identities every time and remount the whole tree, which is
 * merely wasteful on a finished message and visibly awful on a streaming one.
 *
 * Lives here rather than in page.tsx because the streaming view and the
 * finished view both use it, and a table that restyles itself the moment an
 * answer completes would be its own bug.
 */
export const markdownComponents: Components = {
    p: ({ children }) => (
        <p className="mb-1.5 last:mb-0 whitespace-pre-wrap">{children}</p>
    ),
    table: ({ children }) => (
        <div className="w-full overflow-x-auto my-3 rounded-lg border border-slate-300">
            <table className="w-full text-[13px] text-left border-collapse">
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
        <th className="px-3 py-1.5 font-semibold whitespace-nowrap border-b border-slate-300">{children}</th>
    ),
    td: ({ children }) => (
        <td className="px-3 py-2 border-b border-slate-200 last:border-0 align-top break-words">{children}</td>
    ),
    ul: ({ children }) => (
        <ul className="list-disc list-inside mb-1.5 space-y-0.5 pl-1">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal list-inside mb-1.5 space-y-0.5 pl-1">{children}</ol>
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
        <pre className="bg-slate-800 text-slate-100 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono border border-slate-700">{children}</pre>
    ),
    h1: ({ children }) => <h1 className="text-base font-bold mb-1.5 mt-2 text-black">{children}</h1>,
    h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-2 text-black">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-1.5 text-slate-800">{children}</h3>,
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
};
