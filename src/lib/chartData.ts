/**
 * Decides whether a Markdown table from an agent is worth charting, and how.
 *
 * The agents return prose with GFM tables; `parseMarkdownTables` turns those
 * back into `{ headers, rows }`. This module takes it one step further and
 * works out which column is the label, which are measures, and what shape of
 * chart the data is actually asking for.
 *
 * It refuses more often than it accepts, on purpose. A wrong chart carries
 * the same authority as a right one, so when the shape is ambiguous the
 * honest move is to show nothing and leave the table alone.
 *
 * Every rule here was measured against 545 real tables from the message
 * history before being written down - see eval/chart_classifier_dryrun.mjs,
 * which can be re-run after any change to these heuristics.
 */

import type { MarkdownTable } from './markdownTable';
import { looksLikeCountryColumn } from './geoCountries';

export interface NumericCell {
    value: number;
    /** 'SAR', 'EA', '%' and so on, where the cell carried one. */
    unit: string | null;
}

const CURRENCY = /^(SAR|USD|AED|EUR|GBP|QAR|KWD|OMR|EGP|DZD|LYD|XAF|IDR|INR|\$|€|£|﷼)$/i;
const UNIT_WORD = /^(EA|PC|PCS|KG|G|M|MM|CM|L|ML|TON|BOX|SET|ROLL|BAG|DAYS?|LINES?|ITEMS?)$/i;

/**
 * Read one cell as a number, or return null.
 *
 * Handles what SAP and Power BI actually emit: thousands separators, a
 * currency either side, a trailing unit, percentages, and negatives written
 * three different ways - leading minus, parentheses, and the trailing minus
 * that SAP uses and that most parsers miss.
 *
 * Deliberately does NOT expand K/M/B suffixes. 'M' is also metres and a
 * material unit code, and guessing wrong is a millionfold error on an axis.
 */
