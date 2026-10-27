/**
 * The guardrail rules, in plain JavaScript.
 *
 * A mirror of src/lib/guardrails/rules.ts, which is TypeScript and cannot be
 * imported by a bare `node` script. Both the dry run and the backfill read
 * THIS file, so there are two copies of the logic in the repo rather than
 * three - and if this one drifts from the TypeScript, every number either
 * script reports is about rules that are not the ones shipping.
 *
 * Change one, change the other.
 */

export const LINK_ALLOWLIST = [
  'nesr.com', 'shipwaves.com', 'app.powerbi.com',
  'sharepoint.com', 'microsoft.com', 'office.com',
];

export const INTERNAL_DOMAIN = 'nesr.com';

export const PROMPT_FINGERPRINTS = [
  'You are the NESR Supply Chain AI orchestrator', 'NEVER INVENT ROWS',
  'EVERY CELL IN EVERY TABLE YOU PRINT', 'SET TRANSACTION READ ONLY', '$fromAI',
  'query_track_db', 'query_materials_db', 'query_sourceguide_db',
  'ask_material_ai', 'ask_track_my_request', 'You must NOT query', 'Hard rules',
];

const hit = (re, t, span = 120) => {
  const m = t.match(re);
  return m ? (m[0] ?? '').trim().slice(0, span) || null : null;
};

export const RULES = [
  {
    id: 'instruction-override', surface: 'input', severity: 'high',
    test: t => hit(/\b(ignore|disregard|forget|override|bypass|skip)\b[^.\n]{0,40}\b(previous|prior|above|earlier|initial|original|all|any|your)\b[^.\n]{0,30}\b(instruction|rule|prompt|direction|guideline|restriction|constraint)/i, t),
  },
  {
    id: 'prompt-extraction', surface: 'input', severity: 'high',
    test: t => hit(/\b(show|print|repeat|reveal|output|display|tell me|what (is|are))\b[^.\n]{0,40}\b(your |the )?(system )?(prompt|instructions|rules|configuration|directive)\b|\brepeat everything (above|before)\b|\bverbatim\b[^.\n]{0,30}\b(prompt|instruction)/i, t),
  },
  {
    id: 'role-reassignment', surface: 'input', severity: 'medium',
    test: t => hit(/\byou are (now|no longer)\b|\b(pretend|roleplay|role-play) (to be|as|that you)\b|\bact as (an?|the) \w+\b|\bdeveloper mode\b|\bjailbreak\b|\bDAN mode\b|\bfrom now on,? you\b/i, t),
  },
  {
    id: 'fake-system-turn', surface: 'input', severity: 'high',
    test: t => hit(/<\|?(im_start|im_end|system|assistant)\|?>|\[\/?INST\]|\[\/?SYS\]|^\s*(system|assistant)\s*:/im, t),
  },
  {
    id: 'encoded-payload', surface: 'input', severity: 'medium',
    test: t => hit(/\b[A-Za-z0-9+/]{60,}={0,2}\b/, t, 60)
      ?? (((t.match(/\\u[0-9a-fA-F]{4}/g) ?? []).length >= 8) ? hit(/(\\u[0-9a-fA-F]{4}){8,}/, t, 60) : null),
  },
  {
    id: 'sql-in-question', surface: 'input', severity: 'medium',
    test: t => hit(/\b(drop\s+table|delete\s+from|insert\s+into|update\s+\w+\s+set|truncate\s+table|union\s+select|alter\s+table|grant\s+(all|select)|pg_read_file|dblink)\b/i, t),
  },
  {
    id: 'exfiltration-request', surface: 'input', severity: 'high',
    test: t => hit(/\b(send|post|upload|email|exfiltrate|forward|transmit|leak)\b[^.\n]{0,50}\b(to|at)\b[^.\n]{0,20}(https?:\/\/|www\.|[\w.-]+@[\w.-]+\.\w+)/i, t),
  },
  {
    id: 'repetition-flood', surface: 'input', severity: 'low',
    test: t => {
      const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 20) return null;
      const counts = new Map();
      for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
      for (const [line, n] of counts) {
        if (n >= 20 && n / lines.length >= 0.5) {
          return `${n} of ${lines.length} lines are "${line.slice(0, 50)}"`;
        }
      }
      return null;
    },
  },
  {
    id: 'prompt-leak', surface: 'output', severity: 'high',
    test: t => PROMPT_FINGERPRINTS.find(f => t.includes(f)) ?? null,
  },
  {
    id: 'credential-shape', surface: 'output', severity: 'high',
    test: t => hit(/\bsk-ant-[\w-]{8,}|\bBearer\s+ey[\w.-]{10,}|\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s"'<]{8,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/, t, 40),
  },
  {
    id: 'bulk-email', surface: 'output', severity: 'medium',
    test: t => {
      const found = t.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? [];
      const internal = [...new Set(
        found.map(e => e.toLowerCase()).filter(e => e.endsWith(`@${INTERNAL_DOMAIN}`)),
      )];
      return internal.length >= 4 ? `${internal.length} internal addresses, e.g. ${internal[0]}` : null;
    },
  },
  {
    id: 'offsite-link', surface: 'output', severity: 'medium',
    test: t => {
      const links = t.match(/\]\(\s*(https?:\/\/[^\s)]+)/gi) ?? [];
      for (const raw of links) {
        const url = raw.replace(/^\]\(\s*/, '');
        let host = '';
        try { host = new URL(url).hostname.toLowerCase(); } catch { return url.slice(0, 80); }
        if (!LINK_ALLOWLIST.some(d => host === d || host.endsWith(`.${d}`))) return url.slice(0, 80);
      }
      return null;
    },
  },
  {
    id: 'markup-in-answer', surface: 'output', severity: 'medium',
    test: t => hit(/<\s*(script|iframe|object|embed|form)\b[^>]{0,60}>|javascript\s*:/i, t, 80),
  },
  {
    id: 'injected-instruction', surface: 'output', severity: 'high',
    test: t => hit(/\b(ignore|disregard)\b[^.\n]{0,30}\b(previous|prior|above)\b[^.\n]{0,20}\b(instruction|prompt)|<\|?im_start\|?>|\bnew instructions?:\s/i, t),
  },
];

/** Reads POSTGRES_URL out of .env.local, so no secret reaches a command line. */
export function connectionStringFromEnvFile(readFileSync) {
  const line = readFileSync('.env.local', 'utf8')
    .replace(/\0/g, '')
    .split(/\r?\n/)
    .find(l => l.startsWith('POSTGRES_URL='));
  return line.slice('POSTGRES_URL='.length).replace(/^"|"$/g, '').trim();
}
