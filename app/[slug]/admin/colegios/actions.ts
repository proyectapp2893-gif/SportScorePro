'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { randomUUID } from 'crypto';

type SchoolActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

async function requireClient(slug: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Cliente no encontrado.' };
  return { success: true as const, clientId };
}

async function schoolBelongsToClient(schoolId: string, clientId: string) {
  const supabase = createServerSupabaseAdminClient();
  const { data } = await supabase
    .from('schools')
    .select('id')
    .eq('id', schoolId)
    .eq('client_id', clientId)
    .maybeSingle();
  return Boolean(data);
}

export async function createSchools(slug: string, names: string[]): Promise<SchoolActionResult<{ inserted: number }>> {
  const auth = await requireClient(slug);
  if (!auth.success) return { success: false, error: auth.error };

  const cleanNames = Array.from(new Set(names.map((name) => name.trim().toUpperCase()).filter(Boolean)));
  if (cleanNames.length === 0) return { success: false, error: 'No hay instituciones válidas.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: existing } = await supabase.from('schools').select('name').eq('client_id', auth.clientId);
  const existingNames = new Set((existing || []).map((school) => String(school.name).toUpperCase()));
  const schoolsToInsert = cleanNames
    .filter((name) => !existingNames.has(name))
    .map((name) => ({ name, client_id: auth.clientId }));

  if (schoolsToInsert.length === 0) return { success: false, error: 'Todas las instituciones ya están registradas.' };

  const { error } = await supabase.from('schools').insert(schoolsToInsert);
  if (error) return { success: false, error: error.message.includes('unique') ? 'Esta institución ya está registrada.' : 'Error al registrar.' };

  await logAuditEvent({
    action: 'admin.schools.create',
    actorType: 'client',
    clientId: auth.clientId,
    targetType: 'school',
    metadata: { slug, inserted: schoolsToInsert.length },
  });

  return { success: true, data: { inserted: schoolsToInsert.length } };
}

export async function updateSchoolName(slug: string, schoolId: string, name: string): Promise<SchoolActionResult> {
  const auth = await requireClient(slug);
  if (!auth.success) return { success: false, error: auth.error };
  if (!(await schoolBelongsToClient(schoolId, auth.clientId))) return { success: false, error: 'La institución no pertenece a este cliente.' };

  const safeName = name.trim().toUpperCase();
  if (!safeName) return { success: false, error: 'Nombre inválido.' };

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from('schools').update({ name: safeName }).eq('id', schoolId);
  if (error) return { success: false, error: 'Error al actualizar el nombre.' };

  await logAuditEvent({ action: 'admin.schools.rename', actorType: 'client', clientId: auth.clientId, targetType: 'school', targetId: schoolId, metadata: { slug, name: safeName } });
  return { success: true, data: undefined };
}

export async function updateSchoolLogo(slug: string, schoolId: string, logoUrl: string): Promise<SchoolActionResult> {
  const auth = await requireClient(slug);
  if (!auth.success) return { success: false, error: auth.error };
  if (!(await schoolBelongsToClient(schoolId, auth.clientId))) return { success: false, error: 'La institución no pertenece a este cliente.' };

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from('schools').update({ logo_url: logoUrl }).eq('id', schoolId);
  if (error) return { success: false, error: 'No se pudo actualizar el escudo.' };

  await logAuditEvent({ action: 'admin.schools.logo_update', actorType: 'client', clientId: auth.clientId, targetType: 'school', targetId: schoolId, metadata: { slug } });
  return { success: true, data: undefined };
}

export async function uploadSchoolLogo(slug: string, schoolId: string, file: File): Promise<SchoolActionResult<{ publicUrl: string }>> {
  const auth = await requireClient(slug);
  if (!auth.success) return { success: false, error: auth.error };
  if (!(await schoolBelongsToClient(schoolId, auth.clientId))) return { success: false, error: 'La institución no pertenece a este cliente.' };
  if (!file.type.startsWith('image/')) return { success: false, error: 'El archivo debe ser una imagen.' };

  const supabase = createServerSupabaseAdminClient();
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `${auth.clientId}/schools/${schoolId}-${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, file, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return { success: false, error: 'Fallo en la carga del archivo.' };

  const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(filePath);
  const publicUrl = publicUrlData.publicUrl;
  const { error } = await supabase.from('schools').update({ logo_url: publicUrl }).eq('id', schoolId);
  if (error) return { success: false, error: 'No se pudo actualizar el escudo.' };

  await logAuditEvent({ action: 'admin.schools.logo_upload', actorType: 'client', clientId: auth.clientId, targetType: 'school', targetId: schoolId, metadata: { slug } });
  return { success: true, data: { publicUrl } };
}

export async function deleteSchool(slug: string, schoolId: string): Promise<SchoolActionResult> {
  const auth = await requireClient(slug);
  if (!auth.success) return { success: false, error: auth.error };
  if (!(await schoolBelongsToClient(schoolId, auth.clientId))) return { success: false, error: 'La institución no pertenece a este cliente.' };

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from('schools').delete().eq('id', schoolId);
  if (error) return { success: false, error: 'Protección de datos: la institución tiene registros activos.' };

  await logAuditEvent({ action: 'admin.schools.delete', actorType: 'client', clientId: auth.clientId, targetType: 'school', targetId: schoolId, metadata: { slug } });
  return { success: true, data: undefined };
}
