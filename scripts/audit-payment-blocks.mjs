import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => { const i = line.indexOf('='); return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const read = async query => { const {data,error} = await query; if(error) throw new Error(error.message); return data || []; };
const teams = await read(db.from('teams').select('id,name,category_id').ilike('name','%sporting%'));
for (const team of teams) {
 const events = await read(db.from('match_events').select('id,event_type,player_id,fine_status,suspension_matches,created_at,players(name)').eq('team_id',team.id).in('event_type',['YELLOW','RED']));
 const proofs = await read(db.from('fine_payment_proofs').select('id,match_event_id,status,submitted_at,reviewed_at').eq('team_id',team.id));
 console.log(JSON.stringify({team:team.name,teamId:team.id,events,proofs}));
}
const approved = await read(db.from('fine_payment_proofs').select('team_id,reviewed_at,teams(name)').eq('status','APPROVED'));
for (const proof of approved) {
 const unpaid = await read(db.from('match_events').select('id,event_type,created_at').eq('team_id',proof.team_id).eq('fine_status','UNPAID').in('event_type',['YELLOW','RED']).lte('created_at',proof.reviewed_at || '1900-01-01'));
 if(unpaid.length) console.log(JSON.stringify({possiblePartialApproval:proof.teams?.name,teamId:proof.team_id,reviewedAt:proof.reviewed_at,unpaid}));
}
