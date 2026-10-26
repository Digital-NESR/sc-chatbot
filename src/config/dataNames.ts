/**
 * What the user sees instead of a table, view, tool or column name.
 *
 * The agents name real objects when they explain themselves - in the "How I
 * got this" note, and in the progress line while they work. Those names leak
 * the schema and mean nothing to a buyer: `core.supplychain` is the purchase
 * orders, and nobody outside this repo could know that.
 *
 * The substitution happens on the rendered text, in the browser. Deliberately
 * not by asking a model to rewrite its own note: that note exists so a reader
 * can check the filter behind an answer, and a model asked to reword it can
 * quietly reword a row count at the same time. A replacement table cannot
 * touch a number, costs nothing, and adds no latency.
 *
 * What is here is the DEFAULT. Anything edited in the Column Dictionary is
 * stored in the database and layered over the top at runtime, so the wording
 * can change without a deploy - see useDisplayNames and /api/display-names.
 */

export interface NameGroup {
    id: string;
    title: string;
    /** Shown under the heading in the editor, where it needs explaining. */
    hint?: string;
    names: Readonly<Record<string, string>>;
}

export const DEFAULT_GROUPS: readonly NameGroup[] = [
    {
        id: 'materials',
        title: 'Materials AI',
        hint: 'The material master, stock and purchasing tables.',
        names: {
            'core.material_master_data': 'Material master',
            'core.material_plant_extension': 'Plant extensions',
            'core.mb52': 'Stock on hand',
            'core.soh_quantity_per_store': 'Stock by location',
            'core.soh_aging_live': 'Stock ageing',
            'core.soh_aging_gi_gr_dates_live': 'Last movement dates',
            'core.inventory_movement': 'Goods movements',
            'core.purchase_requisation': 'Purchase requisitions',
            'core.supplychain': 'Purchase orders',
            'core.all_plants': 'Plant list',
            'core.mat_group_description': 'Material groups',
            'core.account_classification_mapping': 'Account classifications',
            'ai.material_embedding': 'Material description search',
        },
    },
    {
        id: 'track',
        title: 'Track My Request',
        hint: 'Requisitions and purchase orders, from raised to received.',
        names: {
            'track.request_lifecycle': 'Request lifecycle',
            'track.pr_line': 'Requisition lines',
            'track.po_line': 'Purchase order lines',
            'track.open_pr': 'Open requisitions',
            'track.pr_pending_release': 'Requisitions not yet submitted',
            'track.po_draft': 'Draft purchase orders',
            'track.po_pending_release': 'POs awaiting approval',
            'track.po_open': 'Open purchase orders',
            'track.pr_waiting_with': 'Requisition approval queue',
            'track.po_waiting_with': 'PO approval queue',
            'track.goods_receipt': 'Goods receipts',
            'track.in_transit': 'In transit',
            'track.approval_chain': 'Approval chain',
            'track.supplier_directory': 'Supplier directory',
            'track.data_freshness': 'Data load times',
            'track.column_guide': 'Column guide',
        },
    },
    {
        id: 'sourceguide',
        title: 'SourceGuide AI',
        hint: 'Approved suppliers, what was paid, and what is contracted.',
        names: {
            'ai.sourcing': 'Approved supplier list',
            'ai.commodity_catalog': 'Commodity catalogue',
            'ai.purchase_history': 'Purchase history',
            'public.sg_champions': 'Procurement champions',
            sg_champions: 'Procurement champions',
            pir_catalog: 'Contracted prices',
            supplier_directory: 'Supplier contacts',
            catalog_entry: 'Rate catalogue',
            rate_version: 'Rate history',
            sns_record_segment: 'Sole-source segments',
            sns_record_node: 'Sole-source scope',
            sns_category_manager: 'Category managers',
            sns_country_manager: 'Country managers',
            sns_supplier: 'Registered suppliers',
            sns_record: 'Sole-source registry',
            sns_reason: 'Sole-source reasons',
        },
    },
    {
        id: 'tools',
        title: 'Tools and assistants',
        hint: 'What the live progress line calls them while an answer is being worked out.',
        names: {
            query_materials_db: 'the materials database',
            search_materials: 'material description search',
            query_track_db: 'the tracking database',
            query_sourceguide_db: 'the supplier database',
            query_sns_registry_db: 'the sole-source registry',
            query_catalog_manager_db: 'the contracted price catalogue',
            search_policy: 'the policy documents',
            AirAPI: 'air shipment tracking',
            OceanAPI: 'sea shipment tracking',
            ask_material_ai: 'Material AI',
            ask_track_my_request: 'Track My Request',
            ask_sc_policy_ai: 'SC Policy AI',
            ask_sourceguide_ai: 'SourceGuide AI',
        },
    },
    {
        id: 'databases',
        title: 'Databases',
        names: {
            materials_db: 'the materials database',
            sourceguide_db: 'the supplier database',
            catalog_manager_db: 'the contracted price catalogue',
            sns_registry_db: 'the sole-source registry',
        },
    },
    {
        id: 'columns',
        title: 'Columns',
        hint:
            'Only the ones that keep turning up in a note. There are 319 in the materials ' +
            'database alone; anything not listed shows through unchanged, which is the honest ' +
            'failure - a raw column name once beats a wrong friendly name everywhere.',
        names: {
            net_order_val_usd: 'order value (USD)',
            net_order_value: 'order value (local)',
            order_value_usd: 'order value (USD)',
            manufacturer_part_no: 'manufacturer part number',
            material_description: 'material description',
            df_at_client_level: 'deletion flag',
            central_block_status: 'block status',
            successor_code: 'replacement material',
            stock_quantity: 'stock quantity',
            receipt_state: 'receipt status',
            release_state: 'approval status',
            overall_stage: 'stage',
            waiting_with: 'waiting with',
            days_waiting: 'days waiting',
            supplier_name: 'supplier name',
            supplier_code: 'supplier code',
            supplier_num: 'supplier code',
            material_type: 'material type',
            order_qty: 'quantity ordered',
            unit_price: 'unit price',
            expiry_date: 'expiry date',
            base_status: 'registry status',
            is_deleted: 'deleted',
            is_closed: 'closed',
            in_avl: 'on the approved list',
        },
    },
    {
        id: 'loads',
        title: 'Data loads',
        hint: 'What the load-time panel calls each source. The loader records its own table names with no schema on them, so these are keyed bare.',
        names: {
            gr_data: 'Goods receipts',
            ub_grir: 'GR/IR balances',
            ap_aging: 'Payables ageing',
            release_strategy: 'Approval rules',
            pr_release: 'Requisition approval queue',
            po_release: 'PO approval queue',
            zmb5oa: 'In transit',
        },
    },
];

