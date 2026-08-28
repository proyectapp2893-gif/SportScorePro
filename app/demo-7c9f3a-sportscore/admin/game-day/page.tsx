'use client';

import { useEffect, useState } from 'react';
import GameDayDashboard from '@/app/[slug]/admin/game-day/GameDayDashboard';
import { loadDemoDatabase } from '@/app/lib/demo/database';
import { getMatchReadiness, getOperationalMatchState, sortGameDayMatches, type GameDayMatch } from '@/app/[slug]/admin/game-day/types';

export default function DemoGameDayPage() {
  const [matches, setMatches] = useState<GameDayMatch[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const db = loadDemoDatabase();
    const mapped = db.matches.filter((match) => match.status !== 'BYE').map((match: any) => {
      const state = getOperationalMatchState(match.status); const readiness = getMatchReadiness({ homeTeam: match.home_team?.name, awayTeam: match.away_team?.name, venue: match.venue, scheduledTime: match.scheduled_time, scorekeeper: 'PLANILLERO DEMO', state });
      return { id: match.id, status: match.status, state, readiness: readiness.readiness, alerts: readiness.alerts, scheduledTime: match.scheduled_time, venue: match.venue, categoryName: 'Categoría demo', roundNumber: match.matchdays?.round_number ?? null, homeTeam: match.home_team?.name || 'Por definir', awayTeam: match.away_team?.name || 'Por definir', homeLogo: null, awayLogo: null, homeScore: match.home_score, awayScore: match.away_score, scorekeeper: 'PLANILLERO DEMO', hrefs: { mesa: '/demo-7c9f3a-sportscore/admin', planilla: '/demo-7c9f3a-sportscore/admin', resultado: '/demo-7c9f3a-sportscore/resultados', tv: '/demo-7c9f3a-sportscore' } } as GameDayMatch;
    });
    setMatches(sortGameDayMatches(mapped));
  }, []);
  return <GameDayDashboard tournamentName="Torneo demostrativo" date={date} matches={matches} />;
}
