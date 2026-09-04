import { redirect } from 'next/navigation';
import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import StatutesManager from './StatutesManager';

export const dynamic = 'force-dynamic';

export default async function StatutesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tournament?: string }> }) {
  const { slug } = await params;
  const { tournament: tournamentId } = await searchParams;
  if (!(await hasAdminSession(slug))) redirect(`/${slug}/admin`);
  if (!tournamentId) redirect(`/${slug}/admin`);
  const clientId = await getClientIdBySlug(slug);
  const supabase = createServerSupabaseAdminClient();
  const { data: tournament } = await supabase.from('tournaments').select('id,name').eq('id', tournamentId).eq('client_id', clientId || '').maybeSingle();
  if (!tournament) redirect(`/${slug}/admin`);
  const { data: document } = await supabase.from('tournament_statutes').select('id,original_filename,file_size,uploaded_at').eq('tournament_id', tournament.id).maybeSingle();
  return <StatutesManager slug={slug} tournament={tournament} document={document} />;
}
