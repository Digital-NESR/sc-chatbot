-- Loader configuration for the five Track My Request models.
-- Apply AFTER db/track_sources.sql, which creates the tables.

INSERT INTO core.load_config
  (pg_table, dax_table, dataset_id, dax_filter, dax_source, bucket_col, bucket_chars,
   src_cols, pg_cols, enabled, load_order, load_mode, index_defs)
VALUES

-- GR/IR clearing: uncleared entries only (23,969 of 2,838,448).
('ub_grir','UB_GRIR','3207bcaa-d8fd-4e6e-9e7b-a527a14a2d4d',
 'ISBLANK(''UB_GRIR''[Clrng_doc_]) || ''UB_GRIR''[Clrng_doc_] = ""', NULL,
 'Document_Number', 1,
 ARRAY['Purchasing_Doc_','Item','purchase-item','Document_Number','Document_Type','Document_Type_Desc','Fiscal_Year','Clrng_doc_','Posting_Date','Document_Date','Vendor','Vendor___Creditor_Name','PO_Creator','User_Name','Account','Account_Number','Account_type','Assignment','Reference','Doc_Header_Text','Text','Amnt_in_Bal_Tr_Crcy','Amnt_in_CompCd_Crcy','Transaction_Currency','CompanyCode_Currency','Company_Code','Country','Plant_Code','Profit_Center','Profit_Center_Desc','Segment','Segment_Desc','Aging_Buckets','Aging_Groups'],
 ARRAY['purchasing_doc','item','purchase_item','document_number','document_type','document_type_desc','fiscal_year','clearing_doc','posting_date','document_date','vendor','vendor_creditor_name','po_creator','user_name','account','account_number','account_type','assignment','reference','doc_header_text','doc_text','amnt_in_bal_tr_crcy','amnt_in_compcd_crcy','transaction_currency','companycode_currency','company_code','country','plant_code','profit_center','profit_center_desc','segment','segment_desc','aging_buckets','aging_groups'],
 true, 14, 'full', ARRAY['(purchasing_doc, item)','(document_number)','(vendor)']),

-- Supplier invoices: PO-linked only (373,241 of 774,298).
('ap_aging','AP_AGING','d82320c0-ecd2-46f0-85b3-e37cbdfd2844',
 'NOT(ISBLANK(''AP_AGING''[Purchasing_Document])) && ''AP_AGING''[Purchasing_Document] <> ""', NULL,
 'Purchasing_Document', 2,
 ARRAY['Purchasing_Document','Document_Number','Document_Type','Document_Type_Description','Invoice_Ref_','Vendor','Vendor_Name','Company_Code','Country','Segment','Posting_Date','Document_Date','Baseline_Date','Due_On','Payment_Term','Transaction_Currency','Amnt_in_Bal_Tr_Crcy','Amount_in_CompCd_Crcy','invoice_amount','Payment_Amount','Invoice_Balance','BaseLine_AgingDays','DueDate_AgingDays','Payable_category'],
 ARRAY['purchasing_document','document_number','document_type','document_type_description','invoice_ref','vendor','vendor_name','company_code','country','segment','posting_date','document_date','baseline_date','due_on','payment_term','transaction_currency','amnt_in_bal_tr_crcy','amount_in_compcd_crcy','invoice_amount','payment_amount','invoice_balance','baseline_agingdays','duedate_agingdays','payable_category'],
 true, 15, 'full', ARRAY['(purchasing_document)','(document_number)','(vendor)']),

-- Approval matrix: deduped in dax_source, 510,608 distinct of 1,035,384.
('release_strategy','RELEASE_STRATEGY','fcc6b69a-2931-4a66-8110-162e4e1da178',
 NULL,
 'SUMMARIZE(''RELEASE_STRATEGY'', ''RELEASE_STRATEGY''[Release_Group], ''RELEASE_STRATEGY''[Release_strategy], ''RELEASE_STRATEGY''[Release_code], ''RELEASE_STRATEGY''[Approver], ''RELEASE_STRATEGY''[Email], ''RELEASE_STRATEGY''[MinValue_], ''RELEASE_STRATEGY''[MaxValue_], ''RELEASE_STRATEGY''[Document_Type], ''RELEASE_STRATEGY''[Plant], ''RELEASE_STRATEGY''[Purchasing_Group], ''RELEASE_STRATEGY''[Status])',
 'Plant', 2,
 ARRAY['Release_Group','Release_strategy','Release_code','Approver','Email','MinValue_','MaxValue_','Document_Type','Plant','Purchasing_Group','Status'],
 ARRAY['release_group','release_strategy','release_code','approver','email','min_value','max_value','document_type','plant','purchasing_group','status'],
 true, 16, 'full', ARRAY['(release_strategy, release_code)','(plant)']),

