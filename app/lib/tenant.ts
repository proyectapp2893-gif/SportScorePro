import 'server-only';

import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';

export async function getClientIdBySlug(slug: string) {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data.id as string;
}

export async function categoryBelongsToClientSlug(categoryId: string, slug: string) {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, tournaments!inner(client_id, clients!inner(slug))')
    .eq('id', categoryId)
    .eq('tournaments.clients.slug', slug)
    .maybeSingle();

  return Boolean(data && !error);
}

export async function teamBelongsToClientSlug(teamId: string, slug: string) {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from('teams')
    .select('id, categories!inner(tournaments!inner(client_id, clients!inner(slug)))')
    .eq('id', teamId)
    .eq('categories.tournaments.clients.slug', slug)
    .maybeSingle();

  return Boolean(data && !error);
}