export function parseNumericCell(raw: string | null | undefined): NumericCell | null {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s || /^(-|—|–|n\/?a|null|#n\/a)$/i.test(s)) return null;

    let unit: string | null = null;
    let negative = false;

    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
    if (/-$/.test(s)) { negative = true; s = s.slice(0, -1).trim(); }
    if (/^-/.test(s)) { negative = true; s = s.slice(1).trim(); }

    /* A price per unit: '$0.53/GAL', '2.00 SAR/GAL', '12.50 USD/TON'.
       Procurement data is full of these and none of them parsed, which cost a
       supplier comparison its whole chart: the only two columns worth plotting
       were both rates.

       The denominator must be letters. That is what keeps '1/2' and
       '27/07/2025' out - in both the part after the slash is a number, so
       neither is a rate and both stay unparseable, which is correct. */
    let per: string | null = null;
    const rate = s.match(/^(.*?)\s*\/\s*([A-Za-z]{1,6})\.?$/);
    if (rate && rate[1]) { per = rate[2].toUpperCase(); s = rate[1].trim(); }

    const parts = s.split(/\s+/);
    if (parts.length > 1 && CURRENCY.test(parts[0])) {
        unit = parts.shift()!.toUpperCase();
        s = parts.join(' ');
    }
    if (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (CURRENCY.test(last) || UNIT_WORD.test(last)) {
            unit = unit ?? last.toUpperCase();
            parts.pop();
            s = parts.join(' ');
        }
    }
    s = s.trim();

    const sym = s.match(/^([$€£﷼])\s*(.+)$/);
    if (sym) { unit = unit ?? sym[1]; s = sym[2].trim(); }
    if (/%$/.test(s)) { unit = '%'; s = s.slice(0, -1).trim(); }

    // Only strip commas in conventional thousands grouping, so '1,2,3' stays
    // unparseable rather than silently becoming 123.
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;

    const value = Number(s);
    if (!Number.isFinite(value)) return null;

    // '$' per 'GAL' is one unit, '$/GAL'. Keeping them joined means a column
    // of $/GAL and a column of $/TON are correctly seen as different scales.
    if (per) unit = unit ? `${unit}/${per}` : `/${per}`;

    return { value: negative ? -value : value, unit };
}

// A header is judged on its TRAILING noun, never on a word it merely
// contains. Matching 'po' anywhere threw out 'Open PO Value (USD)', 'PO Count'
// and 'Line Count', which was most of why 191 of 545 tables appeared to have
// no measure at all.
const stripParens = (h: string) => h.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
const MEASURE_TAIL = /\b(count|value|total|amount|qty|quantity|spend|cost|price|sum|avg|average|score|days?|lines|units|rows|share|percent|balance|outstanding|stock|weight|similarity)\s*$/i;
const ID_TAIL = /\b(id|code|no|number|ref|sku|doc|batch|key)\.?\s*$/i;
const ID_WHOLE = /^(material|plant|po|pr|year|item|line|rank|#|s\/?n)$/i;

function headerKind(raw: string): 'id' | 'measure' | 'neutral' {
    const h = stripParens(raw);
    if (ID_WHOLE.test(h)) return 'id';
    if (MEASURE_TAIL.test(h)) return 'measure';
    if (ID_TAIL.test(h)) return 'id';
    return 'neutral';
}

/** 1, 2, 3 in order is a row number or a rank, not something to plot. */
function isSequence(values: number[]): boolean {
    if (values.length < 3) return false;
    return values.every((v, i) => Number.isInteger(v) && v === values[0] + i);
}

type Column =
    | { kind: 'empty'; header: string; index: number }
    | { kind: 'measure'; header: string; index: number; unit: string | null }
    | { kind: 'label'; header: string; index: number; isSeq: boolean; distinct: number; n: number };

/**
 * A column of numbers that are names rather than quantities.
 *
 * Long, distinct, round numbers are a key. Judged on the cells that parse
 * rather than on all of them, because a `Successor` column of material numbers
 * has a dash wherever there is no successor, and requiring every cell to parse
 * let the whole column through as a measure. Nothing is lost by being strict:
 * a column that really is a quantity almost always says so in its header, and
 * a measure-sounding header skips the shape tests entirely.
 *
 * Shared with the grid, which left-aligns an identifier and right-aligns a
 * quantity. The two have to agree, or a column charts as a measure while
 * sitting on the left of its own table like a label.
 */
function looksLikeIdentifier(header: string, cells: string[], ok: NumericCell[]): boolean {
    const hk = headerKind(header);
    if (hk === 'id') return true;
    if (hk === 'measure') return false;

    if (cells.some(v => /^0\d+$/.test(v.replace(/[^0-9]/g, '')))) return true;

    const ints = ok.filter(p => Number.isInteger(p.value));
    return (
        ok.length >= 3 &&
        ints.length / ok.length >= 0.8 &&
        ints.filter(p => String(Math.abs(p.value)).length >= 6).length / ok.length >= 0.8 &&
        new Set(ok.map(p => p.value)).size / ok.length >= 0.9
    );
}

function classifyColumn(headers: string[], rows: string[][], index: number): Column {
    const header = headers[index] ?? '';
    const cells = rows.map(r => (r[index] ?? '').trim()).filter(Boolean);
    if (!cells.length) return { kind: 'empty', header, index };

    const ok = cells.map(parseNumericCell).filter((p): p is NumericCell => p !== null);
    const ratio = ok.length / cells.length;
    const units = new Set(ok.map(p => p.unit).filter(Boolean));

    const sequence = isSequence(ok.map(p => p.value));

    // A column that is blank for most rows is not a measure of those rows.
    // `Successor` is the example: five material numbers against forty rows,
    // which charted as five bars and thirty-five zeros. Missing is not zero,
    // and a chart has no way to draw the difference.
    const covered = cells.length / Math.max(1, rows.length);

    // An explicitly measure-sounding header beats the shape heuristics: a
    // 'Line Count' of long distinct integers is still a count.
    const identifier = looksLikeIdentifier(header, cells, ok);

    if (ratio >= 0.8 && covered >= 0.6 && !identifier && !sequence && units.size <= 1) {
        return { kind: 'measure', header, index, unit: [...units][0] ?? null };
    }
    return {
        kind: 'label', header, index, isSeq: sequence,
        distinct: new Set(cells).size, n: cells.length,
    };
}

/** A totals row would dwarf every real bar, so it never reaches the chart. */
const TOTALS = /^(total|grand total|sum|subtotal|overall)\b/i;

/**
 * A summary row rather than one of the rows being summarised.
 *
 * The chart drops it; the grid keeps it but pins it below the sort, because a
 * total that sorts into the middle of its own column is nonsense.
 */
export function isTotalsRow(row: string[]): boolean {
    return TOTALS.test((row[0] ?? '').trim());
}

/** How a column reads, for a table being shown rather than charted. */
export interface ColumnShape {
    /** Enough cells parse as numbers for the column to sort numerically. */
    numeric: boolean;
    /** Right-aligned, tabular figures: a quantity, not an identifier. */
    alignRight: boolean;
}

/**
 * How each column of a table should be lined up and sorted.
 *
 * Looser than `classifyColumn`, deliberately. That one decides what is safe to
 * plot, and refuses a column of mixed units or one that is mostly blank. Both
 * of those still sort and still line up on the right - a price in $/GAL beside
 * one in $/LB cannot share an axis, but it is still a number, and reading a
 * column of numbers is exactly what the alignment is for.
 */
export function columnShapes(table: MarkdownTable): ColumnShape[] {
    return table.headers.map((header, i) => {
        const cells = table.rows.map(r => (r[i] ?? '').trim()).filter(Boolean);
        if (!cells.length) return { numeric: false, alignRight: false };

        const ok = cells.map(parseNumericCell).filter((p): p is NumericCell => p !== null);
        if (ok.length / cells.length < 0.8) return { numeric: false, alignRight: false };

        return { numeric: true, alignRight: !looksLikeIdentifier(header, cells, ok) };
    });
}

/**
 * Sorts a date label. A time axis has to run left to right in time; the agents
 * return newest first, so without this a trend reads backwards.
 */
function temporalKey(label: string): number {
    const s = label.trim();
    const q = s.match(/^q([1-4])[ -]?(\d{4})$/i);
    if (q) return Date.UTC(Number(q[2]), (Number(q[1]) - 1) * 3, 1);
    const iso = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] ?? '1'));
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
}

