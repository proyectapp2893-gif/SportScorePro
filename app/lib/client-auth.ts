import 'server-only';

import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { hashPassword, verifyPassword } from '@/app/lib/passwords';
import { logAuditEvent } from '@/app/lib/audit';

type ClientAuthOptions = {
  username: string;
  password: string;
  slug?: string;
};

export async function authenticateClientCredential({ username, password, slug }: ClientAuthOptions) {
  const safeUsername = username.toLowerCase().trim();
  const safePassword = password.trim();

  const supabase = createServerSupabaseAdminClient();
  let query = supabase
    .from('clients')
    .select('id, name, slug, logo_url, is_active, access_code, access_code_hash')
    .eq('username', safeUsername);

  if (slug) {
    query = query.eq('slug', slug);
  }

  const { data: client, error } = await query.maybeSingle();

  if (error || !client) {
    return { success: false as const, error: 'Credenciales incorrectas.' };
  }

  const hashMatches = verifyPassword(safePassword, client.access_code_hash);
  const legacyMatches = !client.access_code_hash && client.access_code === safePassword;

  if (!hashMatches && !legacyMatches) {
    return { success: false as const, error: 'Credenciales incorrectas.' };
  }

  if (!client.is_active) {
    return { success: false as const, error: 'Servicio suspendido. Contacte a Soporte.' };
  }

  if (legacyMatches) {
    await supabase
      .from('clients')
      .update({ access_code_hash: hashPassword(safePassword), access_code: null })
      .eq('id', client.id);

    await logAuditEvent({
      action: 'client.password_legacy_migrated',
      actorType: 'system',
      clientId: client.id,
      targetType: 'client',
      targetId: client.id,
      metadata: { slug: client.slug },
    });
  }

  await logAuditEvent({
    action: 'client.login',
    actorType: 'client',
    actorId: client.id,
    clientId: client.id,
    targetType: 'client',
    targetId: client.id,
    metadata: { slug: client.slug, username: safeUsername },
  });

  return {
    success: true as const,
    client: {
      id: client.id,
      name: client.name,
      slug: client.slug,
      logo_url: client.logo_url,
      is_active: client.is_active,
    },
  };
}
