// Isolated loopback upgrade verification. Never loads remote credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {hotelTestDatabase,hotelFixture,rpc} from './hotel-db-test-helpers.mjs';
const target=await hotelTestDatabase(),{db}=target;let failures=0,passed=0;
async function test(name,run){try{await run();passed++;console.log('PASS',name)}catch(e){failures++;console.error('FAIL',name,e.message)}}
try{
 for(const [fn,file] of [['catalog_actor(uuid,boolean)','20261111020000_room_type_lifecycle_amenities.sql'],['website_landing_public()','20261111030000_landing_content_editor.sql']])if(!(await db.query('select to_regprocedure($1) fn',[`public.${fn}`])).rows[0].fn)await db.query(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
 const {users}=await hotelFixture(db),owner=users.owner;
 const state=async()=>(await rpc(db,'website_landing_admin',{p_actor:owner}))[0].website_landing_admin;
 const write=async(action,document=null)=>{const c=await state();return rpc(db,'website_landing_write',{p_actor:owner,p_action:action,p_version:c.version,p_document:document,p_reason:'Local acceptance test'})};
 await test('valid demo profile exists before the first editor save',async()=>{const c=await state();assert.equal(c.draft.isDemo,true);assert.equal(c.published.schemaVersion,1);assert.ok(c.published.identity.name);assert.equal(c.published.media.contactBackgroundImageKey,'rizal')});
 await test('real client publication rejects stock/area hero and accepts uploaded property photos',async()=>{
  const original=(await db.query('select * from website_hotel_location')).rows[0];
  await db.query("update website_hotel_location set status='published',is_demo=false,verified_at=current_date,verification_source='https://example.invalid/property-verification' ");
  const seed=JSON.parse(fs.readFileSync('lib/website-content-defaults.json','utf8'));
  const document={...seed,isDemo:false,clientInformationReviewed:true};
  await write('save',document);await assert.rejects(write('publish'),/WEBSITE_REAL_PHOTOS_REQUIRED/);
  const image=randomUUID();await rpc(db,'website_landing_image_write',{p_actor:owner,p_action:'register',p_id:image,p_details:{alt:'Actual client room',imageKind:'property',bytes:1024,width:800,height:600}});
  await write('save',{...document,media:{...document.media,heroImageKey:image,gallery:[{key:image,label:'Guest room',alt:'Actual client guest room'}]}});
  await write('publish');assert.equal((await db.query('select website_landing_public() d')).rows[0].d.content.isDemo,false);
  await db.query('update website_hotel_location set is_demo=$1,verified_at=$2,verification_source=$3',[original.is_demo,original.verified_at,original.verification_source]);
 });
 await test('photo upgrade preserves edited location records',async()=>{
  await db.query("update website_nearby_places set description='Edited owner description',version=1 where name='A transport hub'");
  await db.query(fs.readFileSync('supabase/migrations/20261111040000_manila_area_photographs.sql','utf8'));
  const park=(await db.query("select * from website_nearby_places where name='Rizal Park'")).rows[0];assert.equal(park.sample_image,'rizal');assert.equal(park.distance_m,null);
  const edited=(await db.query("select * from website_nearby_places where name='A transport hub'")).rows[0];assert.equal(edited.description,'Edited owner description');assert.equal(edited.sample_image,'transport');
  assert.equal((await db.query("select count(*)::int n from website_nearby_places where name='Manila museum district' and sample_image='museum'")).rows[0].n,1);
 });
}finally{await target.close()}
console.log(JSON.stringify({passed,failures}));process.exitCode=failures?1:0;
