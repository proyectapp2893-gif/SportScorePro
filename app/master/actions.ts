'use server'

import { clearMasterSession, hasMasterSession, isMasterCredential, setMasterSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { hashPassword } from '@/app/lib/passwords';
import { logAuditEvent } from '@/app/lib/audit';

export type MasterClientRecord = {
  id: string;
  name: string;
  slug: string;
  username: string | null;
  has_access_code: boolean;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
};

type MasterActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type MasterAuthResult =
  | { success: true; supabase: ReturnType<typeof createServerSupabaseAdminClient> }
  | { success: false; error: string };

async function requireMasterAction(): Promise<MasterAuthResult> {
  if (!(await hasMasterSession())) {
    return { success: false, error: 'Sesión maestra no válida.' };
  }

  return { success: true, supabase: createServerSupabaseAdminClient() };
}

export async function authenticateMaster(formData: FormData) {
  const user = String(formData.get('username') ?? '');
  const pass = String(formData.get('password') ?? '');

  if (isMasterCredential(user, pass)) {
    await setMasterSession();
    await logAuditEvent({
      action: 'master.login',
      actorType: 'master',
      actorId: user.toLowerCase().trim(),
    });
    return { success: true };
  }

  return { success: false, error: 'Credenciales de acceso denegadas.' };
}

// 🚪 FUNCIÓN PARA CERRAR SESIÓN DEL BÚNKER MAESTRO
export async function logoutMaster() {
  await clearMasterSession();
}

export async function listMasterClients(): Promise<MasterActionResult<MasterClientRecord[]>> {
  const auth = await requireMasterAction();
  if (!auth.success) return { success: false, error: auth.error };

  const { data, error } = await auth.supabase
    .from('clients')
    .select('id, name, slug, username, access_code, access_code_hash, logo_url, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: 'No se pudieron cargar los clientes.' };
  }

  return {
    success: true,
    data: (data || []).map((client) => ({
      id: client.id,
      name: client.name,
      slug: client.slug,
      username: client.username,
      has_access_code: Boolean(client.access_code_hash || client.access_code),
      logo_url: client.logo_url,
      is_active: Boolean(client.is_active),
      created_at: client.created_at,
    })),
  };
}

export async function createMasterClient(input: {
  name: string;
  slug: string;
  username: string;
  accessCode: string;
  logoUrl: string;
}): Promise<MasterActionResult> {
  const auth = await requireMasterAction();
  if (!auth.success) return { success: false, error: auth.error };

  const name = input.name.trim();
  const slug = input.slug.toLowerCase().trim();
  const username = input.username.toLowerCase().trim();
  const accessCode = input.accessCode.trim();
  const logoUrl = input.logoUrl.trim() || '/logo.png';

  if (!name || !slug || !username || accessCode.length < 8) {
    return { success: false, error: 'Completa nombre, slug, usuario y una contraseña de mínimo 8 caracteres.' };
  }

  const { error } = await auth.supabase.from('clients').insert([{
    name,
    slug,
    username,
    access_code: null,
    access_code_hash: hashPassword(accessCode),
    logo_url: logoUrl,
  }]);

  if (error) {
    return {
      success: false,
      error: error.code === '23505' ? 'El slug o usuario ya existen.' : 'No se pudo crear el cliente.',
    };
  }

  const { data: createdClient } = await auth.supabase
    .from('clients')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  await logAuditEvent({
    action: 'master.client.create',
    actorType: 'master',
    clientId: createdClient?.id ?? null,
    targetType: 'client',
    targetId: createdClient?.id ?? slug,
    metadata: { slug, username },
  });

  return { success: true, data: undefined };
}

export async function toggleMasterClientStatus(clientId: string, currentStatus: boolean): Promise<MasterActionResult> {
  const auth = await requireMasterAction();
  if (!auth.success) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('clients')
    .update({ is_active: !currentStatus })
    .eq('id', clientId);

  if (error) {
    return { success: false, error: 'No se pudo actualizar el estado del cliente.' };
  }

  await logAuditEvent({
    action: currentStatus ? 'master.client.suspend' : 'master.client.activate',
    actorType: 'master',
    clientId,
    targetType: 'client',
    targetId: clientId,
  });

  return { success: true, data: undefined };
}

export async function deleteMasterClient(clientId: string): Promise<MasterActionResult> {
  const auth = await requireMasterAction();
  if (!auth.success) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from('clients')
    .delete()
    .eq('id', clientId);

  if (error) {
    return { success: false, error: 'No se pudo eliminar. Puede haber datos dependientes.' };
  }

  await logAuditEvent({
    action: 'master.client.delete',
    actorType: 'master',
    targetType: 'client',
    targetId: clientId,
  });

  return { success: true, data: undefined };
}

export async function resetClientAccessCode(clientId: string, accessCode: string) {
  const auth = await requireMasterAction();
  if (!auth.success) return { success: false, error: auth.error };

  const safeClientId = clientId.trim();
  const safeAccessCode = accessCode.trim();

  if (!safeClientId) {
    return { success: false, error: 'Cliente inválido.' };
  }

  if (safeAccessCode.length < 8) {
    return { success: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' };
  }

  const { error } = await auth.supabase
    .from('clients')
    .update({ access_code: null, access_code_hash: hashPassword(safeAccessCode) })
    .eq('id', safeClientId);

  if (error) {
    return { success: false, error: 'No se pudo reiniciar la contraseña.' };
  }

  await logAuditEvent({
    action: 'master.client.password_reset',
    actorType: 'master',
    clientId: safeClientId,
    targetType: 'client',
    targetId: safeClientId,
  });

  return { success: true };
}
