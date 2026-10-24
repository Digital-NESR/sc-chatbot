// Dry run for the chart classifier, against real stored assistant replies.
// Nothing is written. The point is the hit rate: if it misclassifies real
// tables, the feature is not worth building in its current shape.
import { readFileSync } from 'fs';
import pg from 'pg';

const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const t = l.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

// ─────────── parser, ported verbatim from src/lib/markdownTable.ts ───────────
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = []; let current = ''; let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { current += '|'; i++; }
    else if (ch === '`') { inCode = !inCode; current += ch; }
    else if (ch === '|' && !inCode) { cells.push(current); current = ''; }
    else current += ch;
  }
  cells.push(current);
  return cells.map(c => c.trim());
}
const isSeparatorRow = (line) => line.includes('-') &&
  splitRow(line).length > 0 && splitRow(line).every(c => /^:?-+:?$/.test(c));
const cleanCell = (raw) => raw
  .replace(/<br\s*\/?>/gi, ' ').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`([^`]*)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1').replace(/~~([^~]+)~~/g, '$1')
  .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1').replace(/\s+/g, ' ').trim();

function parseMarkdownTables(markdown) {
  if (!markdown || !markdown.includes('|')) return [];
  const tables = []; const lines = markdown.split(/\r?\n/); let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence || !lines[i].includes('|')) continue;
    if (!lines[i + 1] || !isSeparatorRow(lines[i + 1])) continue;
    const headers = splitRow(lines[i]).map(cleanCell);
    if (headers.length === 0) continue;
    const rows = []; let j = i + 2;
    while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== ''
           && !/^\s*(```|~~~)/.test(lines[j])) {
      rows.push(splitRow(lines[j]).map(cleanCell)); j++;
    }
    tables.push({ headers, rows }); i = j - 1;
  }
  return tables;
}

// ─────────────────────────── the classifier under test ───────────────────────
const CURRENCY = /^(SAR|USD|AED|EUR|GBP|QAR|KWD|OMR|EGP|DZD|LYD|XAF|IDR|INR|\$|€|£|﷼)$/i;
const UNIT_WORD = /^(EA|PC|PCS|KG|G|M|MM|CM|L|ML|TON|BOX|SET|ROLL|BAG|DAYS?|LINES?|ITEMS?)$/i;

export function parseNumericCell(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || /^(-|—|–|n\/?a|null|#n\/a)$/i.test(s)) return null;

  let unit = null;
  let negative = false;

  // (1,234.00) and the SAP form 1,234.00-  both mean negative.
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  if (/-$/.test(s)) { negative = true; s = s.slice(0, -1).trim(); }
  if (/^-/.test(s)) { negative = true; s = s.slice(1).trim(); }

  // Currency or unit tokens, leading or trailing.
  const parts = s.split(/\s+/);
  if (parts.length > 1 && CURRENCY.test(parts[0])) { unit = parts.shift().toUpperCase(); s = parts.join(' '); }
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (CURRENCY.test(last) || UNIT_WORD.test(last)) { unit = unit ?? last.toUpperCase(); parts.pop(); s = parts.join(' '); }
  }
  s = s.trim();
  // Symbol stuck to the number: $1,234
  const sym = s.match(/^([$€£﷼])\s*(.+)$/);
  if (sym) { unit = unit ?? sym[1]; s = sym[2].trim(); }
  if (/%$/.test(s)) { unit = '%'; s = s.slice(0, -1).trim(); }

  // Thousands separators only in the conventional grouping.
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -value : value, unit };
}

// A header is judged on its TRAILING noun, not on any word it happens to
// contain. "Open PO Value (USD)" and "PO Count" are measures; the first
// version matched "po" anywhere and threw both away, which is most of why
// 191 tables looked like they had no measure at all.
const stripParens = (h) => h.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
const MEASURE_TAIL = /\b(count|value|total|amount|qty|quantity|spend|cost|price|sum|avg|average|score|days?|lines|units|rows|share|percent|balance|outstanding|stock|weight|similarity)\s*$/i;
const ID_TAIL = /\b(id|code|no|number|ref|sku|doc|batch|key)\.?\s*$/i;
const ID_WHOLE = /^(material|plant|po|pr|year|item|line|rank|#|s\/?n)$/i;

function headerKind(raw) {
  const h = stripParens(raw);
  if (ID_WHOLE.test(h)) return 'id';
  if (MEASURE_TAIL.test(h)) return 'measure';
  if (ID_TAIL.test(h)) return 'id';
  return 'neutral';
}

/** 1,2,3... in order is a row number or a rank, not something to plot. */
function isSequence(values) {
  if (values.length < 3) return false;
  return values.every((v, i) => Number.isInteger(v) && v === values[0] + i);
}

function classifyColumn(headers, rows, c) {
  const cells = rows.map(r => (r[c] ?? '').trim()).filter(Boolean);
  if (!cells.length) return { kind: 'empty' };
  const parsed = cells.map(parseNumericCell);
  const ok = parsed.filter(Boolean);
  const ratio = ok.length / cells.length;
  const units = new Set(ok.map(p => p.unit).filter(Boolean));

  const header = headers[c] ?? '';
  const hk = headerKind(header);
  const leadingZero = cells.some(v => /^0\d+$/.test(v.replace(/[^0-9]/g, '')));
  const longDistinctInts = ok.length === cells.length &&
    ok.every(p => Number.isInteger(p.value)) &&
    new Set(cells).size === cells.length &&
    cells.every(v => v.replace(/\D/g, '').length >= 6);
  const sequence = isSequence(ok.map(p => p.value));

  // A measure-sounding header beats the shape heuristics: a "Line Count" of
  // long distinct integers is still a count.
  const identifier = hk === 'id' || (hk !== 'measure' && (leadingZero || longDistinctInts));

  if (ratio >= 0.8 && !identifier && !sequence && units.size <= 1) {
    return { kind: 'measure', unit: [...units][0] ?? null, ratio, header };
  }
  const why = ratio < 0.8 ? 'not numeric'
    : sequence ? 'sequence (row number or rank)'
    : hk === 'id' ? 'header reads as an identifier'
    : leadingZero ? 'leading zeros (identifier)'
    : longDistinctInts ? 'long distinct integers (identifier)'
    : units.size > 1 ? `mixed units {${[...units].join(',')}}` : 'other';
  return { kind: 'label', why, isSeq: sequence, distinct: new Set(cells).size, n: cells.length, header };
}

const TOTALS = /^(total|grand total|sum|subtotal|overall)\b/i;

function analyzeTable(t) {
  const rows = t.rows.filter(r => !TOTALS.test((r[0] ?? '').trim()));
  const droppedTotals = t.rows.length - rows.length;
  if (rows.length < 3) return { chartable: false, reason: `only ${rows.length} data rows`, droppedTotals };

  const cols = t.headers.map((_, c) => classifyColumn(t.headers, rows, c));
  const measures = cols.map((v, i) => ({ ...v, i })).filter(v => v.kind === 'measure');
  if (!measures.length) return { chartable: false, reason: 'no measure column', droppedTotals, cols };

  // Prefer something a human reads. A supplier code and a supplier name are
  // both valid labels; only one of them means anything on an axis.
  const candidates = cols
    .map((v, i) => ({ ...v, i }))
    .filter(v => v.kind !== 'measure' && v.kind !== 'empty' && !v.isSeq
                 && (v.distinct / Math.max(1, v.n)) >= 0.7);
  const readable = (h) => /\b(name|description|desc|title)\b/i.test(h);
  const named = candidates.find(v => readable(v.header ?? ''))
    ?? candidates.find(v => !ID_TAIL.test(stripParens(v.header ?? '')));
  const label = (named ?? candidates[0])?.i ?? 0;

  const labels = rows.map(r => (r[label] ?? '').trim());
  const dupRatio = 1 - (new Set(labels).size / labels.length);
  if (dupRatio > 0.2) return { chartable: false, reason: `${Math.round(dupRatio * 100)}% duplicate labels`, droppedTotals, cols };

  const vals = rows.map(r => parseNumericCell(r[measures[0].i])).filter(Boolean).map(p => p.value);
  if (new Set(vals).size <= 1) return { chartable: false, reason: 'zero variance', droppedTotals, cols };
  if (rows.length > 200) return { chartable: false, reason: `${rows.length} rows, too many`, droppedTotals, cols };

  return {
    chartable: true, droppedTotals, rows: rows.length,
    label: t.headers[label], measures: measures.map(m => t.headers[m.i]),
  };
}

// ────────────────────────────────── run it ───────────────────────────────────
const c = new pg.Client({
  connectionString: `postgresql://${env.DB_USER}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}?uselibpqcompat=true&sslmode=require`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows: msgs } = await c.query(
  `SELECT id, content FROM "Message" WHERE role='assistant' AND content LIKE '%|%'
   ORDER BY "createdAt" DESC LIMIT 400`);
