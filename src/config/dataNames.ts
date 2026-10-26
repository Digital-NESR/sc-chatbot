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
 * Agreed with the business - see docs/display-names.md, which is the editable
 * copy. Change that first, then this.
 */

/** Real name as the agents write it, to what a reader should see. */
export const DISPLAY_NAMES: Readonly<Record<string, string>> = {
    /* ── Materials AI ── */
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

    /* ── Track My Request ── */
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

    /* ── SourceGuide AI ── */
    'ai.sourcing': 'Approved supplier list',
    'ai.commodity_catalog': 'Commodity catalogue',
    'ai.purchase_history': 'Purchase history',
    'public.sg_champions': 'Procurement champions',
    'sg_champions': 'Procurement champions',
    'pir_catalog': 'Contracted prices',
    'supplier_directory': 'Supplier contacts',
    'catalog_entry': 'Rate catalogue',
    'rate_version': 'Rate history',
    'sns_record_segment': 'Sole-source segments',
    'sns_record_node': 'Sole-source scope',
    'sns_category_manager': 'Category managers',
    'sns_country_manager': 'Country managers',
    'sns_supplier': 'Registered suppliers',
    'sns_record': 'Sole-source registry',
    'sns_reason': 'Sole-source reasons',

    /* ── The tools, as the progress line names them ── */
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

    /* ── Databases ── */
    materials_db: 'the materials database',
    sourceguide_db: 'the supplier database',
    catalog_manager_db: 'the contracted price catalogue',
    sns_registry_db: 'the sole-source registry',

    /* ── Columns ──
       Only the ones that actually keep turning up in a derivation note. There
       are 319 in `core` alone and mapping all of them is its own project; the
       rest show through unchanged, which is the honest failure - a raw column
       name once is better than a wrong friendly name everywhere. */
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
};

/**
 * One regex for the whole table, longest name first.
 *
 * Order is the whole trick: `track.po_line` has to be tried before `po_line`,
 * or a qualified name becomes "Request lifecycle_line". Alternation in a JS
 * regex is first-match-wins, not longest-match-wins, so the sort is what makes
 * it correct rather than the engine.
 *
 * The boundaries stop a name matching inside a longer one - `supplier_name`
 * inside `supplier_name_2`, or `po_line` inside `track.po_line`, where the
 * character before is a dot.
 */
const PATTERN = new RegExp(
    '(?<![\\w.])(' +
        Object.keys(DISPLAY_NAMES)
            .sort((a, b) => b.length - a.length)
            .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|') +
        ')(?!\\w|\\.\\w)',
    'g',
);

/**
 * Swaps every known schema name in a piece of text for its readable one.
 *
 * Safe to run on anything: a name that is not in the table is left exactly as
 * it was, and nothing else in the string is touched.
 */
export function applyDisplayNames(text: string): string {
    if (!text) return text;
    return text.replace(PATTERN, match => DISPLAY_NAMES[match] ?? match);
}
