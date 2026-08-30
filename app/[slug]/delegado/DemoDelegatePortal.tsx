'use client';

import { useEffect, useState } from 'react';
import { loadDemoDatabase } from '@/app/lib/demo/database';
import DelegatePortalClient from './DelegatePortalClient';

export default function DemoDelegatePortal({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    const build = () => {
      const db = loadDemoDatabase();
      const teams = db.teams.slice(0, 3);
      const playersByTeam: Record<string, any[]> = {};
      const matchesByTeam: Record<string, any[]> = {};
      const schedulesByTeam: Record<string, any[]> = {};
      const staffByTeam: Record<string, any[]> = {};
      const eventsByTeam: Record<string, any[]> = {};
      const eventsByMatch: Record<string, any[]> = {};
      teams.forEach((team) => {
        playersByTeam[team.id] = db.players.filter((player) => player.team_id === team.id).map((player) => ({ ...player, team_logo_url: (team as any).schools?.logo_url || (team as any).logo_url || null }));
        staffByTeam[team.id] = db.team_staff.filter((member) => member.team_id === team.id);
        eventsByTeam[team.id] = db.match_events.filter((event) => event.team_id === team.id);
        const matches = db.matches.filter((match) => match.home_team_id === team.id || match.away_team_id === team.id || (match.status === 'BYE' && match.home_team_id === team.id));
        matchesByTeam[team.id] = matches; schedulesByTeam[team.id] = matches;
      });
      db.matches.forEach((match) => { eventsByMatch[match.id] = db.match_events.filter((event) => event.match_id === match.id); });
      setData({ delegate: { id: 'demo-delegate', name: 'DELEGADO DEMO', username: 'demo', must_change_password: false }, teams, playersByTeam, staffByTeam, eventsByTeam, matchesByTeam, eventsByMatch, schedulesByTeam, schemaReady: true });
    };
    build(); window.addEventListener('sportscore-demo-change', build); return () => window.removeEventListener('sportscore-demo-change', build);
  }, []);
  if (!data) return <div className="min-h-screen bg-slate-50 p-10 text-center font-black text-slate-500">Preparando portal de delegados…</div>;
  return <DelegatePortalClient slug={slug} initialData={data} />;
}