-- Requisitions under release, and who they are sitting with (33,743).
('pr_release','PR_RELEASE','01b38283-6b78-4ccc-9797-4238d4c1bd55',
 '''PR_RELEASE''[Release_Indicator] = "Under Release"', NULL,
 'PR_Sitting_Release', 1,
 ARRAY['PR_Sitting_Release','PR_Line_Number','PR_Type','Requester','Full_Name','With_Whom','Release_Indicator','PR_Submission','PR_Release_Date','Days_Since_PR_Submission','Days_Since_Last_Release','Days_To_Release','Material_Group','Plant','Company_Code','Country','Segement','Deletion_Indicator'],
 ARRAY['pr_number','pr_line_number','pr_type','requester','full_name','with_whom','release_indicator','pr_submission','pr_release_date','days_since_pr_submission','days_since_last_release','days_to_release','material_group','plant','company_code','country','segment','deletion_indicator'],
 true, 17, 'full', ARRAY['(pr_number)','(with_whom)','(requester)']),

-- Purchase orders under release, and who they are sitting with (4,647).
('po_release','PO_RELEASE','01b38283-6b78-4ccc-9797-4238d4c1bd55',
 '''PO_RELEASE''[Release_Indicator] = "Under Release"', NULL,
 'PO_Number', 1,
 ARRAY['PO_Number','PO_Line_Number','PO_Line','PR_Number','PR_Line_Number','PO_Type','Buyer','Full_Name','With_Whom','Release_Indicator','PO_Creation_Date','PO_Submission_Date','PO_Release_Date','PO_Days_Since_Creation','PO_Days_Since_Last_Release','PO_Day_To_Release','Item_Category','Account_Assignement','Material_Group','Plant','Company_Code','Country','Segement','Deletion_Indicator'],
 ARRAY['po_number','po_line_number','po_line','pr_number','pr_line_number','po_type','buyer','full_name','with_whom','release_indicator','po_creation_date','po_submission_date','po_release_date','po_days_since_creation','po_days_since_last_release','po_day_to_release','item_category','account_assignement','material_group','plant','company_code','country','segment','deletion_indicator'],
 true, 18, 'full', ARRAY['(po_number, po_line_number)','(pr_number)','(with_whom)']),

-- Open PO analysis, including the only in-transit quantity we have (20,999).
('zmb5oa','ZMB5OA','3b840a4d-7de1-4273-9971-d1f1d5fdca73',
 NULL, NULL, 'OPCO_Purchasing_Document', 1,
 ARRAY['OPCO_Purchasing_Document','Item','PO_Line','Material','Material_Description','Supplier','Supplier_Name','Plant','Plant_Name','Company_Code','Country_Code','Country_Name','Status','Delivery_Completed','Origin_Acceptance','Acct_Assignment_Cat_','PO_Creation_Date','PO_Fully_Released_Date','Order_Quantity','Fully_Delivered_Quantity','Fully_Delivered_Amount','Intransit_Quantity','Intransit_Amount','Not_Collected_Quantity','Not_Collected_Amount'],
 ARRAY['purchasing_document','item','po_line','material','material_description','supplier','supplier_name','plant','plant_name','company_code','country_code','country_name','status','delivery_completed','origin_acceptance','acct_assignment_cat','po_creation_date','po_fully_released_date','order_quantity','fully_delivered_quantity','fully_delivered_amount','intransit_quantity','intransit_amount','not_collected_quantity','not_collected_amount'],
 true, 19, 'full', ARRAY['(purchasing_document, item)','(material)','(plant)'])

ON CONFLICT (pg_table) DO UPDATE SET
  dax_table=EXCLUDED.dax_table, dataset_id=EXCLUDED.dataset_id,
  dax_filter=EXCLUDED.dax_filter, dax_source=EXCLUDED.dax_source,
  bucket_col=EXCLUDED.bucket_col, bucket_chars=EXCLUDED.bucket_chars,
  src_cols=EXCLUDED.src_cols, pg_cols=EXCLUDED.pg_cols,
  enabled=EXCLUDED.enabled, load_order=EXCLUDED.load_order,
  load_mode=EXCLUDED.load_mode, index_defs=EXCLUDED.index_defs;
