// Real concurrent transactions on disposable loopback PostgreSQL; no .env or remote writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hotelTestDatabase,hotelFixture,rpc} from './hotel-db-test-helpers.mjs';
const target=await hotelTestDatabase(),{db}=target;let failures=0,passed=0;
async function test(name,run){try{await run();passed++;console.log('PASS',name)}catch(e){failures++;console.error('FAIL',name,e.message)}}
try{
 for(const [fn,file] of [['create_exact_booking_hold(uuid,text,jsonb,uuid)','20261111010000_guest_exact_rooms.sql'],['catalog_actor(uuid,boolean)','20261111020000_room_type_lifecycle_amenities.sql']])if(!(await db.query('select to_regprocedure($1) fn',['public.'+fn])).rows[0].fn)await db.query(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 if(!process.argv.includes('--baseline'))await db.query(fs.readFileSync('supabase/migrations/20261111050000_room_configuration_booking_mutex.sql','utf8'));
 for(const action of ['deactivate','retype'])await test(`a committed ${action} prevents a hold that started during the edit`,async()=>{
  const f=await hotelFixture(db),room=(await db.query('select * from rooms where id=$1',[f.rooms[0].id])).rows[0];
  const next=`Next-${f.tag}`;await db.query("insert into room_types(name,description,beds,max_guests,base_rate) values($1,'Next type','Twin',2,100)",[next]);
  const book=await target.connect(),monitor=await target.connect();let outcome;
  try{
   await db.query('begin');await rpc(db,'catalog_save_room',{p_room:room.id,p_body:{floor:1,type:action==='retype'?next:f.type,active:action!=='deactivate',reason:'Concurrent test configuration',version:room.configuration_version},p_actor:f.users.owner});
   const dates=(await book.query('select (hotel_today()+80)::text cin,(hotel_today()+82)::text cout')).rows[0];
   const pending=rpc(book,'create_exact_booking_hold',{p_user_id:f.users.guest,p_room_id:room.id,p_details:{roomType:f.type,checkIn:dates.cin,checkOut:dates.cout,guests:1,firstName:'Test',lastName:'Guest',email:`${f.tag}@example.invalid`,mobile:'+639170000000'}}).then(v=>{outcome={ok:true,value:v}},e=>{outcome={ok:false,message:e.message}});
   let waiting=false;for(let i=0;i<100;i++){const row=(await monitor.query("select wait_event_type from pg_stat_activity where pid=$1",[book.processID])).rows[0];if(row?.wait_event_type==='Lock'){waiting=true;break}await new Promise(r=>setTimeout(r,10))}
   assert.equal(waiting,true,'Booking must reach the concurrent lock');await db.query('commit');await pending;
   assert.equal(outcome.ok,false,'A room edit that commits first must invalidate the stale hold');assert.match(outcome.message,/EXACT_ROOM_UNAVAILABLE/);
   assert.equal((await db.query('select count(*)::int n from booking_holds where selected_room_id=$1',[room.id])).rows[0].n,0);
  }finally{await db.query('rollback');await book.end();await monitor.end()}
 });
 await test('a booking that commits first blocks concurrent room reassignment',async()=>{
  const fixture=await hotelFixture(db), room=(await db.query('select * from rooms where id=$1',[fixture.rooms[0].id])).rows[0];
  const nextType=`Next-${fixture.tag}`;
  await db.query("insert into room_types(name,description,beds,max_guests,base_rate) values($1,'Next type','Twin',2,100)",[nextType]);
  const dates=(await db.query('select (hotel_today()+80)::text cin,(hotel_today()+82)::text cout')).rows[0];
  const editor=await target.connect(), monitor=await target.connect();
  try {
   await db.query('begin');
   await rpc(db,'create_exact_booking_hold',{p_user_id:fixture.users.guest,p_room_id:room.id,p_details:{roomType:fixture.type,checkIn:dates.cin,checkOut:dates.cout,guests:1,firstName:'Test',lastName:'Guest',email:`${fixture.tag}@example.invalid`,mobile:'+639170000000'}});
   const pending=rpc(editor,'catalog_save_room',{p_room:room.id,p_body:{floor:1,type:nextType,active:true,reason:'Concurrent reassignment test',version:room.configuration_version},p_actor:fixture.users.owner}).then(()=>null,error=>error);
   let waiting=false;
   for(let i=0;i<100;i++){
    const row=(await monitor.query('select wait_event_type from pg_stat_activity where pid=$1',[editor.processID])).rows[0];
    if(row?.wait_event_type==='Lock'){waiting=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   assert.equal(waiting,true,'Reassignment must wait for the active booking transaction');
   await db.query('commit');
   assert.match((await pending)?.message??'',/ROOM_HAS_FUTURE_COMMITMENT/);
   assert.equal((await db.query('select type from rooms where id=$1',[room.id])).rows[0].type,fixture.type);
   assert.equal((await db.query('select count(*)::int n from booking_holds where selected_room_id=$1',[room.id])).rows[0].n,1);
  } finally { await db.query('rollback'); await editor.end(); await monitor.end(); }
 });
 await test('unpublished types can receive rooms before publication',async()=>{const f=await hotelFixture(db);await db.query('update room_types set active=false where name=$1',[f.type]);const result=await rpc(db,'catalog_save_room',{p_room:null,p_body:{number:`draft-${f.tag}`,floor:1,type:f.type,active:true,amenityAdditions:['Kettle']},p_actor:f.users.owner});assert.ok(result[0].catalog_save_room.id)});
}finally{await target.close()}
console.log(JSON.stringify({passed,failures}));process.exitCode=failures?1:0;
