import UsageTabs from './UsageTabs';

/**
 * Claude API usage and cost.
 *
 * Stays a server component purely so it can export `metadata`; the tabs and
 * everything under them are client-side. See UsageTabs for why there are two.
 */

export const metadata = { title: 'API Cost | Admin' };

export default function UsagePage() {
  return <UsageTabs />;
}
