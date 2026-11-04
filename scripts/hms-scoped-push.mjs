// Official Supabase CLI only. Never writes credentials or marks held migrations applied.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
const selected=['20261103010000','20261103030000','20261103070000','20261103080000','20261103090000','20261103100000','20261103110000','20261103120000'];
const mode=process.argv[2];
if(!['--dry-run','--apply'].includes(mode))throw new Error('Choose --dry-run or --apply.');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Za-z_]/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')];}));
const url=env.DIRECT_URL;if(!url)throw new Error('DIRECT_URL is required.');
const parsed=new URL(url);
const client=new pg.Client({user:decodeURIComponent(parsed.username),password:decodeURIComponent(parsed.password),host:parsed.hostname,port:Number(parsed.port)||5432,database:parsed.pathname.slice(1),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
await client.connect();let applied;
try{applied=new Set((await client.query('select version from supabase_migrations.schema_migrations')).rows.map(r=>r.version));}finally{await client.end();}
const root=path.resolve('.tmp/hms-scoped-release');
const migrations=path.join(root,'supabase/migrations');fs.mkdirSync(migrations,{recursive:true});
// Refuse stale staged files instead of deleting unknown work.
const sources=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&(applied.has(f.split('_')[0])||selected.includes(f.split('_')[0])));
const expected=new Set(sources);
for(const file of fs.readdirSync(migrations))if(!expected.has(file))throw new Error('Unexpected staged migration: '+file);
for(const file of sources)fs.copyFileSync(path.join('supabase/migrations',file),path.join(migrations,file));
fs.copyFileSync('supabase/config.toml',path.join(root,'supabase/config.toml'));
console.log('Scoped pending migrations:',selected.filter(v=>!applied.has(v)).join(', ')||'none');
const binary=path.resolve('.tmp/hms-cli/package/bin/supabase.exe');
const args=['db','push','--db-url',url,'--workdir',root,'--skip-vault','--yes',...(mode==='--dry-run'?['--dry-run']:[])];
const result=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,DO_NOT_TRACK:'1'}});
const redact=text=>String(text??'').split(url).join('[database connection]').split(decodeURIComponent(parsed.password)).join('[redacted]');
if(result.stdout)process.stdout.write(redact(result.stdout));if(result.stderr)process.stderr.write(redact(result.stderr));
if(result.error)console.error('CLI process failed:',result.error.code??'unknown');
process.exitCode=result.status??1;
