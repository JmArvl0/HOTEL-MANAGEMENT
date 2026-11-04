-- Executed inside a caller-owned transaction and always rolled back.
-- Only new fictional fixtures; never updates an existing guest/drawer/stock row.
do $$
declare
 tag text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);
 hk uuid:=gen_random_uuid(); fd uuid:=gen_random_uuid(); guest uuid:=gen_random_uuid();
 item text; reservation text; invoice text; op uuid:=gen_random_uuid();
 doc uuid:=gen_random_uuid(); handover uuid:=gen_random_uuid(); shift uuid;
 req uuid:=gen_random_uuid(); batch uuid:=gen_random_uuid(); v_room_id text;
 result jsonb; retry jsonb; current_stock numeric;
begin
 item:='HMS-SMOKE-'||tag; reservation:='HMS-SMOKE-R-'||tag; invoice:='HMS-SMOKE-I-'||tag;
 insert into user_accounts(id,email,name,role,password_hash) values
 (hk,'hk-'||tag||'@example.invalid','HMS rollback-only housekeeping','housekeeping','invalid-test-only'),
 (fd,'fd-'||tag||'@example.invalid','HMS rollback-only front desk','front_desk','invalid-test-only'),
 (guest,'guest-'||tag||'@example.invalid','HMS rollback-only guest','guest','invalid-test-only');
 insert into inventory(id,name,category,quantity,unit) values(item,'HMS rollback-only supply','Amenities',10,'pieces');
 perform hms_stock_movement(hk,op,item,'issue',2,null,'Rollback-only smoke','Test fixture');
 perform hms_stock_movement(hk,op,item,'issue',2,null,'Rollback-only smoke','Test fixture');
 select quantity into current_stock from inventory where id=item;
 if current_stock<>8 or (select count(*) from inventory_movements where source_type='stock_operation' and source_id=op::text)<>1 then raise exception 'SMOKE_STOCK_RETRY_FAILED'; end if;
 begin
  perform hms_stock_movement(guest,gen_random_uuid(),item,'issue',1,null,'Forbidden test','Test fixture');
  raise exception 'SMOKE_STOCK_ROLE_FAILED';
 exception when others then if sqlerrm<>'STOCK_FORBIDDEN' then raise; end if; end;
 begin
  perform hms_stock_movement(hk,gen_random_uuid(),item,'issue',99,null,'Shortage test','Test fixture');
  raise exception 'SMOKE_STOCK_SHORTAGE_FAILED';
 exception when others then if sqlerrm<>'STOCK_INSUFFICIENT' then raise; end if; end;
 perform hms_save_guest_profile(guest,'HMS updated test guest','','','');
 if (select name from user_accounts where id=guest)<>'HMS updated test guest' or (select name from guests where user_account_id=guest)<>'HMS updated test guest' then raise exception 'SMOKE_PROFILE_FAILED'; end if;
 insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values(reservation,guest,'HMS original booking name','Test',current_date,current_date+1,'confirmed',1000);
 insert into invoices(id,reservation_id,guest_name,amount,balance,status) values(invoice,reservation,'HMS original booking name',1000,1000,'unpaid');
 v_room_id:='HMS-SMOKE-ROOM-'||tag;
 insert into rooms(id,number,floor,type,rate) values(v_room_id,'HMS-'||tag,1,'Test',100);
 update reservations set room_id=v_room_id,room_number='HMS-'||tag where id=reservation;
 insert into guest_requests(id,reservation_id,request,department,batch_id) values(req,reservation,'Rollback-only pending supply','housekeeping',batch);
 if exists(select 1 from housekeeping_tasks where guest_request_id=req) then raise exception 'SMOKE_PREMATURE_TASK'; end if;
 perform customer_withdraw_guest_request(guest,req,1);
 if (select approval_status from guest_requests where id=req)<>'withdrawn' then raise exception 'SMOKE_WITHDRAWAL_FAILED'; end if;
 req:=gen_random_uuid(); batch:=gen_random_uuid();
 insert into guest_requests(id,reservation_id,request,department,batch_id) values(req,reservation,'Rollback-only approved supply','housekeeping',batch);
 perform front_desk_review_guest_request_batch(fd,batch,'approve',null);
 if (select count(*) from housekeeping_tasks where guest_request_id=req)<>1 then raise exception 'SMOKE_APPROVAL_ROUTING_FAILED'; end if;
 insert into guest_id_documents(id,reservation_id,user_id,storage_path) values(doc,reservation,guest,'rollback-only-placeholder');
 perform hms_verify_uploaded_id(fd,reservation,doc);
 if (select identity_status from reservations where id=reservation)<>'verified' or (select status from guest_id_documents where id=doc)<>'verified' then raise exception 'SMOKE_ID_FAILED'; end if;
 perform submit_shift_handover(fd,handover,'Rollback-only handover','reservation',reservation,fd);
 perform act_shift_handover(fd,handover,1,'acknowledge','');
 perform act_shift_handover(fd,handover,2,'resolve','Rollback smoke completed');
 if (select resolved_at from shift_handovers where id=handover) is null then raise exception 'SMOKE_HANDOVER_FAILED'; end if;
 -- Never reuse, close or modify a real drawer. If another staff member opened
 -- one after preflight, leave the cash lifecycle to the isolated SQL suite.
 if not exists(select 1 from cash_shifts where status='open') then
  result:=accounting_open_cash_shift(fd,'HMS rollback-only test',100);
  shift:=(result->>'shiftId')::uuid; op:=gen_random_uuid();
  result:=hms_collect_payment(reservation,200,'cash',null,op,fd,false);
  retry:=hms_collect_payment(reservation,200,'cash',null,op,fd,false);
  if result->>'payment_id' is distinct from retry->>'payment_id' or result->'receipt' is null then raise exception 'SMOKE_PAYMENT_RECEIPT_FAILED'; end if;
  result:=accounting_close_cash_shift(shift,300,'Rollback-only balanced count',gen_random_uuid(),fd);
  if (result->>'expectedCash')::numeric<>300 or (result->>'variance')::numeric<>0 then raise exception 'SMOKE_CASH_COUNT_FAILED'; end if;
 end if;
end$$;
