import ParticipationAdmin from './ParticipationAdmin';

export default async function ParticipationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string }> }) {
  const { slug } = await params;
  const { category } = await searchParams;
  return <ParticipationAdmin slug={slug} initialCategoryId={category || ''} />;
}