/** Dates the agents actually emit, which are what justify a line rather than bars. */
const TEMPORAL =
    /^(\d{4}-\d{2}(-\d{2})?|\d{1,2}[-/ ](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/ ]\d{2,4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ -]\d{4}|q[1-4][ -]?\d{4})$/i;

export type ChartKind = 'bar' | 'horizontalBar' | 'line' | 'pie' | 'map' | 'compare';

export interface ChartableTable {
    chartable: true;
    /** Rows with any totals row removed, label and measures already parsed. */
    data: Array<{ label: string } & Record<string, string | number>>;
    labelHeader: string;
    measures: Array<{ header: string; unit: string | null }>;
    /** The measures to draw together by default - see `sharedScale`. */
    coplot: string[];
    /** True when the label column holds countries, so a map is worth offering. */
    mappable: boolean;
    /**
     * Every row, for the map only.
     *
     * `data` is capped at MAX_PLOTTED because a bar chart runs out of axis.
     * A map does not - it has room for every country - and dropping rows there
     * is far worse than on a bar chart, because an omitted country is drawn in
     * the no-data grey and reads as "nothing here" rather than "not shown".
     * Populated only when mappable, so it costs nothing otherwise.
     */
    mapData: Array<{ label: string } & Record<string, string | number>>;
    /** True when there are few enough rows to put side by side and compare. */
    comparable: boolean;
    suggested: ChartKind;
    rowCount: number;
    /** Set when a totals row was excluded, so the panel can say so. */
    droppedTotals: number;
    /** Set when only the top N are plotted, so the panel can say so. */
    truncatedFrom: number | null;
}

export interface UnchartableTable {
    chartable: false;
    reason: string;
}

export type TableAnalysis = ChartableTable | UnchartableTable;

/**
 * How many categories get plotted.
 *
 * Set by what fits the panel without scrolling rather than by what recharts
 * can draw. Past this the value axis scrolls off the bottom of a horizontal
 * bar chart, which leaves the bars with nothing to read them against. The
 * caption says how many rows were left out, and the table still has them all.
 */
const MAX_PLOTTED = 15;
const MAX_ROWS = 200;

