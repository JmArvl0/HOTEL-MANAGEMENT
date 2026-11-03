-- Keep a receipt failure in the same transaction as its payment and folio.
create function public.hms_collect_payment(p_reservation_id text,p_amount numeric,p_method text,p_reference text,p_idempotency_key uuid,p_staff_user_id uuid,p_allow_overpayment boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare paid_record record; receipt jsonb;
begin
 select * into paid_record from record_staff_payment(p_reservation_id,p_amount,p_method,p_reference,p_idempotency_key,p_staff_user_id,p_allow_overpayment,false);
 receipt:=accounting_generate_document('receipt',null,paid_record.payment_id,p_idempotency_key,p_staff_user_id);
 return to_jsonb(paid_record)||jsonb_build_object('receipt',receipt);
end$$;
create function public.hms_cash_close_explanation() returns trigger language plpgsql set search_path=public as $$
begin
 if old.status='open' and new.status='closed' then
  if new.actual_cash='NaN'::numeric or new.actual_cash<0 then raise exception 'INVALID_COUNTED_CASH'; end if;
  if new.variance<>0 and length(trim(coalesce(new.close_notes,'')))<3 then raise exception 'VARIANCE_EXPLANATION_REQUIRED'; end if;
 end if;
 return new;
end$$;
create trigger hms_cash_count_explanation before update of status on public.cash_shifts for each row execute function public.hms_cash_close_explanation();
revoke all on function public.hms_collect_payment(text,numeric,text,text,uuid,uuid,boolean),public.hms_cash_close_explanation() from public,anon,authenticated;
grant execute on function public.hms_collect_payment(text,numeric,text,text,uuid,uuid,boolean) to service_role;
