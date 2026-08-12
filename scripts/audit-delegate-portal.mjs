import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path = '.env.local') {
  const env = {};
  const content = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  for (const rawLine of content.split(/\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return { ...env, ...process.env };
}

function checkResult(label, result) {
  if (result.error) {
    return {
      label,
      ok: false,
      code: result.error.code,
      message: result.error.message,
    };
  }

  return { label, ok: true };
}

const env = loadEnvFile();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or key.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks = [];

checks.push(checkResult(
  'delegate_users table',
  await supabase.from('delegate_users').select('id', { count: 'exact', head: true }),
));

checks.push(checkResult(
  'delegate_team_access table',
  await supabase.from('delegate_team_access').select('id', { count: 'exact', head: true }),
));

checks.push(checkResult(
  'category registration columns',
  await supabase
    .from('categories')
    .select('id,registration_open,registration_deadline,min_roster_size,max_roster_size,roster_locked_message')
    .limit(1),
));

const auditProbe = await supabase
  .from('audit_logs')
  .insert({
    action: 'delegate_schema_probe',
    actor_type: 'delegate',
    metadata: { probe: true },
  })
  .select('id')
  .single();

checks.push(checkResult('audit_logs delegate actor', auditProbe));

if (auditProbe.data?.id) {
  await supabase.from('audit_logs').delete().eq('id', auditProbe.data.id);
}

const failed = checks.filter((check) => !check.ok);
console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));

if (failed.length > 0) process.exit(1);