/**
 * Which measures can honestly share one y-axis with the first one.
 *
 * `Country | PO Count | Line Count | Outstanding Value (USD)` is the case this
 * exists for: 1,827 and 6,899 next to 309,975,197. Drawn together on one axis
 * the two counts are a flat line along the bottom and the chart says nothing.
 * The alternative - a second y-axis - is worse, because two scales behind one
 * picture invite comparisons that are not there.
 *
 * So the default is the measures within about one order of magnitude of the first.
 * The rest stay available in the picker: unticking a measure is a decision the
 * user makes knowingly, which is not true of a chart that silently flattens one.
 */
const SCALE_RATIO = 20;

function sharedScale(
    measures: Array<{ header: string }>,
    data: Array<Record<string, string | number>>,
): string[] {
    const typical = (header: string) => {
        const vs = data
            .map(d => Math.abs(Number(d[header])))
            .filter(v => Number.isFinite(v) && v > 0)
            .sort((a, b) => a - b);
        return vs.length ? vs[Math.floor(vs.length / 2)] : 0;
    };

    const base = typical(measures[0].header);
    if (!base) return measures.map(m => m.header);

    return measures
        .filter((m, i) => {
            if (i === 0) return true;
            const v = typical(m.header);
            return v > 0 && v / base <= SCALE_RATIO && base / v <= SCALE_RATIO;
        })
        .map(m => m.header);
}

