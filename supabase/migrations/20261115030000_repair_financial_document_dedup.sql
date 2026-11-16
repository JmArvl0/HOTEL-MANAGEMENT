-- Repair the already-applied 20261115010000 document function. That version
-- compared only invoice totals, did not serialize concurrent issuance, and
-- replaced the terminal-settlement fields added by 20261103160000. Preserve
-- existing immutable documents and patch the installed body additively.
do $migration$
declare
  body text;
  old_start integer;
  number_pos integer;
  number_marker text := 'v_number:=case p_document_type';
  insert_marker text := 'insert into financial_documents(document_number';
  folio_marker text := '''folioAmount'',i.amount';
begin
  select pg_get_functiondef('public.accounting_generate_document(text,text,uuid,uuid,uuid)'::regprocedure) into body;
  old_start := strpos(body, '-- Dedup folio statements:');
  number_pos := strpos(body, number_marker);
  if old_start=0 or number_pos<=old_start or strpos(body, insert_marker)=0 then
    raise exception 'DOCUMENT_FUNCTION_BODY_UNEXPECTED';
  end if;

  -- Remove the old five-total shortcut before installing a full-content check.
  body := substr(body,1,old_start-1) || substr(body,number_pos);
  if strpos(body, '''terminalSettlement''')=0 then
    if strpos(body,folio_marker)=0 then raise exception 'DOCUMENT_SETTLEMENT_BODY_UNEXPECTED';end if;
    body := replace(body,folio_marker,
      '''originalFolioAmount'',coalesce((i.terminal_settlement->>''originalAmount'')::numeric,i.amount),''terminalSettlement'',i.terminal_settlement,'||folio_marker);
  end if;

  body := replace(body, number_marker, $before_number$
 if p_document_type='receipt' then
  perform pg_advisory_xact_lock(hashtextextended('receipt-document:'||p.id::text,0));
  select * into existing from financial_documents
   where document_type='receipt' and payment_id=p.id
   order by created_at,id limit 1;
  if found then
   return jsonb_build_object('documentId',existing.id,'documentNumber',existing.document_number,'documentType',existing.document_type,'snapshot',existing.snapshot,'deduplicated',true);
  end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('folio-statement:'||r.id,0));
 end if;
 $before_number$ || number_marker);

  body := replace(body, insert_marker, $before_insert$
 if p_document_type='folio' then
  select * into existing from financial_documents
   where reservation_id=r.id and document_type='folio'
     and (snapshot - 'documentNumber' - 'generatedAt') = (v_snapshot - 'documentNumber' - 'generatedAt')
   order by created_at,id limit 1;
  if found then
   return jsonb_build_object('documentId',existing.id,'documentNumber',existing.document_number,'documentType',existing.document_type,'snapshot',existing.snapshot,'deduplicated',true);
  end if;
 end if;
 $before_insert$ || insert_marker);

  execute body;
end $migration$;

revoke all on function public.accounting_generate_document(text,text,uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.accounting_generate_document(text,text,uuid,uuid,uuid) from anon,authenticated;
grant execute on function public.accounting_generate_document(text,text,uuid,uuid,uuid) to service_role;
