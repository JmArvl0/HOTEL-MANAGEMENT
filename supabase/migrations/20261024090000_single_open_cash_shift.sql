-- 20261024090000_single_open_cash_shift.sql
--
-- One property-wide open cash shift. The per-staff guard
-- (CASH_SHIFT_ALREADY_OPEN for the same cashier) allowed concurrent opens
-- across different staff, so the header (my shift), the summary/ledger (all
-- shifts), and the ever-offered Open button disagreed with each other.
--
-- Change: refuse a new open while ANY shift is open, serialized on an
-- advisory lock so two simultaneous opens cannot both slip through.
-- Same code (CASH_SHIFT_ALREADY_OPEN), so existing route mapping holds.
--
-- Body below is the LIVE body (read via pg_get_functiondef 2026-10-02),
-- which carries tighter actor roles (front_desk/accounting only) than the
-- 20260829020000 file — preserved verbatim here, plus the two additions.
-- Grants survive CREATE OR REPLACE (live: service_role only).

create or replace function public.accounting_open_cash_shift(p_staff_user_id uuid,p_location text,p_opening_amount numeric)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception'INVALID_OPENING_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextended('cash_shift_open',0));
 if exists(select 1 from cash_shifts where status='open')then raise exception'CASH_SHIFT_ALREADY_OPEN';end if;
 insert into cash_shifts(staff_user_id,location,opening_amount)values(p_staff_user_id,coalesce(nullif(trim(p_location),''),'Front Desk'),round(p_opening_amount,2))returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'open_cash_shift','cash_shift',v_id::text,jsonb_build_object('openingAmount',round(p_opening_amount,2),'location',coalesce(nullif(trim(p_location),''),'Front Desk')));
 return jsonb_build_object('shiftId',v_id,'status','open','openingAmount',round(p_opening_amount,2));end$$;
