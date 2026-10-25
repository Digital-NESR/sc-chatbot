'use client';

import { useLayoutEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AgentConfig } from '@/config/site';

/**
 * The agent list, and the fold that turns it into a row of icons.
 *
 * The motion is a FLIP: measure where every button is, let React lay the new
 * arrangement out, put everything back where it was with a transform, then
 * release all of them on the next frame. The browser interpolates the
 * transform, so each icon travels along a straight line from its old place to
 * its new one instead of jumping.
 *
 * The container's height is animated in the same breath, which is what carries
 * the chat history underneath smoothly up and down. Animating the height is
 * not decoration: without it the list below would snap to its new position
 * while the icons were still in the air.
 */

/* Fast out of the gate, long settle. The same curve and duration on the
   height, the transforms and the fade, so the whole thing reads as one
   movement rather than three that happen to overlap. */
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const MS = 340;

export function AgentButton({
    agent,
    isActive,
    collapsed = false,
    onPick,
}: {
    agent: AgentConfig;
    isActive: boolean;
    /** Icon only, with the name on hover. */
    collapsed?: boolean;
    onPick: (id: string) => void;
}) {
    return (
        <button
            data-agent={agent.id}
            onClick={() => onPick(agent.id)}
            title={collapsed ? undefined : agent.name}
            aria-label={agent.name}
            className={`relative group flex items-center rounded-lg text-sm font-medium transition-colors ${
                collapsed ? 'w-[52px] shrink-0 justify-center px-0 py-2.5' : 'w-full gap-3 px-3 py-3'
            } ${
                isActive
                    ? 'bg-nesr-green/10 text-gray-900 shadow-sm ring-1 ring-black/5'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
        >
            {/* Active Indicator Border. Pointless on a 52px icon, where the
                tinted background already says it. */}
            {isActive && !collapsed && (
                <div className="absolute left-0 top-1 bottom-1 w-1 bg-nesr-green rounded-r-md" />
            )}

            <agent.icon
                size={20}
                className={`shrink-0 transition-colors ${
                    isActive ? 'text-nesr-green' : 'text-gray-400 group-hover:text-gray-600'
                }`}
            />

            {/* The name. Collapsed, it leaves the flow rather than being
                removed - so the button is already icon-width when the FLIP
                measures it, while the text is still on screen fading out and
                travelling with its icon. Removing it instead would make the
                text vanish a frame before anything moved. */}
            <div
                aria-hidden="true"
                className={`flex flex-col items-start text-left whitespace-nowrap transition-opacity ${
                    collapsed
                        ? 'pointer-events-none absolute left-11 opacity-0 duration-150'
                        : 'relative opacity-100 duration-300'
                }`}
            >
                <span className={isActive ? 'font-semibold text-nesr-green' : ''}>{agent.name}</span>
                {isActive && (
                    <span className="text-[10px] text-gray-500 font-normal opacity-80 leading-tight">
                        {agent.description}
                    </span>
                )}
            </div>

            {/* The name again, as a pill, for the folded row. Below the icon
                rather than beside it: four icons sit shoulder to shoulder and
                a pill to the right of one would cover the next. */}
            {collapsed && (
                <span
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2
                               translate-y-1 whitespace-nowrap rounded-full border border-nesr-green/70
                               bg-white px-2.5 py-1 text-[11px] font-medium text-nesr-green shadow-sm
                               opacity-0 transition-all duration-150
                               group-hover:translate-y-0 group-hover:opacity-100"
                >
                    {agent.name}
                </span>
            )}
        </button>
    );
}

export default function AgentSection({
    label,
    agents,
    activeAgentId,
    activeSessionId,
    collapsed,
    onToggle,
    onPick,
}: {
    label: string;
    agents: readonly AgentConfig[];
    activeAgentId: string;
    activeSessionId: string | null;
    collapsed: boolean;
    onToggle: () => void;
    onPick: (id: string) => void;
}) {
    const boxRef = useRef<HTMLDivElement>(null);

    /* Where every button was, captured on the click that changes the layout.
       It has to be read before React commits, because afterwards the old
       arrangement is gone. */
    const before = useRef<{ rects: Map<string, DOMRect>; height: number } | null>(null);

    const handleToggle = () => {
        const box = boxRef.current;
        if (box) {
            const rects = new Map<string, DOMRect>();
            box.querySelectorAll<HTMLElement>('[data-agent]').forEach(el => {
                if (el.dataset.agent) rects.set(el.dataset.agent, el.getBoundingClientRect());
            });
            before.current = { rects, height: box.getBoundingClientRect().height };
        }
        onToggle();
    };

    useLayoutEffect(() => {
        const snapshot = before.current;
        const box = boxRef.current;
        if (!snapshot || !box) return;
        before.current = null;

        const items = Array.from(box.querySelectorAll<HTMLElement>('[data-agent]'));
        // Read the new height before anything is pinned, or it reads back the
        // value we are about to force on it.
        const to = box.getBoundingClientRect().height;

        // INVERT. Everything goes back to where it was, instantly.
        box.style.transition = 'none';
        box.style.overflow = 'hidden';
        box.style.height = `${snapshot.height}px`;

        for (const el of items) {
            const was = el.dataset.agent ? snapshot.rects.get(el.dataset.agent) : undefined;
            if (!was) continue;
            const now = el.getBoundingClientRect();
            el.style.transition = 'none';
            el.style.transform = `translate(${was.left - now.left}px, ${was.top - now.top}px)`;
        }

        // PLAY. One frame later, so the browser has painted the inverted state
        // and has something to animate away from.
        const frame = requestAnimationFrame(() => {
            box.style.transition = `height ${MS}ms ${EASE}`;
            box.style.height = `${to}px`;
            for (const el of items) {
                el.style.transition = `transform ${MS}ms ${EASE}`;
                el.style.transform = '';
            }
        });

        /* Hand the layout back to CSS once it has arrived. The height has to
           go back to auto - left pinned, the row would not grow if an agent
           were ever added - and overflow has to go back to visible or the
           hover pill is clipped by the box it hangs out of. */
        const settle = setTimeout(() => {
            box.style.transition = '';
            box.style.height = '';
            box.style.overflow = '';
            for (const el of items) {
                el.style.transition = '';
                el.style.transform = '';
            }
        }, MS + 30);

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(settle);
        };
    }, [collapsed]);

    return (
        <div>
            <button
                onClick={handleToggle}
                aria-expanded={!collapsed}
                className="group mt-5 mb-3 flex w-full items-center justify-between rounded px-2 py-0.5
                           text-xs font-semibold uppercase tracking-wider text-gray-400
                           transition-colors hover:text-gray-600"
            >
                <span>{label}</span>
                <ChevronDown
                    size={14}
                    className={`text-gray-300 transition-transform duration-300 group-hover:text-gray-500 ${
                        collapsed ? '-rotate-90' : ''
                    }`}
                    style={{ transitionTimingFunction: EASE }}
                />
            </button>

            <div ref={boxRef}>
                <div className={`flex gap-1 ${collapsed ? 'flex-row' : 'flex-col'}`}>
                    {agents.map(agent => (
                        <AgentButton
                            key={agent.id}
                            agent={agent}
                            isActive={activeAgentId === agent.id && activeSessionId === null}
                            collapsed={collapsed}
                            onPick={onPick}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
