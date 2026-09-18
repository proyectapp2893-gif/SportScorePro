import ParticipationAdmin from './ParticipationAdmin';
import { normalizeAsOfDate } from '@/app/lib/date-filter';

export default async function ParticipationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string; hasta?: string }> }) {
  const { slug } = await params;
  const { category, hasta } = await searchParams;
  return <ParticipationAdmin slug={slug} initialCategoryId={category || ''} asOfDate={normalizeAsOfDate(hasta)} />;
}