export function analyzeTable(table: MarkdownTable): TableAnalysis {
    const rows = table.rows.filter(r => !isTotalsRow(r));
    const droppedTotals = table.rows.length - rows.length;

    if (rows.length < 3) return { chartable: false, reason: `only ${rows.length} rows of data` };
    if (rows.length > MAX_ROWS) return { chartable: false, reason: `${rows.length} rows is too many to chart` };

    const cols = table.headers.map((_, i) => classifyColumn(table.headers, rows, i));
    const found = cols.filter((c): c is Extract<Column, { kind: 'measure' }> => c.kind === 'measure');

    // Lead with the column the table is sorted by. The agents order a result
    // by whatever was asked about, so a monotonic measure is the question
    // itself; taking the leftmost one instead charted PO line counts for
    // "top suppliers by spend", which answers something nobody asked.
    const sortedBy = found.findIndex(m => {
        const vs = rows.map(r => parseNumericCell(r[m.index])?.value);
        if (vs.length < 4 || vs.some(v => v === undefined)) return false;
        const n = vs as number[];
        // Mostly-distinct, or a near-constant column that happens to drift one
        // way counts as "sorted". `In Transit` reading 1,1,1,0,0,0 is not what
        // the table was ordered by.
        if (new Set(n).size < Math.max(4, Math.ceil(n.length * 0.6))) return false;
        const down = n.every((v, i) => i === 0 || v <= n[i - 1]);
        const up = n.every((v, i) => i === 0 || v >= n[i - 1]);
        return down || up;
    });
    const measures = sortedBy > 0
        ? [found[sortedBy], ...found.filter((_, i) => i !== sortedBy)]
        : found;

    // Prefer a label a human reads. A supplier code and a supplier name are
    // both unique; only one of them means anything on an axis.
    const candidates = cols.filter(
        (c): c is Extract<Column, { kind: 'label' }> =>
            c.kind === 'label' && !c.isSeq && c.distinct / Math.max(1, c.n) >= 0.7,
    );
    const readable = (h: string) => /\b(name|description|desc|title)\b/i.test(h);
    const labelCol =
        candidates.find(c => readable(c.header)) ??
        candidates.find(c => !ID_TAIL.test(stripParens(c.header))) ??
        candidates[0];
    const labelIndex = labelCol?.index ?? 0;

    const labels = rows.map(r => (r[labelIndex] ?? '').trim());
    const dupRatio = 1 - new Set(labels).size / labels.length;
    // Repeated labels mean one bar per PO line rather than per supplier.
    // Aggregating would change the numbers the user is reading on screen, so
    // refuse instead and leave the table as the answer.
    if (dupRatio > 0.2) {
        return { chartable: false, reason: `${Math.round(dupRatio * 100)}% of labels repeat` };
    }

    /* No numeric column at all.
       That is a real refusal for a chart - there is nothing to plot - but not
       for the side-by-side cards, which compare whatever the columns hold,
       text included. A three-column answer about three suppliers is exactly
       what that view is for, and refusing the whole table because the prices
       came back in two different units left it with no switcher at all.

       Three columns minimum: a two-column table is a list, and a list does
       not need cards. */
    if (!found.length) {
        if (table.headers.length < 3 || rows.length > 12) {
            return { chartable: false, reason: 'no numeric column to plot' };
        }
        const bare = rows.map(r => ({ label: (r[labelIndex] ?? '').trim() || '(blank)' }));
        return {
            chartable: true,
            data: bare,
            mapData: bare,
            labelHeader: table.headers[labelIndex] ?? 'Label',
            measures: [],
            coplot: [],
            mappable: false,
            comparable: true,
            suggested: 'compare',
            rowCount: rows.length,
            droppedTotals,
            truncatedFrom: null,
        };
    }

    const primary = measures[0];
    const primaryValues = rows
        .map(r => parseNumericCell(r[primary.index]))
        .filter((p): p is NumericCell => p !== null)
        .map(p => p.value);
    if (new Set(primaryValues).size <= 1) {
        return { chartable: false, reason: 'every value is the same' };
    }

    const temporal = labels.every(l => TEMPORAL.test(l));
    const mappable = looksLikeCountryColumn(table.headers[labelIndex] ?? '', labels);

    /* Side by side, a card each.
       The cards wrap at four across, so nine suppliers are three rows of
       cards and perfectly readable - the old cap of eight refused exactly the
       kind of answer this view is for, and refused it silently. Twelve is
       where three rows of cards becomes more scrolling than the table it
       replaced. */
    const comparable = !temporal && rows.length >= 2 && rows.length <= 12;

    // Largest first for categories, oldest first for dates.
    const ordered = rows
        .map((r, i) => ({ r, i }))
        .sort((a, b) => {
            if (temporal) {
                return temporalKey((a.r[labelIndex] ?? '').trim())
                     - temporalKey((b.r[labelIndex] ?? '').trim());
            }
            const av = parseNumericCell(a.r[primary.index])?.value ?? 0;
            const bv = parseNumericCell(b.r[primary.index])?.value ?? 0;
            return bv - av;
        });

    // Categories are sorted biggest first, so the head is the interesting end.
    // A time series is sorted oldest first, so the tail is.
    const truncatedFrom = ordered.length > MAX_PLOTTED ? ordered.length : null;
    const plotted = !truncatedFrom
        ? ordered
        : temporal
          ? ordered.slice(-MAX_PLOTTED)
          : ordered.slice(0, MAX_PLOTTED);

    const toRows = (from: { r: string[]; i: number }[]) =>
        from.map(({ r }) => {
            const row: { label: string } & Record<string, string | number> = {
                label: (r[labelIndex] ?? '').trim() || '(blank)',
            };
            for (const m of measures) row[m.header] = parseNumericCell(r[m.index])?.value ?? 0;
            return row;
        });

    const data = toRows(plotted);

    const allPositive = primaryValues.every(v => v >= 0);
    const longLabels = data.some(d => d.label.length > 18);
    const partOfWhole =
        measures.length === 1 &&
        allPositive &&
        data.length <= 8 &&
        (/%|share|split|mix|percent/i.test(primary.header) ||
            Math.abs(primaryValues.reduce((a, b) => a + b, 0) - 100) < 1);

    const suggested: ChartKind = temporal
        ? 'line'
        : partOfWhole
          ? 'pie'
          : longLabels || data.length > 12
            ? 'horizontalBar'
            : 'bar';

    const mapData = mappable && truncatedFrom ? toRows(ordered) : data;

    return {
        chartable: true,
        data,
        mapData,
        labelHeader: table.headers[labelIndex] ?? 'Label',
        measures: measures.map(m => ({ header: m.header, unit: m.unit })),
        coplot: sharedScale(measures, data),
        mappable,
        comparable,
        suggested,
        rowCount: rows.length,
        droppedTotals,
        truncatedFrom,
    };
}

/** True when at least one table in the message is worth offering a chart for. */
export function hasChartableTable(tables: MarkdownTable[]): boolean {
    return tables.some(t => analyzeTable(t).chartable);
}
