-- Loader configuration. Apply after db/schema.sql.
-- col_comments is generated from db/column_comments.json, which is the
-- human-editable source for column descriptions.

TRUNCATE core.load_config;

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'material_master_data',
  'MATERIAL_MASTER_DATA',
  'Material',
  2,
  NULL,
  ARRAY['Gross_weight','Height','Length','Net_weight','Base_Unit_of_Measure','Changed_by','Created_On','Created_by','DF_at_client_level','DG_indicator_profile','EAN_UPC','EAN_Variant','EAN_category','Ext__Material_Group','Highly_viscous','In_bulk_liquid','Last_Change','Manufacturer','Manufacturer_Part_No_','Material','Material_Description','Material_Group','Material_type','Order_Unit','Purchasing_value_key','Size_dimensions','Source_of_supply','Stock_Transfer_Net_Change_Costing','Transportation_Group','Unit_of_weight','Material_new_ID','Successor_Code']::text[],
  ARRAY['gross_weight','height','length','net_weight','base_unit_of_measure','changed_by','created_on','created_by','df_at_client_level','dg_indicator_profile','ean_upc','ean_variant','ean_category','ext_material_group','highly_viscous','in_bulk_liquid','last_change','manufacturer','manufacturer_part_no','material','material_description','material_group','material_type','order_unit','purchasing_value','size_dimensions','source_of_supply','stock_transfer_net_change_costing','transportation_group','unit_of_weight','material_new_id','successor_code']::text[],
  true,
  1,
  NULL,
  NULL,
  NULL,
  ARRAY['(material)','(upper(regexp_replace(coalesce(manufacturer_part_no,''''), ''[^A-Za-z0-9]'', '''', ''g'')))','(material_group)','USING gin (material_description gin_trgm_ops)']::text[],
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"height":"UNUSED: present but always 0 in the loaded data.","length":"UNUSED: present but always 0 in the loaded data.","ean_upc":"EAN/UPC barcode number.","material":"SAP material number, 18 chars zero-padded. One row per material; this is the master record.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","changed_by":"SAP user id that last changed the material master.","created_by":"SAP user id that created the record.","created_on":"Date the record was created in SAP.","net_weight":"Net weight in unit_of_weight.","order_unit":"Purchase order unit of measure, which may differ from the base unit.","ean_variant":"EAN category variant.","last_change":"Date the material master was last changed. Drives the 3-day embedding refresh.","ean_category":"EAN category code.","gross_weight":"Gross weight in unit_of_weight.","manufacturer":"Manufacturer code or name as recorded in SAP.","material_type":"SAP material type (e.g. ZMS). Classifies the material for valuation and procurement.","highly_viscous":"Hazardous-goods viscosity flag. Effectively empty in the loaded data.","in_bulk_liquid":"UNUSED: bulk-liquid hazardous flag. 100% null in the loaded data.","material_group":"SAP material group code. Join to mat_group_description.mat_grp. Null for ~38% of materials.","successor_code":"Replacement part reference for a superseded material. ~21% filled; formats are mixed (SAP ids and vendor codes), so treat as free text.","unit_of_weight":"Unit the gross/net weight values are expressed in.","material_new_id":"Material number WITHOUT zero padding (13 chars). Same material as the material column; use material for joins.","size_dimensions":"Free-text size or dimensions string.","purchasing_value":"UNUSED: present in the model but effectively empty in the loaded data.","source_of_supply":"Default source of supply recorded on the material master.","df_at_client_level":"SAP client-level deletion flag. \"X\" where set, otherwise null (~15% set).","ext_material_group":"External material group, used for reporting outside SAP.","base_unit_of_measure":"SAP base unit of measure (e.g. EA, M, KG). The unit quantities are expressed in.","dg_indicator_profile":"UNUSED: dangerous-goods indicator profile. 100% null in the loaded data.","manufacturer_part_no":"Manufacturer part number (MPN). Populated for only ~31% of materials.","material_description":"Free-text short description. The main field used for semantic duplicate search.","transportation_group":"SAP transportation group, used for route and freight determination.","stock_transfer_net_change_costing":"UNUSED: 100% null in the loaded data."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'mb52',
  'MB52',
  'Material',
  1,
  '(''MB52''[Unrestricted]<>0 || ''MB52''[Valuated_Goods_Receipt_Blocked_Stock]<>0 || ''MB52''[Total_Stock_in_Transit_and_in_Transfer]<>0 || ''MB52''[Stock_in_Transit]<>0 || ''MB52''[In_transfer_(plant)]<>0 || ''MB52''[Restricted-Use_Stock]<>0 || ''MB52''[Quality_Inspection]<>0 || ''MB52''[Blocked_Stock]<>0 || ''MB52''[Returns]<>0)',
  ARRAY['Unrestricted','Price_Unit','Value_Unrestricted','Valuated_Goods_Receipt_Blocked_Stock','Valuated_Goods_Receipt_Blocked_Stock_VALUE','Total_Stock_in_Transit_and_in_Transfer','Val__in_Trans__Tfr','Stock_in_Transit','Value_in_Transit','In_transfer_(plant)','Value_in_Stock_Tfr','Restricted-Use_Stock','Value_Restricted','Quality_Inspection','Quality_Inspection_Value','Blocked_Stock','Value_in_Blocked_Stock','Returns','Retuns_Value','Base_Unit_of_Measure','Batch','Currency','DF_stor__loc__level','Descr__of_Storage_Loc_','MPN','Manufacturer_Name','Material','Material_Description','Material_Group','Material_type','Plant','Storage_Bin','Storage_Location','Valuation_Type','Material-Plant','Special_Stock_Indicator','Special_stock_number','Min_Stock','Max_Stock']::text[],
  ARRAY['unrestricted','price_unit','value_unrestricted','valuated_goods_receipt_blocked_stock','valuated_goods_receipt_blocked_stock_value','total_stock_in_transit_and_in_transfer','val_in_trans_tfr','stock_in_transit','value_in_transit','in_transfer_plant','value_in_stock_tfr','restricted_use_stock','value_restricted','quality_inspection','quality_inspection_value','blocked_stock','value_in_blocked_stock','returns','retuns_value','base_unit_of_measure','batch','currency','df_stor_loc_level','descr_of_storage_loc','mpn','manufacturer_name','material','material_description','material_group','material_type','plant','storage_bin','storage_location','valuation_type','material_plant','special_stock_indicator','special_stock_number','min_stock','max_stock']::text[],
  true,
  2,
  NULL,
  NULL,
  NULL,
  ARRAY['(material)','(plant)']::text[],
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"mpn":"Manufacturer part number as recorded on the stock row.","batch":"SAP batch number. Part of the row grain.","plant":"4-digit SAP plant code. Join to all_plants.plant_code.","returns":"Returns stock quantity.","currency":"ISO currency of the monetary values on this row. Do NOT sum money across differing currencies.","material":"SAP material number, 18 chars zero-padded. Primary join key across all tables.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","max_stock":"Maximum stock level configured for this material/plant.","min_stock":"Minimum stock level configured for this material/plant.","price_unit":"Price unit: the quantity the price refers to (e.g. per 100).","storage_bin":"Physical bin location within the storage location. Free text, ~80% filled.","retuns_value":"Monetary value of returns stock. Note the source spelling.","unrestricted":"Unrestricted-use stock quantity. The normally available stock.","blocked_stock":"Blocked stock quantity, not available for use.","material_type":"SAP material type (e.g. ZMS). Classifies the material for valuation and procurement.","material_group":"SAP material group code. Join to mat_group_description.mat_grp. Null for ~38% of materials.","material_plant":"Composite key \"material-plant\" built by the source model. Redundant with material + plant; prefer those.","valuation_type":"SAP valuation type (split valuation). Observed: GENERAL, EOS_16%, EGYPT. ~38% filled.","stock_in_transit":"Stock quantity in transit between plants.","storage_location":"SAP storage location code within the plant.","val_in_trans_tfr":"Combined monetary value of in-transit and in-transfer stock.","value_in_transit":"Monetary value of stock in transit.","value_restricted":"Monetary value of restricted-use stock.","df_stor_loc_level":"Storage-location-level deletion flag. \"X\" where set (~2% of rows).","in_transfer_plant":"Stock quantity in plant-to-plant transfer.","manufacturer_name":"Manufacturer name as recorded on the stock row.","quality_inspection":"Stock quantity held in quality inspection.","value_in_stock_tfr":"Monetary value of stock in transfer.","value_unrestricted":"Monetary value of unrestricted stock, in the row currency.","base_unit_of_measure":"SAP base unit of measure (e.g. EA, M, KG). The unit quantities are expressed in.","descr_of_storage_loc":"Readable description of the storage location.","material_description":"Free-text short description. The main field used for semantic duplicate search.","restricted_use_stock":"Restricted-use stock quantity.","special_stock_number":"Reference number for the special stock. Effectively empty here.","value_in_blocked_stock":"Monetary value of blocked stock.","special_stock_indicator":"SAP special stock indicator (E = sales order stock, K = vendor consignment). Effectively empty here.","quality_inspection_value":"Monetary value of stock in quality inspection.","valuated_goods_receipt_blocked_stock":"Quantity in valuated goods-receipt blocked stock.","total_stock_in_transit_and_in_transfer":"Combined in-transit and in-transfer quantity.","valuated_goods_receipt_blocked_stock_value":"Value of valuated goods-receipt blocked stock."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'inventory_movement',
  'INVENTORY_MOVEMENT',
  'Material',
  2,
  NULL,
  ARRAY['AMOUNT','Quantity','Base_Unit_of_Measure','Material','Material_Group','Material_type','Movement_Type','Movement_Type_Desc','Movement_Type_Text','Plant','Posting_Date','Material-Plant','Event']::text[],
  ARRAY['amount','quantity','base_unit_of_measure','material','material_group','material_type','movement_type','movement_type_desc','movement_type_text','plant','posting_date','material_plant','event']::text[],
  true,
  3,
  NULL,
  NULL,
  NULL,
  ARRAY['(material)','(plant)']::text[],
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"event":"Direction flag: 1 = inbound/receipt, -1 = outbound/issue. UNVERIFIED - inferred from the two observed values.","plant":"4-digit SAP plant code. Join to all_plants.plant_code.","amount":"Monetary value of the row, in the row currency.","material":"SAP material number, 18 chars zero-padded. Primary join key across all tables.","quantity":"Quantity moved, in base_unit_of_measure. Sign follows the movement direction.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","posting_date":"Date the movement was posted. Use this for consumption-over-time analysis.","material_type":"SAP material type (e.g. ZMS). Classifies the material for valuation and procurement.","movement_type":"SAP movement type code (e.g. 101 goods receipt, 201 consumption).","material_group":"SAP material group code. Join to mat_group_description.mat_grp. Null for ~38% of materials.","material_plant":"Composite key \"material-plant\" built by the source model. Redundant with material + plant; prefer those.","movement_type_desc":"Readable description of the goods movement type.","movement_type_text":"Full text of the movement type.","base_unit_of_measure":"SAP base unit of measure (e.g. EA, M, KG). The unit quantities are expressed in."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'purchase_requisation',
  'PURCHASE_REQUISATION',
  'Purchase_Requisition',
  3,
  NULL,
  ARRAY['Quantity_ordered','Acct_Assignment_Cat_','Blocking_Indicator','Blocking_Text','Closed','Committed_date','Created_by','Creation_indicator','Currency','Deletion_indicator','Delivery_Date','Desired_Vendor','Ext__manufacturer','Fixed_indicator','Fixed_vendor','Goods_receipt','Invoice_receipt','Item_Category','Item_of_requisition','MPN_material','Manufacturer','Manufacturer_Part_No_','Material','Material_Category','Material_Group','Order_Unit','PO_Deletion_indicator','PR_Release_Date_(Final)','Plant','Processing_status','Purch__organization','Purchase_Order_Date','Purchase_Order_Release_Date_(F)','Purchase_Requisition','Purchase_order_item','Purchasing_Group','Purchasing_group_Description','Purchasing_info_rec_','Release_Date','Release_Status','Release_strategy','Requisition_date','Requisitioner','Reservation','Short_Text','Supplying_Plant','Unit_of_Measure','Materiall','Quantity','f3','Material-Plant','Column','PR-Line','Country','PR_Number_Material']::text[],
  ARRAY['quantity_ordered','acct_assignment_cat','blocking_indicator','blocking_text','closed','committed_date','created_by','creation_indicator','currency','deletion_indicator','delivery_date','desired_vendor','ext_manufacturer','fixed_indicator','fixed_vendor','goods_receipt','invoice_receipt','item_category','item_of_requisition','mpn_material','manufacturer','manufacturer_part_no','material','material_category','material_group','order_unit','po_deletion_indicator','pr_release_date_final','plant','processing_status','purch_organization','purchase_order_date','purchase_order_release_date_f','purchase_requisition','purchase_order_item','purchasing_group','purchasing_group_description','purchasing_info_rec','release_date','release_status','release_strategy','requisition_date','requisitioner','reservation','short_text','supplying_plant','unit_of_measure','materiall','quantity','f3','material_plant','column_val','pr_line','country','pr_number_material']::text[],
  true,
  4,
  NULL,
  NULL,
  NULL,
  ARRAY['(material)','(plant)','(purchase_requisition)','(purchase_requisition, item_of_requisition)']::text[],
  'incremental',
  180,
  ARRAY['Requisition_date','Release_Date','Delivery_Date','PR_Release_Date_(Final)','Purchase_Order_Date','Purchase_Order_Release_Date_(F)']::text[],
  ARRAY['purchase_requisition','item_of_requisition']::text[],
  6,
  '{"f3":"Flag: \"Same Plant\" or \"Diff Plant\", comparing the requesting and supplying plant.","plant":"4-digit SAP plant code. Join to all_plants.plant_code.","closed":"Flag indicating the PR line is closed.","country":"Country of the plant or document on this row.","pr_line":"Composite key \"PR number-item\". Redundant with purchase_requisition + item_of_requisition.","currency":"ISO currency of the monetary values on this row. Do NOT sum money across differing currencies.","material":"SAP material number, 18 chars zero-padded. Primary join key across all tables.","quantity":"Quantity requested on the PR line.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","materiall":"Material number WITHOUT zero padding, ~28% filled. Note the doubled L. Use material for joins.","column_val":"UNUSED: effectively empty. Renamed off a SQL reserved word in the source model.","created_by":"SAP user id that created the record.","order_unit":"Purchase order unit of measure, which may differ from the base unit.","short_text":"Free-text line description entered on the document.","reservation":"Linked SAP reservation number.","fixed_vendor":"Vendor fixed on the PR line, which procurement must use.","manufacturer":"Manufacturer code or name as recorded in SAP.","mpn_material":"UNUSED: 100% null in the loaded data.","release_date":"Date the PR line was released (approved).","blocking_text":"Reason text for a blocked PR line.","delivery_date":"Requested delivery date on the PR line.","goods_receipt":"Flag indicating a goods receipt is expected for this line.","item_category":"SAP item category of the PR line.","requisitioner":"Name or id of the person who raised the PR.","committed_date":"Committed delivery date. Stored as text in the source.","desired_vendor":"Vendor suggested by the requisitioner, not binding.","material_group":"SAP material group code. Join to mat_group_description.mat_grp. Null for ~38% of materials.","material_plant":"Composite key \"material-plant\" built by the source model. Redundant with material + plant; prefer those.","release_status":"SAP release/approval status of the PR line.","fixed_indicator":"Fixed-vendor flag. Effectively empty in the loaded data.","invoice_receipt":"Flag indicating an invoice receipt is expected for this line.","supplying_plant":"Supplying plant for a stock transport requisition.","unit_of_measure":"Unit of measure for the quantities on this row.","ext_manufacturer":"External manufacturer name recorded on the line.","purchasing_group":"SAP purchasing group code responsible for the document.","quantity_ordered":"Quantity already converted to a purchase order. Compare with quantity for the open amount.","release_strategy":"SAP release (approval) strategy code applied to the document.","requisition_date":"Date the PR was raised.","material_category":"Material category assigned on the PR line.","processing_status":"SAP processing status of the PR line (e.g. ordered, partially ordered).","blocking_indicator":"Blocking indicator. Effectively empty in the loaded data.","creation_indicator":"SAP PR creation indicator. Observed values R, F, V. UNVERIFIED - exact meaning not confirmed against the source system.","deletion_indicator":"SAP deletion flag. A set value means the item is flagged for deletion.","pr_number_material":"Composite \"PR number-material\" string built by the source model.","purch_organization":"SAP purchasing organisation responsible.","acct_assignment_cat":"SAP account assignment category (e.g. cost centre, project).","item_of_requisition":"PR line item number. Second half of the unique key.","purchase_order_date":"Date the resulting purchase order was created.","purchase_order_item":"Line item number on the resulting purchase order.","purchasing_info_rec":"SAP purchasing info record number linking material to supplier.","manufacturer_part_no":"Manufacturer part number (MPN). Populated for only ~31% of materials.","purchase_requisition":"PR number. With item_of_requisition forms the unique key of this table.","po_deletion_indicator":"Deletion flag on the resulting purchase order item.","pr_release_date_final":"Date of final release approval for the PR.","purchasing_group_description":"Readable name of the purchasing group.","purchase_order_release_date_f":"Final release date of the resulting purchase order."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'supplychain',
  'SUPPLYCHAIN',
  '4YSUPPLY-PURCHASE_DOC_KEY',
  3,
  NULL,
  ARRAY['DELV_QTY','DELV_VALUE','DEL_VAL_USD','EXCHANG_RATE','INVOICED_QTY','INVOICED_VAL','INV_VAL_USD','NET_ORDER_VALUE','NET_ORDER_VAL_USD','NET_PRICE','ORDER_QTY','STILL_DELV_QTY','STILL_DELV_VAL','STILL_DELV_VAL_USD','STILL_INV_QTY','STILL_INV_VAL','STILL_INV_VAL_USD','4YSUPPLY-ACC_ASSIGN_CAT_KEY','4YSUPPLY-COLLECTIVE_NUM_KEY','4YSUPPLY-COMMENT__KEY','4YSUPPLY-COMMITED_DELV_DATE_KEY','4YSUPPLY-COMP_CODE_KEY','4YSUPPLY-COMP_CO_DESC_KEY','4YSUPPLY-COUNTRY_KEY','4YSUPPLY-CREATED_BY_KEY','4YSUPPLY-CREATED_ON_KEY','4YSUPPLY-CURRENCY_KEY','4YSUPPLY-DELETION_INDICATOR_KEY','4YSUPPLY-DELV_DATE_KEY','4YSUPPLY-DELV_STATUS_KEY','4YSUPPLY-DOCUMENT_DATE_KEY','4YSUPPLY-FRGKE_KEY','4YSUPPLY-GR_DOCUMENT_DATE_KEY','4YSUPPLY-GR_ENTERY_DATE_KEY','4YSUPPLY-GR_POSTING_DATE_KEY','4YSUPPLY-INCOMPLETE_KEY','4YSUPPLY-ITEM_CAT_KEY','4YSUPPLY-ITEM_KEY','4YSUPPLY-LAST_MIGO_KEY','4YSUPPLY-MATERIAL_KEY','4YSUPPLY-MAT_GROUP_DESC_KEY','4YSUPPLY-MAT_GROUP_KEY','4YSUPPLY-MAT_TYPE_DESC_KEY','4YSUPPLY-MAT_TYPE_KEY','4YSUPPLY-MONTH__KEY','4YSUPPLY-OPCO_PO_KEY','4YSUPPLY-OPCO_QT_KEY','4YSUPPLY-ORDER_PRICE_UNIT_KEY','4YSUPPLY-ORDER_UNIT_KEY','4YSUPPLY-PACKAGE_NUM_KEY','4YSUPPLY-PAYMENT_TERMS_KEY','4YSUPPLY-PG_NAME_KEY','4YSUPPLY-PLANT_DESC_KEY','4YSUPPLY-PLANT_KEY','4YSUPPLY-PO_RELEASE_DATE_KEY','4YSUPPLY-PR_RELEASE_DATE_KEY','4YSUPPLY-PR_SUBMITTED_APPROV_KEY','4YSUPPLY-PURCHASE_DOC_KEY','4YSUPPLY-PURCHASE_REQ_KEY','4YSUPPLY-PURCHASING_INFO_REC_KEY','4YSUPPLY-PURCHASING_ORG_KEY','4YSUPPLY-PURCHASIN_GROUP_KEY','4YSUPPLY-PUR_ORG_KEY','4YSUPPLY-PU_DOC_TYPE_KEY','4YSUPPLY-QUARTER_KEY','4YSUPPLY-RELEASE_STRATEGY_KEY','4YSUPPLY-REQUESTED_DELV_DATE_KEY','4YSUPPLY-REQUISATION_DATE_KEY','4YSUPPLY-REQ_TRACKING_NUM_KEY','4YSUPPLY-SHORT_TEXT_KEY','4YSUPPLY-STATISTICAL_DELV_DATE_KEY','4YSUPPLY-STATUS_KEY','4YSUPPLY-STOCKKEEPING_UNIT_KEY','4YSUPPLY-STORAGE_LOC_KEY','4YSUPPLY-SUPPLIER_NUM_KEY','4YSUPPLY-SUPPLIER_PLANT_KEY','4YSUPPLY-SUPPLIER_PROMISE_DATE_KEY','4YSUPPLY-TAX_CODE_KEY','4YSUPPLY-YEAR__KEY','Account Classification','Material-Plant','order_unit_price','Column 2','Column 4','Same_Plant','po_material_plant','po-line','f2','PO_Line','4YSUPPLY-PO_FIRST_RELEASE_DATE_KEY','4YSUPPLY-INCO1_KEY','4YSUPPLY-INCO2_L_KEY','4YSUPPLY-INCOTERMS_TEXT_KEY','4YSUPPLY-COUNT_RELEASE_KEY','4YSUPPLY-REJECT_PO_KEY','DS_Name','Delivery_Comment','Delivery_Status','Year','Month','Quarter','MonthNo','Material_Desc','PR-Material','OPCO_country','Supplier_Country','User_Email_ID','POLine']::text[],
  ARRAY['delv_qty','delv_value','del_val_usd','exchang_rate','invoiced_qty','invoiced_val','inv_val_usd','net_order_value','net_order_val_usd','net_price','order_qty','still_delv_qty','still_delv_val','still_delv_val_usd','still_inv_qty','still_inv_val','still_inv_val_usd','acc_assign_cat','collective_num','comment','commited_delv_date','comp_code','comp_co_desc','country','created_by','created_on','currency','deletion_indicator','delv_date','delv_status','document_date','frgke','gr_document_date','gr_entery_date','gr_posting_date','incomplete','item_cat','item','last_migo','material','mat_group_desc','mat_group','mat_type_desc','mat_type','month','opco_po','opco_qt','order_price_unit','order_unit','package_num','payment_terms','pg_name','plant_desc','plant','po_release_date','pr_release_date','pr_submitted_approv','purchase_doc','purchase_req','purchasing_info_rec','purchasing_org','purchasin_group','pur_org','pu_doc_type','quarter','release_strategy','requested_delv_date','requisation_date','req_tracking_num','short_text','statistical_delv_date','status','stockkeeping_unit','storage_loc','supplier_num','supplier_plant','supplier_promise_date','tax_code','year','account_classification','material_plant','order_unit_price','column_2','column_4','same_plant','po_material_plant','po_line','f2','po_line_2','po_first_release_date','inco1','inco2_l','incoterms_text','count_release','reject_po','ds_name','delivery_comment','delivery_status','year_2','month_2','quarter_2','monthno','material_desc','pr_material','opco_country','supplier_country','user_email_id','poline']::text[],
  true,
  5,
  NULL,
  NULL,
  NULL,
  ARRAY['(material)','(plant)','(purchase_doc, item)']::text[],
  'incremental',
  180,
  ARRAY['4YSUPPLY-CREATED_ON_KEY','4YSUPPLY-DOCUMENT_DATE_KEY','4YSUPPLY-PO_RELEASE_DATE_KEY','4YSUPPLY-PR_RELEASE_DATE_KEY','4YSUPPLY-PO_FIRST_RELEASE_DATE_KEY','4YSUPPLY-GR_POSTING_DATE_KEY','4YSUPPLY-GR_DOCUMENT_DATE_KEY','4YSUPPLY-GR_ENTERY_DATE_KEY','4YSUPPLY-DELV_DATE_KEY','4YSUPPLY-STATISTICAL_DELV_DATE_KEY','4YSUPPLY-SUPPLIER_PROMISE_DATE_KEY']::text[],
  ARRAY['purchase_doc','item']::text[],
  6,
  '{"f2":"Flag: \"Same Plant\" or \"Diff Plant\", comparing ordering and supplying plant.","item":"PO line item number. Second half of the unique key.","year":"Year of the document date.","frgke":"SAP release indicator, observed values G and B. UNVERIFIED - raw SAP field name retained from the source.","inco1":"Incoterms code (e.g. DAP, FOB).","month":"Month number of the document date.","plant":"4-digit SAP plant code. Join to all_plants.plant_code.","poline":"Composite \"PO number-item\" key. Appears identical to po_line_2; prefer purchase_doc + item.","status":"Overall status of the purchase order line.","year_2":"Second year column from the source model, text. Duplicate of year in a different format.","comment":"NOT free text despite the name: short 2-character codes (e.g. \"/E\", \"S.\", \"G3\"). UNVERIFIED - meaning not confirmed.","country":"Country of the plant or document on this row.","ds_name":"UNUSED: 100% null in the loaded data.","inco2_l":"Incoterms location.","month_2":"Second month column from the source model, text.","monthno":"Month number as an integer.","opco_po":"Operating company PO reference, or the literal \"MULTI POS\" where several apply. ~5% filled.","opco_qt":"Operating company quotation reference, or \"MULTI QTS\" where several apply. ~5% filled.","pg_name":"Readable purchasing group name.","po_line":"Composite PO key built by the source model. Distinct format from po_line_2.","pur_org":"Purchasing organisation code. Overlaps purchasing_org.","quarter":"Quarter of the document date.","column_2":"Numeric attribute carried from the source model, 166k distinct values. UNVERIFIED - meaning not confirmed.","column_4":"UNUSED: always 0 in the loaded data.","currency":"ISO currency of the monetary values on this row. Do NOT sum money across differing currencies.","delv_qty":"Quantity delivered against the PO line.","item_cat":"SAP item category on the PO line.","mat_type":"Material type code on the PO line.","material":"SAP material number, 18 chars zero-padded. Primary join key across all tables.","tax_code":"SAP tax code applied to the line.","comp_code":"SAP company code owning the document.","delv_date":"Delivery date on the PO line.","last_migo":"Date of the last goods movement (MIGO) against the line. ~96% filled.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","mat_group":"Material group code on the PO line.","net_price":"Net unit price, in the row currency, per order_price_unit.","order_qty":"Quantity ordered on the PO line.","po_line_2":"Composite \"PO number-item\" key. Appears identical to the poline column; prefer purchase_doc + item.","quarter_2":"Second quarter column from the source model, text.","reject_po":"Rejection code, observed values 05, 02, 03, R. UNVERIFIED - meaning not confirmed.","created_by":"SAP user id that created the record.","created_on":"Date the purchase order was created. One of the activity dates driving incremental loading.","delv_value":"Value delivered, in the row currency.","incomplete":"Incompleteness flag. Effectively empty in the loaded data.","order_unit":"Purchase order unit of measure, which may differ from the base unit.","plant_desc":"Readable plant name, denormalised into this table.","same_plant":"Composite \"material-plant\" string, populated only where ordering and supplying plant match (~25%).","short_text":"Free-text line description entered on the document.","del_val_usd":"Value delivered, converted to USD.","delv_status":"Delivery status code. Overlaps delivery_status; check both before relying on either.","inv_val_usd":"Value invoiced, converted to USD.","package_num":"Package number for grouped shipments.","pr_material":"Composite requisition/material key built by the source model.","pu_doc_type":"Purchasing document type (e.g. standard PO, framework order).","storage_loc":"Storage location on the PO line.","comp_co_desc":"Readable company code name.","exchang_rate":"Exchange rate used for the USD conversion columns. Note the source spelling.","invoiced_qty":"Quantity invoiced against the PO line.","invoiced_val":"Value invoiced, in the row currency.","opco_country":"Country of the operating company raising the order.","purchase_doc":"Purchase order number. With item forms the unique key of this table.","purchase_req":"Originating PR number. Join back to purchase_requisation.purchase_requisition.","supplier_num":"SAP supplier (vendor) number.","count_release":"Number of release (approval) steps recorded on the document.","document_date":"Document date on the purchase order.","mat_type_desc":"Readable material type description, denormalised into this table.","material_desc":"Material short description, denormalised into this table from the material master.","payment_terms":"SAP payment terms key agreed with the supplier.","still_inv_qty":"Quantity still to be invoiced.","still_inv_val":"Value still to be invoiced, in the row currency.","user_email_id":"Email of the user associated with the document. PERSONAL DATA - do not expose in bulk output.","acc_assign_cat":"SAP account assignment category on the PO line.","collective_num":"Collective number grouping related purchasing documents.","gr_entery_date":"Goods receipt entry date. Note the source spelling.","incoterms_text":"Readable Incoterms description.","mat_group_desc":"Readable material group description.","material_plant":"Composite key \"material-plant\" built by the source model. Redundant with material + plant; prefer those.","purchasing_org":"SAP purchasing organisation.","still_delv_qty":"Quantity still to be delivered. The open order quantity.","still_delv_val":"Value still to be delivered, in the row currency.","supplier_plant":"Supplying plant for a stock transport order.","delivery_status":"Delivery status of the PO line.","gr_posting_date":"Goods receipt posting date. Use for received-on analysis.","net_order_value":"Net value of the PO line, in the row currency.","po_release_date":"Date the purchase order was released (approved).","pr_release_date":"Release date of the originating purchase requisition.","purchasin_group":"Purchasing group code. Note the source spelling.","delivery_comment":"Free-text comment on delivery.","gr_document_date":"Goods receipt document date.","order_price_unit":"Quantity that net_price refers to (e.g. price per 100).","order_unit_price":"Unit price expressed in the order unit.","release_strategy":"SAP release (approval) strategy code applied to the document.","req_tracking_num":"Requirement tracking number carried from the requisition.","requisation_date":"Date of the originating requisition. Stored as text. Note the source spelling.","supplier_country":"Country of the supplier.","net_order_val_usd":"Net value of the PO line converted to USD. Use this to total across currencies.","po_material_plant":"Composite PO/material/plant key built by the source model.","still_inv_val_usd":"Value still to be invoiced, converted to USD.","stockkeeping_unit":"Stock keeping unit for the line.","commited_delv_date":"Committed delivery date. Stored as text. Note the source spelling.","deletion_indicator":"SAP deletion flag. A set value means the item is flagged for deletion.","still_delv_val_usd":"Value still to be delivered, converted to USD.","pr_submitted_approv":"Flag or date indicating the requisition was submitted for approval.","purchasing_info_rec":"SAP purchasing info record number linking material to supplier.","requested_delv_date":"Delivery date originally requested. Stored as text.","po_first_release_date":"Date of the first release on the purchase order.","statistical_delv_date":"Statistical delivery date used for on-time measurement.","supplier_promise_date":"Delivery date promised by the supplier.","account_classification":"Account classification code. Join to account_classification_mapping."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'soh_aging_live',
  'SOH_AGING_LIVE',
  'Material',
  2,
  NULL,
  ARRAY['AMOUNT','Number_of_Days','Company_Code','Company_Name','Country','Country_Desc','Date','Ledger','Mat_Grp_Desc','Mat_Type_Desc','Material','Material_Group','Material_type','Movement_Type_Desc','Plant','Profit_Center','Profit_Center_Desc','Segment','Segment_Desc','MAX_Date','Stock_Quantity','Material-Plant','Material_Desc','Material_Manf_No']::text[],
  ARRAY['amount','number_of_days','company_code','company_name','country','country_desc','date','ledger','mat_grp_desc','mat_type_desc','material','material_group','material_type','movement_type_desc','plant','profit_center','profit_center_desc','segment','segment_desc','max_date','stock_quantity','material_plant','material_desc','material_manf_no']::text[],
  true,
  6,
  NULL,
  NULL,
  NULL,
  ARRAY['(material)','(plant)']::text[],
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"date":"Snapshot date. A single value across the table - it is regenerated in full each day.","plant":"4-digit SAP plant code. Join to all_plants.plant_code.","amount":"Monetary value of the row, in the row currency.","ledger":"Accounting ledger. Constant \"0L\" (SAP leading ledger) in the loaded data.","country":"Country of the plant or document on this row.","segment":"Business segment code.","material":"SAP material number, 18 chars zero-padded. Primary join key across all tables.","max_date":"Latest relevant movement date used to compute the age.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","company_code":"SAP company code.","company_name":"Readable company name.","country_desc":"Readable country name.","mat_grp_desc":"Readable material group description, denormalised into this table.","segment_desc":"Readable business segment name.","mat_type_desc":"Readable material type description, denormalised into this table.","material_desc":"Material short description, denormalised into this table from the material master.","material_type":"SAP material type (e.g. ZMS). Classifies the material for valuation and procurement.","profit_center":"SAP profit centre code.","material_group":"SAP material group code. Join to mat_group_description.mat_grp. Null for ~38% of materials.","material_plant":"Composite key \"material-plant\" built by the source model. Redundant with material + plant; prefer those.","number_of_days":"Age of the stock in days at snapshot time.","stock_quantity":"Stock quantity in this aging snapshot row.","material_manf_no":"Manufacturer part number, denormalised into this table.","movement_type_desc":"Readable description of the goods movement type.","profit_center_desc":"Readable profit centre name."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'soh_quantity_per_store',
  'SOH_QUANTITY_PER_STORE',
  'Material',
  1,
  NULL,
  ARRAY['Stock_Quantity','Material','Plant','Storage_Location','Storage_Location_Desc','Material-Plant','VDC','Country','VDC_Country']::text[],
  ARRAY['stock_quantity','material','plant','storage_location','storage_location_desc','material_plant','vdc','country','vdc_country']::text[],
  true,
  7,
  NULL,
  NULL,
  NULL,
  ARRAY['(material)','(plant)']::text[],
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"vdc":"Vendor Distribution Centre flag: \"1\" = VDC stock, \"0\" = non-VDC. Default stock questions to VDC.","plant":"4-digit SAP plant code. Join to all_plants.plant_code.","country":"Country of the plant or document on this row.","material":"SAP material number, 18 chars zero-padded. Primary join key across all tables.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","vdc_country":"Country of the VDC holding the stock.","material_plant":"Composite key \"material-plant\" built by the source model. Redundant with material + plant; prefer those.","stock_quantity":"Stock quantity at this material/plant/storage location.","storage_location":"SAP storage location code within the plant.","storage_location_desc":"Readable name of the storage location."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'soh_aging_gi_gr_dates_live',
  'SOH_AGING_GI/GR_Dates_Live',
  'Material',
  1,
  NULL,
  ARRAY['Material','Plant','GI','GR','Null','Last_used_Date','aging_Days','Material_Plant','year_Aging','Consumption']::text[],
  ARRAY['material','plant','gi','gr','null_val','last_used_date','aging_days','material_plant','year_aging','consumption']::text[],
  true,
  8,
  NULL,
  NULL,
  NULL,
  ARRAY['(material)','(plant)']::text[],
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"gi":"Date of the last goods issue for this material/plant. ~67% filled.","gr":"Date of the last goods receipt for this material/plant. ~48% filled.","plant":"4-digit SAP plant code. Join to all_plants.plant_code.","material":"SAP material number, 18 chars zero-padded. Primary join key across all tables.","null_val":"UNUSED: contains the literal string \"Null\" on every row. An artefact of the source model; renamed off a SQL reserved word.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","aging_days":"Days since last_used_date. Use for slow-mover analysis.","year_aging":"Aging bucket label (e.g. \"<6 months\", \"1 - 2 Years\").","consumption":"Consumption quantity recorded for the period.","last_used_date":"Most recent of the goods issue and goods receipt dates.","material_plant":"Composite key \"material-plant\" built by the source model. Redundant with material + plant; prefer those."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'all_plants',
  'All Plants',
  NULL,
  0,
  NULL,
  ARRAY['Plant Code','Co. Code','Legal Entity','SAP Plant Name','SAP Segment','Segment Group','Country of Legal Entity','Reporting Country - Finance','Reporting Segment - Finance','Reporting Segment Group - Finance','Country-Segment']::text[],
  ARRAY['plant_code','co_code','legal_entity','sap_plant_name','sap_segment','segment_group','country_of_legal_entity','reporting_country_finance','reporting_segment_finance','reporting_segment_group_finance','country_segment']::text[],
  true,
  9,
  NULL,
  NULL,
  NULL,
  ARRAY['(plant_code)']::text[],
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"co_code":"SAP company code the plant belongs to.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","plant_code":"4-digit plant code. The join target for every other table plant column.","sap_segment":"Business segment the plant belongs to.","legal_entity":"Legal entity owning the plant.","segment_group":"Higher-level grouping of business segments.","sap_plant_name":"Readable plant name. Use this when displaying plants to users.","country_segment":"Combined country and segment label.","country_of_legal_entity":"Country of the owning legal entity.","reporting_country_finance":"Country used for finance reporting, which may differ from the legal entity country.","reporting_segment_finance":"Segment used for finance reporting.","reporting_segment_group_finance":"Segment group used for finance reporting."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'mat_group_description',
  'Mat Group Description',
  NULL,
  0,
  NULL,
  ARRAY['Mat. Grp.','Description']::text[],
  ARRAY['mat_grp','description']::text[],
  true,
  10,
  NULL,
  NULL,
  NULL,
  NULL,
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"mat_grp":"Material group code. Join target for material_group on other tables.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","description":"Readable material group description."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'account_classification_mapping',
  'Account Classification Mapping',
  NULL,
  0,
  NULL,
  ARRAY['Account Classification','Account Classification Description']::text[],
  ARRAY['account_classification','account_classification_description']::text[],
  true,
  11,
  NULL,
  NULL,
  NULL,
  NULL,
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source.","account_classification":"Account classification code. Join target for supplychain.account_classification.","account_classification_description":"Readable account classification description."}'::jsonb
);

INSERT INTO core.load_config (pg_table, dax_table, bucket_col, bucket_chars, dax_filter, src_cols, pg_cols, enabled, load_order, dax_source, bucket_min, bucket_max, index_defs, load_mode, incr_days, incr_date_cols, key_cols, full_reload_dow, col_comments) VALUES (
  'material_plant_extension',
  'MB52',
  'Material',
  2,
  NULL,
  ARRAY['Material','Plant']::text[],
  ARRAY['material','plant']::text[],
  true,
  12,
  'SUMMARIZE(''MB52'', ''MB52''[Material], ''MB52''[Plant])',
  NULL,
  NULL,
  ARRAY['(material)','(plant)']::text[],
  'full',
  NULL,
  NULL,
  NULL,
  NULL,
  '{"plant":"4-digit plant code the material is extended to.","material":"SAP material number, 18 chars zero-padded.","loaded_at":"Timestamp this row was written by the Data Loader. Operational metadata, not from the source."}'::jsonb
);
