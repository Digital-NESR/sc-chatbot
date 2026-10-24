'use client';

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './markdownComponents';

/**
 * An answer that is still arriving.
 *
 * The problem this solves: ReactMarkdown reparses the entire document every
 * time its content changes. At ten commits a second on a long answer that is
 * the same table being parsed from scratch a hundred times, and the tab
 * stutters badly enough to be worse than the spinner it replaced.
 *
 * So the text is cut into Markdown blocks and each one rendered by a memoised
 * child. A block that has stopped changing - which is every block but the last
 * one - keeps the elements it already had and is not parsed again. Only the
 * tail does any work.
 *
 * Used only while a message is streaming. Once it finishes, the normal
 * assistant bubble takes over and brings the table views and actions with it.
 */

const Block = memo(function Block({ markdown }: { markdown: string }) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {markdown}
        </ReactMarkdown>
    );
});

/**
 * Cuts Markdown into blocks on blank lines, which is where Markdown's own
 * block boundaries are - with one exception that matters: a fenced code block
 * may contain blank lines, and splitting inside one turns working code into
 * two broken fences. So fences are tracked rather than assumed away.
 */
export function splitMarkdownBlocks(markdown: string): string[] {
    const lines = markdown.split('\n');
    const blocks: string[] = [];
    let current: string[] = [];
    let inFence = false;

    const flush = () => {
        if (current.length) blocks.push(current.join('\n'));
        current = [];
    };

    for (const line of lines) {
        if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

        if (!inFence && line.trim() === '') {
            flush();
            continue;
        }
        current.push(line);
    }
    flush();
    return blocks;
}

/**
 * Is this block a table that has not finished arriving?
 *
 * A Markdown table contains no blank lines, so a two hundred row table is one
 * block and stays the tail block for as long as it takes to arrive. Parsing it
 * on every tick is the expensive case, and a half-written header row renders
 * as a paragraph that abruptly becomes a table, which looks like a glitch.
 * Showing the raw lines until it closes is both cheaper and more honest about
 * what is happening.
 */
function isGrowingTable(block: string): boolean {
    return block.trimStart().startsWith('|');
}

function StreamingMarkdown({ content }: { content: string }) {
    const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);

    if (!blocks.length) return null;

    const settled = blocks.slice(0, -1);
    const tail = blocks[blocks.length - 1];

    return (
        <>
            {settled.map((block, i) => (
                <Block key={i} markdown={block} />
            ))}

            {isGrowingTable(tail) ? (
                <pre className="my-2 overflow-x-auto text-[11.5px] leading-[1.5] font-mono text-slate-500 whitespace-pre">
                    {tail}
                </pre>
            ) : (
                <Block markdown={tail} />
            )}

            {/* Where the next word will appear. Small, but it is the difference
                between "still writing" and "stopped mid-sentence". */}
            <span
                aria-hidden
                className="inline-block w-[2px] h-[0.95em] align-text-bottom ml-0.5 bg-slate-400 animate-pulse"
            />
        </>
    );
}

export default memo(StreamingMarkdown);