await c.end();

let tTotal = 0, tChart = 0;
const reasons = {}, samples = [];
for (const m of msgs) {
  for (const t of parseMarkdownTables(m.content)) {
    if (!t.rows.length) continue;
    tTotal++;
    const a = analyzeTable(t);
    if (a.chartable) {
      tChart++;
      if (samples.length < 14) samples.push({ ok: true, h: t.headers, a });
    } else {
      reasons[a.reason] = (reasons[a.reason] || 0) + 1;
      if (samples.filter(s => !s.ok).length < 14) samples.push({ ok: false, h: t.headers, a });
    }
  }
}

console.log(`messages scanned : ${msgs.length}`);
console.log(`tables found     : ${tTotal}`);
console.log(`chartable        : ${tChart}  (${tTotal ? Math.round(tChart / tTotal * 100) : 0}%)`);
console.log('\nreasons for refusing:');
for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`);

console.log('\n── CHARTABLE (check these look right) ──');
for (const s of samples.filter(s => s.ok)) {
  console.log(`  [${s.h.join(' | ')}]`);
  console.log(`     label="${s.a.label}" measures=[${s.a.measures.join(', ')}] rows=${s.a.rows}` +
              (s.a.droppedTotals ? ` (dropped ${s.a.droppedTotals} totals row)` : ''));
}
console.log('\n── REFUSED (check none of these SHOULD have charted) ──');
for (const s of samples.filter(s => !s.ok)) {
  console.log(`  [${s.h.join(' | ')}]  -> ${s.a.reason}`);
}
