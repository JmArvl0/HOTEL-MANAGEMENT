// Real SQL on the dedicated loopback scratch database, never .env.local.
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const database=process.env.HMS_TEST_DATABASE || 'hms_integrity_test';
assert.ok(['hms_integrity_test','hms_integrity_verify2'].includes(database));
const config={host:'127.0.0.1',port:55439,user:'haven_hms_test',database};
const c=new pg.Client(config);await c.connect();
const q=(sql,args=[])=>c.query(sql,args);let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
async function rejects(sql,args,code){await q('savepoint expected');try{await assert.rejects(()=>q(sql,args),e=>e.message.includes(code));}finally{await q('rollback to savepoint expected');await q('release savepoint expected');}}
const ids=Object.fromEntries(['guest','front_desk','housekeeping','maintenance','manager','accounting','owner','admin'].map(r=>[r,randomUUID()]));
const tag=randomUUID().slice(0,8),item='HMS-'+tag,res='HMS-R-'+tag;
try{
 // Apply only the additional migration if this test DB predates it.
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^20261103(100000|110000|120000)_/.test(f))){const version=file.split('_')[0];if(!(await q('select 1 from supabase_migrations.schema_migrations where version=$1',[version])).rowCount){await q(fs.readFileSync('supabase/migrations/'+file,'utf8'));await q('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)',[version,file]);}}
 await q('begin');
 for(const [role,id] of Object.entries(ids))await q("insert into user_accounts(id,email,name,role,password_hash) values($1,$2,$3,$4,'test-only-invalid')",[id,role+tag+'@example.invalid','Test '+role,role]);
 await q("insert into inventory(id,name,category,quantity,unit,reorder_point) values($1,'Test towels','Amenities',10,'pieces',2)",[item]);
 await q("insert into reservations(id,user_id,guest_name,room_type,check_in,check_out,status,total) values($1,$2,'Historic guest name','Test',current_date,current_date+1,'confirmed',1000)",[res,ids.guest]);
 await q("insert into invoices(id,reservation_id,guest_name,amount,balance,status) values($1,$2,'Historic guest name',1000,1000,'unpaid')",['HMS-I-'+tag,res]);
 const issue="select hms_stock_movement($1,$2,$3,'issue',$4,null,'Guest supplies','Room test') value";
 const key=randomUUID();
 await test('stock issue, exact retry and conflict',async()=>{await q(issue,[ids.housekeeping,key,item,2]);await q(issue,[ids.housekeeping,key,item,2]);assert.equal(Number((await q('select quantity from inventory where id=$1',[item])).rows[0].quantity),8);assert.equal((await q("select count(*)::int n from inventory_movements where source_id=$1",[key])).rows[0].n,1);await rejects(issue,[ids.housekeeping,key,item,3],'STOCK_RETRY_CONFLICT');});
 await test('shortage and unauthorized role do not deduct',async()=>{await rejects(issue,[ids.housekeeping,randomUUID(),item,99],'STOCK_INSUFFICIENT');for(const r of ['guest','manager','accounting','owner','admin','front_desk'])await rejects(issue,[ids[r],randomUUID(),item,1],'STOCK_FORBIDDEN');});
 await test('stale correction cannot overwrite a newer balance',async()=>{await rejects("select hms_stock_movement($1,$2,$3,'count',4,'2000-01-01','Physical count','Test')",[ids.housekeeping,randomUUID(),item],'STOCK_STALE');});
 await test('movement failure rolls back stock and operation',async()=>{await q("alter table inventory_movements add constraint test_hms_fail check(source_type is distinct from 'stock_operation') not valid");await rejects(issue,[ids.housekeeping,randomUUID(),item,1],'test_hms_fail');assert.equal(Number((await q('select quantity from inventory where id=$1',[item])).rows[0].quantity),8);await q('alter table inventory_movements drop constraint test_hms_fail');});
 await test('guest profile and account save together without changing booking history',async()=>{await q("select hms_save_guest_profile($1,'Updated Guest','000','Test address','Test')",[ids.guest]);assert.equal((await q('select name from user_accounts where id=$1',[ids.guest])).rows[0].name,'Updated Guest');assert.equal((await q('select name from guests where user_account_id=$1',[ids.guest])).rows[0].name,'Updated Guest');assert.equal((await q('select guest_name from reservations where id=$1',[res])).rows[0].guest_name,'Historic guest name');});
 await test('audit failure rolls back both profile writes',async()=>{await q("alter table audit_logs add constraint test_hms_audit check(action<>'customer_update_profile') not valid");await rejects("select hms_save_guest_profile($1,'Should rollback','','','')",[ids.guest],'test_hms_audit');assert.equal((await q('select name from user_accounts where id=$1',[ids.guest])).rows[0].name,'Updated Guest');assert.equal((await q('select name from guests where user_account_id=$1',[ids.guest])).rows[0].name,'Updated Guest');await q('alter table audit_logs drop constraint test_hms_audit');});
 await test('existing unique account link blocks duplicate profiles',async()=>{await rejects("insert into guests(name,email,user_account_id) values('Duplicate',$1,$2)",['duplicate'+tag+'@example.invalid',ids.guest],'guests_user_account_unique');});
 const doc=randomUUID(),doc2=randomUUID();
 await q("insert into guest_id_documents(id,reservation_id,user_id,storage_path,created_at) values($1,$2,$3,'test-placeholder',now()-interval '1 minute')",[doc,res,ids.guest]);
 await test('uploaded ID review verifies both records; replacement invalidates decision',async()=>{await q('select hms_verify_uploaded_id($1,$2,$3)',[ids.front_desk,res,doc]);assert.equal((await q('select identity_status from reservations where id=$1',[res])).rows[0].identity_status,'verified');assert.equal((await q('select status from guest_id_documents where id=$1',[doc])).rows[0].status,'verified');await q("insert into guest_id_documents(id,reservation_id,user_id,storage_path) values($1,$2,$3,'replacement-placeholder')",[doc2,res,ids.guest]);assert.equal((await q('select identity_status from reservations where id=$1',[res])).rows[0].identity_status,'unverified');await rejects('select hms_verify_uploaded_id($1,$2,$3)',[ids.front_desk,res,doc],'DOCUMENT_STALE');await rejects('select hms_verify_uploaded_id($1,$2,$3)',[ids.guest,res,doc2],'IDENTITY_VERIFICATION_FORBIDDEN');});
 await test('mapped department fulfillment consumes once and shortage rolls back request completion',async()=>{
 const request=randomUUID();
 await q("insert into guest_requests(id,reservation_id,request,department,inventory_item_id,approval_status) values($1,$2,'Test supplies','housekeeping',$3,'approved')",[request,res,item]);
 await q("select staff_progress_guest_request($1,'start',$2)",[request,ids.housekeeping]);
 await q("select staff_progress_guest_request($1,'complete',$2)",[request,ids.housekeeping]);
 assert.equal(Number((await q('select quantity from inventory where id=$1',[item])).rows[0].quantity),7);
 assert.equal((await q("select count(*)::int n from inventory_movements where source_type='guest_request' and source_id=$1",[request])).rows[0].n,1);
 const empty='HMS-EMPTY-'+tag,shortage=randomUUID();
 await q("insert into inventory(id,name,category,quantity,unit) values($1,'Empty sample','Amenities',0,'pieces')",[empty]);
 await q("insert into guest_requests(id,reservation_id,request,department,inventory_item_id,approval_status) values($1,$2,'Short supply','housekeeping',$3,'approved')",[shortage,res,empty]);
 await rejects("select staff_progress_guest_request($1,'complete',$2)",[shortage,ids.housekeeping],'STOCK_INSUFFICIENT');
 assert.equal((await q('select status from guest_requests where id=$1',[shortage])).rows[0].status,'open');
 });
 await test('housekeeping completion and direct request completion share one consumption',async()=>{
 const room='HMS-ROOM-'+tag,req=randomUUID(),task='HMS-TASK-'+tag;
 await q("insert into rooms(id,number,floor,type,rate,status) values($1,$2,1,'Test',100,'occupied')",[room,'T-'+tag]);
 await q("insert into guest_requests(id,reservation_id,request,department,inventory_item_id,approval_status) values($1,$2,'Task supply','housekeeping',$3,'approved')",[req,res,item]);
 await q("insert into housekeeping_tasks(id,room_id,room_number,task,status,task_type,guest_request_id,started_by) values($1,$2,$3,'Supply delivery','in_progress','guest_request',$4,$5)",[task,room,'T-'+tag,req,ids.housekeeping]);
 await q("select housekeeping_complete_task($1,'{}',null,$2)",[task,ids.housekeeping]);
 assert.equal((await q('select status from guest_requests where id=$1',[req])).rows[0].status,'completed');
 assert.equal(Number((await q('select quantity from inventory where id=$1',[item])).rows[0].quantity),6);
 assert.equal((await q("select count(*)::int n from inventory_movements where source_type='guest_request' and source_id=$1",[req])).rows[0].n,1);
 });
 await test('in-house department work is created only after approval; pending supply can withdraw',async()=>{
 const pending=randomUUID(),approved=randomUUID(),batch=randomUUID(),room='HMS-ROOM-'+tag;
 await q('update reservations set room_id=$1,room_number=$2 where id=$3',[room,'T-'+tag,res]);
 await q("insert into guest_requests(id,reservation_id,request,department,batch_id) values($1,$3,'Pending towels','housekeeping',$4),($2,$3,'Approve towels','housekeeping',$5)",[pending,approved,res,randomUUID(),batch]);
 assert.equal((await q('select count(*)::int n from housekeeping_tasks where guest_request_id in($1,$2)',[pending,approved])).rows[0].n,0);
 await q('select customer_withdraw_guest_request($1,$2,1)',[ids.guest,pending]);
 await q("select front_desk_review_guest_request_batch($1,$2,'approve',null)",[ids.front_desk,batch]);
 assert.equal((await q('select count(*)::int n from housekeeping_tasks where guest_request_id=$1',[approved])).rows[0].n,1);
 });
 await test('legacy pending work is cancelled in place while assigned work is preserved',async()=>{
 const room='HMS-ROOM-'+tag;
 for(const assigned of [false,true]){
 const request=randomUUID(),task='HMS-LEGACY-'+randomUUID().slice(0,8);
 await q("insert into guest_requests(id,reservation_id,request,department) values($1,$2,'Legacy fixture','housekeeping')",[request,res]);
 await q("insert into housekeeping_tasks(id,room_id,room_number,task,status,task_type,guest_request_id,assigned_user_id) values($1,$2,$3,'Legacy pending', $4,'guest_request',$5,$6)",[task,room,'T-'+tag,assigned?'assigned':'pending',request,assigned?ids.housekeeping:null]);
 if(assigned){await rejects('select customer_withdraw_guest_request($1,$2,1)',[ids.guest,request],'WITHDRAWAL_NOT_PERMITTED');assert.equal((await q('select status from housekeeping_tasks where id=$1',[task])).rows[0].status,'assigned');}
 else{await q('select customer_withdraw_guest_request($1,$2,1)',[ids.guest,request]);assert.equal((await q('select status from housekeeping_tasks where id=$1',[task])).rows[0].status,'cancelled');}
 }
 });
 await test('guest withdrawal preserves a pending sibling and prevents new department work',async()=>{
 const request=randomUUID(),sibling=randomUUID(),batch=randomUUID();
 await q("insert into guest_requests(id,reservation_id,request,department,batch_id) values($1,$3,'Withdraw me','front_desk',$4),($2,$3,'Keep sibling','front_desk',$4)",[request,sibling,res,batch]);
 await q('select customer_withdraw_guest_request($1,$2,1)',[ids.guest,request]);
 assert.equal((await q('select status from guest_requests where id=$1',[request])).rows[0].status,'cancelled');
 assert.equal((await q('select approval_status from guest_requests where id=$1',[sibling])).rows[0].approval_status,'pending');
 await rejects("select staff_progress_guest_request($1,'complete',$2)",[request,ids.front_desk],'REQUEST_NOT_APPROVED');
 });
 await test('shared drawer/payment/receipt retry and variance safeguard',async()=>{const shift=(await q("select accounting_open_cash_shift($1,'Test',100) value",[ids.front_desk])).rows[0].value.shiftId;const pkey=randomUUID();const args=[res,200,'cash',null,pkey,ids.front_desk,false];const one=(await q('select hms_collect_payment($1,$2,$3,$4,$5,$6,$7) value',args)).rows[0].value;const two=(await q('select hms_collect_payment($1,$2,$3,$4,$5,$6,$7) value',args)).rows[0].value;assert.equal(one.payment_id,two.payment_id);assert.ok(one.receipt);await rejects("select accounting_close_cash_shift($1,290,null,$2,$3)",[shift,randomUUID(),ids.front_desk],'VARIANCE_EXPLANATION_REQUIRED');await q("select accounting_close_cash_shift($1,290,'Test variance explained',$2,$3)",[shift,randomUUID(),ids.front_desk]);await rejects('select hms_collect_payment($1,1,\'cash\',null,$2,$3,false)',[res,randomUUID(),ids.front_desk],'CASH_SHIFT_REQUIRED');await q("select hms_collect_payment($1,1,'card',$4,$2,$3,false)",[res,randomUUID(),ids.front_desk,'reference-'+tag]);});
 await test('handover is independent of roster and enforces owner/version',async()=>{assert.equal((await q("select to_regclass('public.staff_roster') t")).rows[0].t,null);const h=randomUUID();await q("select submit_shift_handover($1,$2,'Confirm guest arrival','reservation',$3,$1)",[ids.front_desk,h,res]);await rejects("select act_shift_handover($1,$2,1,'acknowledge','')",[ids.housekeeping,h],'HANDOVER_FORBIDDEN');await q("select act_shift_handover($1,$2,1,'acknowledge','')",[ids.front_desk,h]);await rejects("select act_shift_handover($1,$2,1,'resolve','Done')",[ids.front_desk,h],'HANDOVER_STALE');await q("select act_shift_handover($1,$2,2,'resolve','Guest contacted')",[ids.front_desk,h]);});
 // Commit only test fixtures in the isolated database for real two-session locks.
 await q('commit');
 await test('concurrent issues retain both movements and deductions',async()=>{const a=new pg.Client(config),b=new pg.Client(config);await a.connect();await b.connect();try{await Promise.all([a.query(issue,[ids.housekeeping,randomUUID(),item,1]),b.query(issue,[ids.maintenance,randomUUID(),item,1])]);assert.equal(Number((await q('select quantity from inventory where id=$1',[item])).rows[0].quantity),4);}finally{await a.end();await b.end();}});
 await test('cash collection waiting behind closure leaves no payment or receipt',async()=>{
 const worker=new pg.Client(config);await worker.connect();
 try{
 const shift=(await q("select accounting_open_cash_shift($1,'Concurrent fixture',0) value",[ids.front_desk])).rows[0].value.shiftId;
 await q('begin');await q("select accounting_close_cash_shift($1,0,'Balanced test',$2,$3)",[shift,randomUUID(),ids.front_desk]);
 const key=randomUUID();const pending=worker.query("select hms_collect_payment($1,10,'cash',null,$2,$3,false)",[res,key,ids.front_desk]).then(()=>{throw new Error('Unexpected payment');},e=>e.message);
 await q('commit');assert.ok((await pending).includes('CASH_SHIFT_REQUIRED'));
 assert.equal((await q('select count(*)::int n from payments where idempotency_key=$1',[key])).rows[0].n,0);
 assert.equal((await q('select count(*)::int n from financial_documents where idempotency_key=$1',[key])).rows[0].n,0);
 }finally{await q('rollback');await worker.end();}
 });
 await test('drawer closure includes a payment and receipt committed by another connection',async()=>{
 const worker=new pg.Client(config);await worker.connect();
 try{
 const shift=(await q("select accounting_open_cash_shift($1,'Concurrent fixture',0) value",[ids.front_desk])).rows[0].value.shiftId;
 await worker.query('begin');await worker.query("select hms_collect_payment($1,10,'cash',null,$2,$3,false)",[res,randomUUID(),ids.front_desk]);
 const closing=q("select accounting_close_cash_shift($1,10,'Count checked',$2,$3) value",[shift,randomUUID(),ids.front_desk]);
 await worker.query('commit');assert.equal((await closing).rows[0].value.expectedCash,10);
 }finally{await worker.query('rollback');await worker.end();}
 });
 await test('withdrawal racing batch approval has one valid outcome and no orphan task',async()=>{
 const worker=new pg.Client(config);await worker.connect();try{
 const request=randomUUID(),batch=randomUUID();
 await q("insert into guest_requests(id,reservation_id,request,department,batch_id) values($1,$2,'Race fixture','housekeeping',$3)",[request,res,batch]);
 const results=await Promise.allSettled([q('select customer_withdraw_guest_request($1,$2,1)',[ids.guest,request]),worker.query("select front_desk_review_guest_request_batch($1,$2,'approve',null)",[ids.front_desk,batch])]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const row=(await q('select approval_status from guest_requests where id=$1',[request])).rows[0];
 const tasks=(await q("select count(*)::int n from housekeeping_tasks where guest_request_id=$1 and status<>'cancelled'",[request])).rows[0].n;
 assert.equal(tasks,row.approval_status==='approved'?1:0);
 }finally{await worker.end();}
 });
 console.log(`${passed} HMS SQL acceptance checks passed. Dedicated scratch DB only.`);
}catch(e){await q('rollback').catch(()=>{});throw e;}finally{await c.end();}
