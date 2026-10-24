import { siteConfig } from '@/config/site';

/**
 * Says the product is still a beta, wherever it names itself.
 *
 * Deliberately a component rather than the word baked into the title string:
 * the title is also the export filename, the alt text and the browser tab, and
 * a badge glued into all of those reads as part of the name. It also means the
 * day this stops being a beta is one component deleted, not a hunt through the
 * copy.
 */
export default function BetaBadge({
    tone = 'light',
    className = '',
}: {
    /** 'light' on white, 'dark' on the green header and the login screen. */
    tone?: 'light' | 'dark';
    className?: string;
}) {
    const styles =
        tone === 'dark'
            ? 'border-white/30 text-white/80 bg-white/10'
            : 'border-nesr-green/30 text-nesr-green bg-nesr-green/10';

    return (
        <span
            className={`inline-flex items-center rounded-full border px-1.5 py-[1px]
                        text-[10px] font-semibold uppercase tracking-wider align-middle
                        ${styles} ${className}`}
        >
            {siteConfig.text.betaLabel}
        </span>
    );
}