/** Every default, flattened. The editor layers the stored ones over this. */
export const DISPLAY_NAMES: Readonly<Record<string, string>> = Object.assign(
    {},
    ...DEFAULT_GROUPS.map(group => group.names),
);

/**
 * One regex for a whole table, longest name first.
 *
 * Order is the whole trick: `track.po_line` has to be tried before `po_line`,
 * or a qualified name becomes "Request lifecycle_line". Alternation in a JS
 * regex is first-match-wins, not longest-match-wins, so the sort is what makes
 * it correct rather than the engine.
 *
 * The leading boundary stops a name matching inside a longer one. The trailing
 * one has to let a full stop through: half of these names end a sentence -
 * "…12 approved suppliers in ai.purchase_history." - and refusing any
 * following dot left exactly those untouched, which is most of the ones a
 * reader actually sees. So it rejects a dot only when a word follows it, which
 * is what tells `core.supplychain.` apart from `core.supplychain.archive`.
 */
function buildPattern(names: Record<string, string>): RegExp {
    return new RegExp(
        '(?<![\\w.])(' +
            Object.keys(names)
                .sort((a, b) => b.length - a.length)
                .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('|') +
            ')(?!\\w|\\.\\w)',
        'g',
    );
}

/**
 * The table in force, and the regex that goes with it.
 *
 * Module state rather than context, because the thing that needs it is a
 * string function called from inside a Markdown renderer, and threading a
 * provider through every one of those to change four words is a worse trade
 * than one mutable pair kept next to the function that reads it. Both always
 * change together, which is the only invariant that matters here.
 */
let active: Record<string, string> = { ...DISPLAY_NAMES };
let activePattern = buildPattern(active);

/** Lays the stored wording over the defaults. Called once, on load. */
export function setDisplayNames(overrides: Record<string, string>): void {
    active = { ...DISPLAY_NAMES, ...overrides };
    activePattern = buildPattern(active);
}

/**
 * Swaps every known schema name in a piece of text for its readable one.
 *
 * Safe to run on anything: a name that is not in the table is left exactly as
 * it was, and nothing else in the string is touched.
 */
/**
 * The readable name for one source table, given its bare name.
 *
 * The load-time panel reads track.data_freshness, which records the loader's
 * own table names with no schema on them - `mb52`, `supplychain`. Everything
 * else here is keyed by schema.table, so try the bare key first (the loader
 * sources are keyed that way), then the two schemas the rest could be in.
 * Falls back to the raw name: an unnamed table shown as it is beats a guess.
 */
export function tableDisplayName(bare: string): string {
    return active[bare] ?? active[`core.${bare}`] ?? active[`track.${bare}`] ?? bare;
}

export function applyDisplayNames(text: string): string {
    if (!text) return text;
    activePattern.lastIndex = 0;
    return text.replace(activePattern, match => active[match] ?? match);
}
