import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import DelegadosClient from './DelegadosClient';
import { DEMO_SLUG } from '@/app/lib/demo/config';

async function loadDelegateRows(supabase: ReturnType<typeof createServerSupabaseAdminClient>, clientId: string) {
  const fullQuery = await supabase
    .from('delegate_users')
    .select(`
      id,
      name,
      username,
      email,
      whatsapp_phone,
      assigned_password,
      must_change_password,
      password_changed_at,
      is_active,
      created_at,
      schools(id, name),
      delegate_team_access(
        team_id,
        teams(
          id,
          name,
          categories(
            id,
            name,
            tournament_id,
            tournaments(id, name)
          )
        )
      )
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (!fullQuery.error) return fullQuery.data || [];

  const fallbackQuery = await supabase
    .from('delegate_users')
    .select(`
      id,
      name,
      username,
      email,
      is_active,
      created_at,
      schools(id, name),
      delegate_team_access(
        team_id,
        teams(
          id,
          name,
          categories(
            id,
            name,
            tournament_id,
            tournaments(id, name)
          )
        )
      )
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  return (fallbackQuery.data || []).map((delegate: any) => ({
    ...delegate,
    assigned_password: null,
    whatsapp_phone: null,
    must_change_password: false,
    password_changed_at: null,
  }));
}

async function loadCategories(supabase: ReturnType<typeof createServerSupabaseAdminClient>, clientId: string) {
  const fullQuery = await supabase
    .from('categories')
    .select(`
      id,
      name,
      registration_open,
      registration_deadline,
      min_roster_size,
      max_roster_size,
      roster_locked_message,
      sports(id, name),
      tournaments!inner(id, name, client_id)
    `)
    .eq('tournaments.client_id', clientId)
    .order('name', { ascending: true });

  if (!fullQuery.error) return { categories: fullQuery.data || [], schemaReady: true };

  const fallbackQuery = await supabase
    .from('categories')
    .select(`
      id,
      name,
      sports(id, name),
      tournaments!inner(id, name, client_id)
    `)
    .eq('tournaments.client_id', clientId)
    .order('name', { ascending: true });

  return {
    categories: (fallbackQuery.data || []).map((category: any) => ({
      ...category,
      registration_open: true,
      registration_deadline: null,
      min_roster_size: null,
      max_roster_size: null,
      roster_locked_message: null,
    })),
    schemaReady: false,
  };
}

export default async function DelegadosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === DEMO_SLUG) return <DelegadosClient slug={slug} initialData={{ delegates: [{ id: 'demo-delegate', name: 'DELEGADO DEMO', username: 'demo', email: 'demo@ejemplo.local', whatsapp_phone: '', assigned_password: 'demo', must_change_password: false, is_active: true, created_at: new Date().toISOString(), schools: { id: 'demo-school-1', name: 'EQUIPO AURORA' }, delegate_team_access: [] }], schools: [{ id: 'demo-school-1', name: 'EQUIPO AURORA' }], teams: [{ id: 'demo-team-1', name: 'EQUIPO AURORA', school_id: 'demo-school-1', categories: { id: 'demo-category', name: 'CATEGORÍA DEMO', tournament_id: 'demo-tournament', tournaments: { id: 'demo-tournament', name: 'TORNEO DEMOSTRATIVO' } } }], tournaments: [{ id: 'demo-tournament', name: 'TORNEO DEMOSTRATIVO', created_at: new Date().toISOString() }], categories: [{ id: 'demo-category', name: 'CATEGORÍA DEMO', registration_open: true, tournaments: { id: 'demo-tournament', name: 'TORNEO DEMOSTRATIVO' }, sports: { id: 'demo-sport', name: 'FÚTBOL' } }], schemaReady: true }} />;

  if (!(await hasAdminSession(slug))) {
    redirect(`/${slug}/login`);
  }

  const clientId = await getClientIdBySlug(slug);
  if (!clientId) redirect('/');

  const supabase = createServerSupabaseAdminClient();

  const [delegates, { data: schools }, { data: teams }, { data: tournaments }, categoryLoad] = await Promise.all([
    loadDelegateRows(supabase, clientId),
    supabase
      .from('schools')
      .select('id, name')
      .eq('client_id', clientId)
      .order('name', { ascending: true }),
    supabase
      .from('teams')
      .select(`
        id,
        name,
        school_id,
        categories!inner(
          id,
          name,
          tournament_id,
          tournaments!inner(id, name, client_id)
        )
      `)
      .eq('categories.tournaments.client_id', clientId)
      .order('name', { ascending: true }),
    supabase
      .from('tournaments')
      .select('id, name, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    loadCategories(supabase, clientId),
  ]);

  return (
    <DelegadosClient
      slug={slug}
      initialData={{
        delegates,
        schools: schools || [],
        teams: teams || [],
        tournaments: tournaments || [],
        categories: categoryLoad.categories,
        schemaReady: categoryLoad.schemaReady,
      }}
    />
  );
}
