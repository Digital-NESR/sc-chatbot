import { ExternalLink } from 'lucide-react';

/**
 * Claude API usage and cost.
 *
 * This was a custom dashboard built on Anthropic's Usage and Cost Admin API.
 * It is now a Power BI embed instead, which removes the need for an Admin API
 * key entirely and puts the numbers wherever the rest of the reporting lives.
 *
 * The report is embedded with autoAuth, so Power BI authenticates the viewer
 * itself against the NESR tenant. Anyone without a Power BI licence or access
 * to the report sees Power BI's own sign-in or access-denied screen rather
 * than anything this page controls - hence the "open in Power BI" fallback.
 */

const REPORT_ID = '1ae8c96b-278d-4d48-aa30-47476bb6c7f5';
const TENANT_ID = '5f13d1c2-10ac-49b8-a85e-4bb3d91135b9';
const EMBED_URL =
  `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}` +
  `&autoAuth=true&ctid=${TENANT_ID}`;
const OPEN_URL = `https://app.powerbi.com/groups/me/reports/${REPORT_ID}`;

export const metadata = { title: 'API Cost | Admin' };

export default function UsagePage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Claude API Usage</h2>
          <p className="text-sm text-slate-500">
            Spend and token usage across every bot on the account, including the HSE bot.
          </p>
        </div>
        <a
          href={OPEN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200
                     bg-white text-sm text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
        >
          Open in Power BI
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Sized to fill the viewport below the admin header rather than pinned to
          the report's own 1140x541, so it stays usable on a laptop screen. */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
        <iframe
          title="Claude API Usage"
          src={EMBED_URL}
          className="w-full h-[calc(100vh-13rem)] min-h-[520px] border-0"
          allowFullScreen
        />
      </div>

      <p className="text-xs text-slate-400">
        Report is served by Power BI and signs you in against the NESR tenant. If it shows a
        sign-in or access screen, your account needs access to the report rather than to this page.
      </p>
    </div>
  );
}
