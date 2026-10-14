-- =====================================================================
-- Seed the track.* column dictionary.
--
-- 444 columns across 16 views, but only 237 distinct descriptions: four
-- PO views share one 49-column shape (po_line and the three filtered
-- views built on SELECT * from it) and three PR views share a 30-column
-- one, so those are seeded with a CROSS JOIN rather than repeated.
--
-- Descriptions are dollar-quoted ($d$) so GRN'ed and don't need escaping.
--
-- These are the STARTING point. Edit them at /admin/columns -> Track My
-- Request; a save writes here and re-applies the COMMENT immediately, so
-- an edit is live for the agent on its very next query.
--
-- Apply AFTER db/track_column_docs.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The PO line shape: po_line, and the three filtered views on top of it.
-- ---------------------------------------------------------------------
INSERT INTO ai.column_docs (object_schema, object_name, column_name, description, updated_by)
SELECT 'track', v.name, d.col, d.descr, 'seed'
FROM (VALUES ('po_line'),('po_draft'),('po_open'),('po_pending_release')) v(name)
CROSS JOIN (VALUES
 ('po_number',    $d$Purchase order number. THE key column - it is po_number, never po_num. Join to invoice, goods_receipt, grir_open, in_transit and po_waiting_with on this.$d$),
 ('po_item',      $d$Purchase order line number, zero-padded to five characters, e.g. 00010. With po_number it identifies the line.$d$),
 ('po_line_key',  $d$Convenience key, po_number || '-' || po_item. Use the two columns separately when joining.$d$),
 ('pr_number',    $d$Originating requisition number, NULL where the PO was raised directly. Links at document level only - see the note on request_lifecycle.$d$),
 ('material',     $d$SAP material number, 18 characters zero-padded. Blank on free-text and service lines.$d$),
 ('description',  $d$Free-text line description as typed on the order. NEVER match a supplier name against this - the surname Alfadhli contains d-h-l and matched a DHL search. Use supplier_num.$d$),
 ('material_desc',$d$Material master short description, where the line carries a material number.$d$),
 ('plant',        $d$4-digit SAP plant receiving the goods.$d$),
 ('plant_desc',   $d$Readable plant name. Do not use it to infer country - use country.$d$),
 ('mat_group',    $d$SAP material group on the line.$d$),
 ('supplier_num', $d$SAP supplier number. THIS is how a supplier is identified, not by text in description. Resolve the number first, then filter on it.$d$),
 ('country',      $d$OPERATING country of the order - the one meant by "POs in Iraq". SAP spellings, so 'Utd.Arab Emir.' not 'UAE'; check SELECT DISTINCT country before filtering.$d$),
 ('comp_code',    $d$SAP company code owning the order.$d$),
 ('comp_co_desc', $d$Readable company code name.$d$),
 ('opco_country', $d$Country of the operating company. Usually equals country; country is the one to filter on.$d$),
 ('supplier_country', $d$The SUPPLIER's own country, not where the order is being placed. Not the column for "orders in Iraq".$d$),
 ('pu_doc_type',  $d$SAP purchasing document type.$d$),
 ('item_cat',     $d$SAP item category. '9' is a service line - see is_service_line.$d$),
 ('order_qty',    $d$Quantity ordered on the line. No common unit of measure across lines, so never sum across different materials.$d$),
 ('received_qty', $d$Quantity GRN'ed so far. Reads 0 on service lines even when the service is complete - trust receipt_state, not this.$d$),
 ('outstanding_qty', $d$Quantity still to be GRN'ed. This is the column receipt_state is derived from, because it is correct on service lines where received_qty is not.$d$),
 ('invoiced_qty', $d$Quantity invoiced so far.$d$),
 ('uninvoiced_qty', $d$Quantity GRN'ed but not yet invoiced. The per-line counterpart of grir_open.$d$),
 ('order_unit',   $d$Unit of measure for the quantities on this line.$d$),
 ('net_order_value', $d$Net line value in the order currency. NEVER total this across rows without grouping by currency.$d$),
 ('net_order_val_usd', $d$Net line value converted to USD. This is the only value column safe to total across countries.$d$),
 ('currency',     $d$ISO currency of net_order_value.$d$),
 ('po_created_on',$d$Date the purchase order line was created. age_days counts from here.$d$),
 ('document_date',$d$Document date on the order, which can differ from po_created_on.$d$),
 ('delivery_date',$d$Delivery date promised on the order. Compare with CURRENT_DATE for overdue analysis.$d$),
 ('supplier_promise_date', $d$Date the supplier committed to, where one was captured. Often blank.$d$),
 ('statistical_delv_date', $d$SAP statistical delivery date, used for reporting rather than commitment.$d$),
 ('gr_posting_date', $d$Date of the latest goods receipt posting against this line, netted. goods_receipt has the individual events.$d$),
 ('gr_document_date', $d$Document date on the latest goods receipt.$d$),
 ('last_migo',    $d$Timestamp of the last MIGO goods movement transaction on the line.$d$),
 ('inco1',        $d$Incoterms code, e.g. DAP, FOB.$d$),
 ('incoterms_text', $d$Readable incoterms description.$d$),
 ('release_state',$d$Approval state, resolved: Draft (never submitted, no release strategy) | Under Release (submitted, not signed) | Released (approved). Prefer this over raw_status.$d$),
 ('raw_status',   $d$The underlying SAP status text that release_state is derived from: blank, 'Not Approved' or 'Approved'.$d$),
 ('frgke',        $d$SAP release indicator. B accompanies Not Approved, G accompanies Approved.$d$),
 ('release_strategy', $d$Release strategy code governing this line. JOIN to approval_chain.release_strategy to find who still has to sign.$d$),
 ('count_release',$d$Number of release steps already signed on this line.$d$),
 ('po_first_release_date', $d$Date of the first approval step.$d$),
 ('po_release_date', $d$Date the order became fully released. Present on 99.99% of Approved lines.$d$),
 ('receipt_state',$d$Whether a GRN has been posted: Fully GRN'ed | Partially GRN'ed | Not GRN'ed | PO unapproved | Closed, no GRN. Derived from outstanding_qty, so it is right on service lines where received_qty is 0. A GRN is a posting, not proof the requester physically has the goods.$d$),
 ('is_service_line', $d$True for item category 9. About 338,000 lines: ordered qty 1, received qty 0, nothing outstanding, and a GR date on 96% of them. Their receipt is a service entry sheet and their quantities are not comparable with material lines.$d$),
 ('is_deleted',   $d$True where the line is flagged for deletion in SAP. Exclude it unless the question is about cancellations.$d$),
 ('age_days',     $d$Days since po_created_on. Quote it alongside the date whenever something is waiting.$d$),
 ('loaded_at',    $d$When the Data Loader wrote this row. Operational, not business data.$d$)
) d(col, descr)
ON CONFLICT (object_schema, object_name, column_name) DO UPDATE
  SET description = EXCLUDED.description, updated_at = now(), updated_by = EXCLUDED.updated_by;

-- ---------------------------------------------------------------------
-- The PR line shape: pr_line, open_pr, pr_pending_release.
-- ---------------------------------------------------------------------
INSERT INTO ai.column_docs (object_schema, object_name, column_name, description, updated_by)
SELECT 'track', v.name, d.col, d.descr, 'seed'
FROM (VALUES ('pr_line'),('open_pr'),('pr_pending_release')) v(name)
CROSS JOIN (VALUES
 ('pr_number',    $d$Purchase requisition number. THE key column - it is pr_number, never pr_num.$d$),
 ('pr_item',      $d$Requisition line number, zero-padded, e.g. 00010.$d$),
 ('pr_line_key',  $d$Convenience key, pr_number || '-' || pr_item.$d$),
 ('material',     $d$SAP material number. Blank on free-text lines.$d$),
 ('description',  $d$Free-text line description as typed on the requisition.$d$),
 ('plant',        $d$4-digit SAP plant the requisition is for.$d$),
 ('country',      $d$Operating country. SAP spellings - check SELECT DISTINCT country before filtering.$d$),
 ('material_group', $d$SAP material group.$d$),
 ('item_category',$d$SAP item category on the requisition line.$d$),
 ('qty_requested',$d$Quantity asked for. No common unit across lines - do not sum across materials.$d$),
 ('qty_on_po',    $d$Quantity already placed on a purchase order. Zero on every line whose conversion_state is Open.$d$),
 ('unit_of_measure', $d$Unit of measure for qty_requested.$d$),
 ('requisitioner',$d$Person who raised the requisition, as free text. There is NO email address anywhere - "my requests" cannot be resolved for the person asking, so ask them for a number or a name.$d$),
 ('created_by',   $d$SAP user id that entered the requisition, which is not always the requisitioner.$d$),
 ('requisition_date', $d$Date the requisition was raised. age_days counts from here.$d$),
 ('requested_delivery_date', $d$Date the requester asked for the goods by.$d$),
 ('purchasing_group', $d$SAP purchasing group - the buying desk the requisition lands on.$d$),
 ('purchasing_group_description', $d$Readable purchasing group name, e.g. Coiled Tubing, Slick Line.$d$),
 ('fixed_vendor', $d$Supplier fixed on the requisition, where one was specified.$d$),
 ('desired_vendor', $d$Supplier the requester suggested. Not binding.$d$),
 ('conversion_state', $d$Whether the requisition became a PO: Open | Converted to PO | RFQ created. Self-validating - every Open line has qty_on_po = 0.$d$),
 ('release_state',$d$Approval state, resolved: Not Submitted | Under Release | Fully Released. Derived from fully_released_on, NOT from release_status.$d$),
 ('release_status', $d$Raw SAP release status code. Blank means the line never entered a release strategy.$d$),
 ('release_strategy', $d$Release strategy code governing approval of this requisition.$d$),
 ('fully_released_on', $d$Date the requisition became fully approved. Present on 100% of fully-approved lines, which is why release_state is built on it. NOTE: the underlying release_date column is populated on every row and is NOT an approval flag.$d$),
 ('is_deleted',   $d$True where the line is flagged for deletion. Note 32,095 of 33,743 rows in the under-release source carry a deletion flag, so this filter matters.$d$),
 ('is_closed',    $d$True where the requisition line has been closed.$d$),
 ('age_days',     $d$Days since requisition_date.$d$),
 ('purchase_order_date', $d$Date of the purchase order the requisition was converted to.$d$),
 ('loaded_at',    $d$When the Data Loader wrote this row. Operational, not business data.$d$)
) d(col, descr)
ON CONFLICT (object_schema, object_name, column_name) DO UPDATE
  SET description = EXCLUDED.description, updated_at = now(), updated_by = EXCLUDED.updated_by;

-- ---------------------------------------------------------------------
-- The remaining views, each its own shape.
-- ---------------------------------------------------------------------
INSERT INTO ai.column_docs (object_schema, object_name, column_name, description, updated_by)
VALUES
-- request_lifecycle ---------------------------------------------------
('track','request_lifecycle','pr_number',$d$Purchase requisition number. One row per PR LINE. It is pr_number, never pr_num.$d$,'seed'),
('track','request_lifecycle','pr_item',$d$Requisition line number.$d$,'seed'),
('track','request_lifecycle','pr_line_key',$d$Convenience key, pr_number || '-' || pr_item.$d$,'seed'),
('track','request_lifecycle','material',$d$SAP material number on the requisition line.$d$,'seed'),
('track','request_lifecycle','description',$d$Free-text description from the requisition.$d$,'seed'),
('track','request_lifecycle','plant',$d$4-digit SAP plant.$d$,'seed'),
('track','request_lifecycle','country',$d$Operating country of the requisition.$d$,'seed'),
('track','request_lifecycle','requisitioner',$d$Who raised it, as free text. No email exists.$d$,'seed'),
('track','request_lifecycle','requisition_date',$d$Date the requisition was raised.$d$,'seed'),
('track','request_lifecycle','qty_requested',$d$Quantity asked for on this requisition line.$d$,'seed'),
('track','request_lifecycle','conversion_state',$d$Open | Converted to PO | RFQ created.$d$,'seed'),
('track','request_lifecycle','pr_release_state',$d$Requisition approval state: Not Submitted | Under Release | Fully Released.$d$,'seed'),
('track','request_lifecycle','pr_released_on',$d$Date the requisition was fully approved.$d$,'seed'),
('track','request_lifecycle','pr_age_days',$d$Days since the requisition was raised.$d$,'seed'),
('track','request_lifecycle','po_numbers',$d$Comma-separated list of every PO raised against this PR. A PR can become more than one PO, which is why this is a list and not a single number.$d$,'seed'),
('track','request_lifecycle','po_line_count',$d$How many PO lines came off this requisition, across all of po_numbers.$d$,'seed'),
('track','request_lifecycle','po_created_on',$d$Earliest PO creation date across those orders.$d$,'seed'),
('track','request_lifecycle','po_release_state',$d$Rolled-up PO approval state: Draft if any line is Draft, else Under Release if any is, else Released.$d$,'seed'),
('track','request_lifecycle','suppliers',$d$Comma-separated supplier numbers across the POs raised from this PR.$d$,'seed'),
('track','request_lifecycle','po_countries',$d$Comma-separated operating countries of those POs.$d$,'seed'),
('track','request_lifecycle','order_qty',$d$Total quantity ordered across the PO lines. Units are not common - treat with care.$d$,'seed'),
('track','request_lifecycle','received_qty',$d$Total quantity GRN'ed. Reads 0 for service lines; trust receipt_state.$d$,'seed'),
('track','request_lifecycle','outstanding_qty',$d$Total quantity still to be GRN'ed. This drives receipt_state.$d$,'seed'),
('track','request_lifecycle','receipt_state',$d$Rolled-up GRN state across the POs: Fully GRN'ed | Partially GRN'ed | Awaiting Receipt | Closed, nothing received.$d$,'seed'),
('track','request_lifecycle','earliest_delivery_date',$d$Earliest promised delivery date across the PO lines.$d$,'seed'),
('track','request_lifecycle','latest_gr_posting_date',$d$Most recent goods receipt posting date across the PO lines.$d$,'seed'),
('track','request_lifecycle','pr_waiting_with',$d$Employee id holding the REQUISITION for approval. NULL once signed.$d$,'seed'),
('track','request_lifecycle','pr_days_waiting',$d$Days the requisition has been waiting for approval.$d$,'seed'),
('track','request_lifecycle','po_waiting_with',$d$Employee id holding the PURCHASE ORDER for approval. NULL once signed.$d$,'seed'),
('track','request_lifecycle','po_days_waiting',$d$Days the purchase order has been waiting for approval.$d$,'seed'),
('track','request_lifecycle','waiting_with',$d$Who is holding the request RIGHT NOW - the PO approver if there is one, otherwise the PR approver. An employee id, not a name. NULL means nobody is holding it. This is the single most-asked-for column in the schema.$d$,'seed'),
('track','request_lifecycle','overall_stage',$d$The headline answer to "where is my request": PR awaiting approval -> PR approved, awaiting PO -> PO drafted, not submitted -> PO awaiting approval -> On order, awaiting delivery -> Partially GRN'ed -> Fully GRN'ed, plus Cancelled or closed and Closed without receipt. Lead with this.$d$,'seed'),

-- pr_waiting_with -----------------------------------------------------
('track','pr_waiting_with','pr_number',$d$Requisition number awaiting approval. The source column is called PR_Sitting_Release, which sounds like a status but holds the number.$d$,'seed'),
('track','pr_waiting_with','pr_item',$d$Requisition line number. NOTE this one is a bigint here, not zero-padded text like elsewhere.$d$,'seed'),
('track','pr_waiting_with','pr_type',$d$Requisition document type.$d$,'seed'),
('track','pr_waiting_with','requester',$d$SAP user id of the person who raised it.$d$,'seed'),
('track','pr_waiting_with','requester_name',$d$Readable name of the requester. This is who RAISED it, not who is holding it.$d$,'seed'),
('track','pr_waiting_with','waiting_with',$d$WHO THE REQUISITION IS SITTING WITH - the approver who has not signed. An employee id, not a name. Populated on 98% of rows and available nowhere else in the platform.$d$,'seed'),
('track','pr_waiting_with','submitted_on',$d$Date it was submitted for approval.$d$,'seed'),
('track','pr_waiting_with','last_approved_on',$d$Date of the most recent approval step. Blank until the first signature - a blank here with a populated waiting_with means nobody has signed yet, not that it was never submitted.$d$,'seed'),
('track','pr_waiting_with','days_waiting',$d$Days waiting since submission. Lead with this when reporting a stuck requisition.$d$,'seed'),
('track','pr_waiting_with','days_since_last_step',$d$Days since the most recent approval step.$d$,'seed'),
('track','pr_waiting_with','material_group',$d$SAP material group.$d$,'seed'),
('track','pr_waiting_with','plant',$d$4-digit SAP plant.$d$,'seed'),
('track','pr_waiting_with','company_code',$d$SAP company code.$d$,'seed'),
('track','pr_waiting_with','country',$d$Country of the company code.$d$,'seed'),
('track','pr_waiting_with','segment',$d$Business segment.$d$,'seed'),
('track','pr_waiting_with','loaded_at',$d$When the Data Loader wrote this row.$d$,'seed'),

-- po_waiting_with -----------------------------------------------------
('track','po_waiting_with','po_number',$d$Purchase order awaiting approval.$d$,'seed'),
('track','po_waiting_with','po_item',$d$Purchase order line number.$d$,'seed'),
('track','po_waiting_with','pr_number',$d$Originating requisition number.$d$,'seed'),
('track','po_waiting_with','pr_item',$d$Originating requisition line. Unlike elsewhere, this really is the PR line.$d$,'seed'),
('track','po_waiting_with','po_type',$d$Purchasing document type.$d$,'seed'),
('track','po_waiting_with','buyer',$d$SAP user id of the buyer who raised the order.$d$,'seed'),
('track','po_waiting_with','buyer_name',$d$Readable name of the BUYER. This is who raised the order, NOT the approver holding it - do not tell someone to chase this person.$d$,'seed'),
('track','po_waiting_with','waiting_with',$d$WHO THE ORDER IS SITTING WITH - the approver who has not signed. An employee id, not a name. Populated on every row and available nowhere else.$d$,'seed'),
('track','po_waiting_with','created_on',$d$Date the order was created.$d$,'seed'),
('track','po_waiting_with','submitted_on',$d$Date it was submitted for approval. Frequently blank even on orders that are genuinely sitting with an approver, so do NOT report a blank here as "never submitted".$d$,'seed'),
('track','po_waiting_with','last_approved_on',$d$Date of the most recent approval step. Blank on most rows, because most are waiting for their first signature.$d$,'seed'),
('track','po_waiting_with','days_waiting',$d$Days since the order was created. Lead with this when reporting a stuck order.$d$,'seed'),
('track','po_waiting_with','days_since_last_step',$d$Days since the most recent approval step.$d$,'seed'),
('track','po_waiting_with','item_category',$d$SAP item category on the line.$d$,'seed'),
('track','po_waiting_with','material_group',$d$SAP material group.$d$,'seed'),
('track','po_waiting_with','plant',$d$4-digit SAP plant.$d$,'seed'),
('track','po_waiting_with','company_code',$d$SAP company code.$d$,'seed'),
('track','po_waiting_with','country',$d$Country of the company code.$d$,'seed'),
('track','po_waiting_with','segment',$d$Business segment.$d$,'seed'),
('track','po_waiting_with','loaded_at',$d$When the Data Loader wrote this row.$d$,'seed'),

-- invoice -------------------------------------------------------------
('track','invoice','po_number',$d$Purchase order the invoice was posted against. Only PO-linked invoices are loaded, so this is never blank.$d$,'seed'),
('track','invoice','invoice_doc',$d$SAP accounting document number of the invoice.$d$,'seed'),
('track','invoice','invoice_ref',$d$The supplier's own invoice reference.$d$,'seed'),
('track','invoice','document_type',$d$SAP document type, e.g. RE invoice, KZ payment.$d$,'seed'),
('track','invoice','document_type_description',$d$Readable name of the document type.$d$,'seed'),
('track','invoice','vendor',$d$SAP supplier number.$d$,'seed'),
('track','invoice','vendor_name',$d$Readable supplier name.$d$,'seed'),
('track','invoice','posting_date',$d$Date the invoice was posted.$d$,'seed'),
('track','invoice','document_date',$d$Date on the supplier invoice.$d$,'seed'),
('track','invoice','baseline_date',$d$Date payment terms start counting from.$d$,'seed'),
('track','invoice','due_on',$d$Date the invoice falls due. Compare with CURRENT_DATE for overdue analysis.$d$,'seed'),
('track','invoice','payment_term',$d$SAP payment terms key.$d$,'seed'),
('track','invoice','currency',$d$ISO currency of the amounts. NEVER total across different currencies.$d$,'seed'),
('track','invoice','invoice_amount',$d$Amount invoiced, positive.$d$,'seed'),
('track','invoice','payment_amount',$d$Amount paid so far. Zero on an unpaid invoice.$d$,'seed'),
('track','invoice','invoice_balance',$d$Outstanding balance. Zero means settled, non-zero means still payable - this is the column that answers whether an invoice has been paid. CAUTION: it carries SAP's credit-side sign, so a fully unpaid invoice of 3,066.71 shows a balance of -3,066.71. The sign is a bookkeeping convention, not a credit or a refund. Report the magnitude, and use payment_state rather than the sign to decide whether it is paid.$d$,'seed'),
('track','invoice','payment_state',$d$Resolved payment status: Paid | Partially paid | Overdue | Open. Use this rather than interpreting invoice_balance yourself.$d$,'seed'),
('track','invoice','days_past_due',$d$Days past due_on. Negative means not yet due.$d$,'seed'),
('track','invoice','baseline_agingdays',$d$Days since baseline_date.$d$,'seed'),
('track','invoice','payable_category',$d$Classification of the payable assigned by the source model.$d$,'seed'),
('track','invoice','company_code',$d$SAP company code.$d$,'seed'),
('track','invoice','country',$d$Country of the company code.$d$,'seed'),
('track','invoice','segment',$d$Business segment.$d$,'seed'),
('track','invoice','loaded_at',$d$When the Data Loader wrote this row.$d$,'seed'),

-- grir_open -----------------------------------------------------------
('track','grir_open','po_number',$d$Purchase order this open GR/IR item belongs to. Can be blank for non-PO postings.$d$,'seed'),
('track','grir_open','po_item',$d$Purchase order line number.$d$,'seed'),
('track','grir_open','document_number',$d$SAP accounting document number. Unique per fiscal year and company code, NOT globally - pair it with fiscal_year.$d$,'seed'),
('track','grir_open','fiscal_year',$d$Fiscal year of the accounting document.$d$,'seed'),
('track','grir_open','document_type',$d$SAP document type: WE goods receipt, RE invoice receipt.$d$,'seed'),
('track','grir_open','document_type_desc',$d$Readable document type, which tells you which half of the mismatch this is - GRN'ed not invoiced, or invoiced not GRN'ed.$d$,'seed'),
('track','grir_open','posting_date',$d$Date posted to the GR/IR account. Use for aging.$d$,'seed'),
('track','grir_open','document_date',$d$Date on the source document.$d$,'seed'),
('track','grir_open','vendor',$d$SAP supplier number.$d$,'seed'),
('track','grir_open','vendor_name',$d$Readable supplier name.$d$,'seed'),
('track','grir_open','amount',$d$Amount in transaction currency. Do NOT sum across rows with different currency values.$d$,'seed'),
('track','grir_open','currency',$d$ISO currency of amount.$d$,'seed'),
('track','grir_open','age_days',$d$Age of the open item in days.$d$,'seed'),
('track','grir_open','age_band',$d$Readable aging band for age_days.$d$,'seed'),
('track','grir_open','plant',$d$4-digit SAP plant.$d$,'seed'),
('track','grir_open','company_code',$d$SAP company code.$d$,'seed'),
('track','grir_open','country',$d$Country of the company code.$d$,'seed'),
('track','grir_open','loaded_at',$d$When the Data Loader wrote this row.$d$,'seed'),

-- in_transit ----------------------------------------------------------
('track','in_transit','po_number',$d$Purchase order number of the open line.$d$,'seed'),
('track','in_transit','po_item',$d$Purchase order line number.$d$,'seed'),
('track','in_transit','po_line_key',$d$Convenience key, po_number || '-' || po_item.$d$,'seed'),
('track','in_transit','material',$d$SAP material number.$d$,'seed'),
('track','in_transit','material_description',$d$Material short description.$d$,'seed'),
('track','in_transit','supplier',$d$SAP supplier number.$d$,'seed'),
('track','in_transit','supplier_name',$d$Readable supplier name.$d$,'seed'),
('track','in_transit','delivery_status',$d$Delivery status of the open line, e.g. In Transit, Partial Delivery+Intransit, Not Collected. The closest thing the platform has to a shipment state.$d$,'seed'),
('track','in_transit','delivery_completed',$d$SAP delivery-completed flag. Set when no further receipt is expected even if quantity remains.$d$,'seed'),
('track','in_transit','order_quantity',$d$Quantity ordered on the line.$d$,'seed'),
('track','in_transit','received_qty',$d$Quantity already received.$d$,'seed'),
('track','in_transit','intransit_quantity',$d$QUANTITY CURRENTLY IN TRANSIT - the only in-transit figure anywhere in the platform. It answers how much of an order is on the water. It is NOT shipment tracking: there is no AWB, container or bill of lading in any table, so it cannot tell you where a shipment physically is.$d$,'seed'),
('track','in_transit','intransit_amount',$d$Value of the in-transit quantity.$d$,'seed'),
('track','in_transit','not_collected_quantity',$d$Quantity ready but not collected.$d$,'seed'),
('track','in_transit','not_collected_amount',$d$Value of the not-collected quantity.$d$,'seed'),
('track','in_transit','plant',$d$4-digit SAP plant.$d$,'seed'),
('track','in_transit','plant_name',$d$Readable plant name.$d$,'seed'),
('track','in_transit','company_code',$d$SAP company code.$d$,'seed'),
('track','in_transit','country_name',$d$Readable country name of the plant.$d$,'seed'),
('track','in_transit','loaded_at',$d$When the Data Loader wrote this row.$d$,'seed'),

-- goods_receipt -------------------------------------------------------
('track','goods_receipt','po_number',$d$Purchase order the receipt was posted against. This link exists nowhere else - core inventory movements carry no document reference.$d$,'seed'),
('track','goods_receipt','po_item',$d$Purchase order LINE the receipt was posted against.$d$,'seed'),
('track','goods_receipt','po_line_key',$d$Convenience key, po_number || '-' || po_item.$d$,'seed'),
('track','goods_receipt','posting_date',$d$Date the receipt was posted to the ledger. The activity date for this view.$d$,'seed'),
('track','goods_receipt','gr_entry_date',$d$Date the receipt was entered into SAP, which can differ from the posting date.$d$,'seed'),
('track','goods_receipt','movement_type',$d$SAP movement type: 101 standard receipt, 102 its reversal, 107/109 receipt into blocked stock, 108/110 their reversals, 122 return to vendor, Z50/Z51 intercompany.$d$,'seed'),
('track','goods_receipt','reversed_gr',$d$Received or Reversed. Trust this over inferring from movement_type - type 102 appears under both labels.$d$,'seed'),
('track','goods_receipt','is_reversal',$d$True where this event cancels a receipt. 17,855 of 935,619 events are reversals.$d$,'seed'),
('track','goods_receipt','gross_qty',$d$Gross quantity of this event, always positive. Diverges from net_qty on service lines. There is NO unit of measure here, so never sum across materials.$d$,'seed'),
('track','goods_receipt','net_qty',$d$Signed quantity: positive on a receipt, negative on a reversal. Sum THIS for a net received quantity, not gross_qty.$d$,'seed'),
('track','goods_receipt','plant',$d$4-digit SAP plant receiving the goods.$d$,'seed'),
('track','goods_receipt','loaded_at',$d$When the Data Loader wrote this row. NOTE there is no material document number anywhere in this view - you can report that a receipt happened, its quantity, date and movement type, but NOT which GRN document it was posted under or who posted it. Two identical receipts on the same line and day are genuinely indistinguishable, so never dedupe.$d$,'seed'),

-- approval_chain ------------------------------------------------------
('track','approval_chain','release_group',$d$SAP release group: PR for requisitions, PO for purchase orders.$d$,'seed'),
('track','approval_chain','release_strategy',$d$Release strategy code. JOIN to po_line.release_strategy or pr_line.release_strategy to find the chain for a document.$d$,'seed'),
('track','approval_chain','approval_step',$d$One approval STEP within the strategy. A strategy has several, and a document is fully released only when every step is signed - which is what makes a document sit at Under Release.$d$,'seed'),
('track','approval_chain','approver',$d$Employee number or SAP user id of the approver for this step. Match against waiting_with to see which step a document is stuck at.$d$,'seed'),
('track','approval_chain','approver_email',$d$Approver email. PERSONAL DATA - fine for one named document, never list or aggregate in bulk.$d$,'seed'),
('track','approval_chain','purchasing_group',$d$Purchasing group the strategy applies to.$d$,'seed'),
('track','approval_chain','min_value',$d$Lower bound of the spend band this step covers. Stored as TEXT - cast before comparing numerically, and note values like '250.K'.$d$,'seed'),
('track','approval_chain','max_value',$d$Upper bound of the spend band. Stored as TEXT.$d$,'seed'),

-- data_freshness ------------------------------------------------------
('track','data_freshness','source_table',$d$The core table behind a view. Mapping: pr_waiting_with<-pr_release, po_waiting_with<-po_release, goods_receipt<-gr_data, invoice<-ap_aging, grir_open<-ub_grir, in_transit<-zmb5oa, approval_chain<-release_strategy.$d$,'seed'),
('track','data_freshness','load_mode',$d$full or incremental.$d$,'seed'),
('track','data_freshness','rows_last_load',$d$Rows written by the last SUCCESSFUL load.$d$,'seed'),
('track','data_freshness','last_loaded_at',$d$When that successful load finished. Only swapped or merged loads count - a failed attempt does not move this.$d$,'seed'),
('track','data_freshness','never_loaded',$d$True if the table has never loaded successfully. CHECK THIS before telling anyone something does not exist: an empty result from an unloaded source means "no data yet", not "there are none".$d$,'seed'),
('track','data_freshness','days_since_load',$d$Days since the last successful load.$d$,'seed'),
('track','data_freshness','last_attempt_status',$d$Status of the most recent attempt, successful or not. Differs from last_loaded_at when a load is failing.$d$,'seed'),
('track','data_freshness','last_attempt_at',$d$When the most recent attempt finished.$d$,'seed'),

-- column_guide --------------------------------------------------------
('track','column_guide','view_name',$d$Which track view the column belongs to.$d$,'seed'),
('track','column_guide','column_name',$d$The column name, exactly as it must be typed in SQL.$d$,'seed'),
('track','column_guide','data_type',$d$Postgres data type.$d$,'seed'),
('track','column_guide','ordinal_position',$d$Position of the column in the view.$d$,'seed'),
('track','column_guide','description',$d$What the column means, including the traps. Edited at /admin/columns.$d$,'seed')

ON CONFLICT (object_schema, object_name, column_name) DO UPDATE
  SET description = EXCLUDED.description, updated_at = now(), updated_by = EXCLUDED.updated_by;

-- ---------------------------------------------------------------------
-- Apply to the live views.
-- ---------------------------------------------------------------------
SELECT v.view_name, ai.apply_column_docs('track', v.view_name) AS applied
FROM core.view_defs v
ORDER BY v.apply_order;
