/**
 * Every table the load-time panel shows must have a readable name.
 *
 * The panel reads track.data_freshness, whose source_table values are the
 * loader's own bare table names. The name table is keyed by schema.table for
 * everything except the loader-only sources, so a miss here means a raw
 * snake_case name reaches the reader.
 *
 *   node eval/freshness_names_check.mjs
 */
const SOURCES = [
  // From track.data_freshness, as listed in the panel on 26 Oct 2026.
  'inventory_movement', 'material_master_data', 'mb52', 'purchase_requisation',
  'supplychain', 'all_plants', 'gr_data', 'material_plant_extension',
  'soh_aging_gi_gr_dates_live', 'soh_aging_live', 'soh_quantity_per_store',
  'ub_grir', 'ap_aging', 'po_release', 'pr_release', 'release_strategy',
  'zmb5oa', 'mat_group_description', 'account_classification_mapping',
];

// Mirrors tableDisplayName in src/config/dataNames.ts. Change one, change both.
const NAMES = {
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
  gr_data: 'Goods receipts',
  ub_grir: 'GR/IR balances',
  ap_aging: 'Payables ageing',
  release_strategy: 'Approval rules',
  pr_release: 'Requisition approval queue',
  po_release: 'PO approval queue',
  zmb5oa: 'In transit',
};

const tableDisplayName = (bare) =>
  NAMES[bare] ?? NAMES[`core.${bare}`] ?? NAMES[`track.${bare}`] ?? bare;

let missing = 0;
for (const t of SOURCES) {
  const name = tableDisplayName(t);
  const named = name !== t;
  if (!named) missing++;
  console.log(`${named ? 'ok  ' : 'RAW '}  ${t.padEnd(32)} -> ${name}`);
}
console.log(missing ? `\n${missing} still showing a raw table name` : `\nall ${SOURCES.length} named`);
process.exit(missing ? 1 : 0);
