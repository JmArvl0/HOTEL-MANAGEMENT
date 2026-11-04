import fs from 'node:fs';
import pg from 'pg';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Za-z_]/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')];}));
const u=new URL(env.DIRECT_URL);
const c=new pg.Client({user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),host:u.hostname,port:Number(u.port)||5432,database:u.pathname.slice(1),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,query_timeout:30000});
await c.connect();
try{
 const ledger=await c.query("select version from supabase_migrations.schema_migrations where version>='20261024140000' order by version");
 console.log('Live post-baseline ledger:',ledger.rows.map(r=>r.version).join(', '));
 await c.query('begin');
 try{await c.query(fs.readFileSync('scripts/verify-hms-live.sql','utf8'));console.log('PASS live stock/retry/roles/profile/ID/handover and available-drawer payment/receipt smoke.');}
 finally{await c.query('rollback');console.log('Rolled back all smoke fixtures.');}
 const held=await c.query("select to_regclass('public.staff_roster') roster,to_regclass('public.purchase_order_receipts') partial_receipts,to_regclass('public.maintenance_asset_work') asset_work,to_regclass('public.lost_found_items') lost_found");
 console.log('Held module tables:',held.rows[0]);
}finally{await c.end();}
