'use client';

import { useState } from 'react';
import { FOOTBALL9_FORMATIONS, type FormationPosition } from '@/app/lib/sports/formations';

type FormationBoardProps = {
  positions: FormationPosition[];
  assignments: Record<string, string | undefined>;
  players: Array<{ id: string; name: string; shirt_number?: number | null; photo_url?: string | null; face_photo_url?: string | null; image_url?: string | null; team_logo_url?: string | null }>;
  teamLogoUrl?: string | null;
  onAssign: (positionId: string, playerId: string) => void;
  blockedPlayerIds?: string[];
  disabled?: boolean;
};

export default function FormationBoard({ positions, assignments, players, onAssign, disabled, blockedPlayerIds = [], teamLogoUrl }: FormationBoardProps) {
  const [pickerSlot, setPickerSlot] = useState<FormationPosition | null>(null);
  const [formationMenuOpen, setFormationMenuOpen] = useState(false);
  const assignedIds = new Set(Object.values(assignments).filter(Boolean));
  const blocked = new Set(blockedPlayerIds);
  const inferredTeamLogo = players.find((player) => player.team_logo_url)?.team_logo_url;
  const currentFormation = FOOTBALL9_FORMATIONS.find((formation) => formation.players.map((slot) => slot.id).join('|') === positions.map((slot) => slot.id).join('|')) || FOOTBALL9_FORMATIONS[0];
  const selectFormation = (code: string) => {
    const select = document.querySelector('[role="dialog"] select') as HTMLSelectElement | null;
    if (select) {
      select.value = code;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setFormationMenuOpen(false);
  };
  return <div className="relative aspect-[3/4] min-h-[700px] w-full max-w-full min-w-0 overflow-visible rounded-[1.5rem] border-4 border-emerald-900/60 bg-emerald-600 shadow-inner md:min-h-[760px]" aria-label="Campo de alineación">
    <div className="pointer-events-none absolute inset-x-[8%] top-0 h-[17%] -translate-y-[18%] rounded-t-[45%] border-4 border-b-0 border-emerald-900/60 bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-700 [clip-path:polygon(12%_100%,88%_100%,100%_0,0_0)]" aria-hidden="true" />
    {(teamLogoUrl || inferredTeamLogo) && <div className="absolute left-1/2 top-2 z-20 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-white p-2 shadow-lg" aria-label="Logo del equipo"><img src={teamLogoUrl || inferredTeamLogo || undefined} alt="" className="h-full w-full rounded-full object-contain" /></div>}
    <div className="absolute left-3 right-3 top-24 z-30 md:left-5 md:right-5"><p className="mb-1 px-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/80">Formación táctica</p><button type="button" aria-haspopup="listbox" aria-expanded={formationMenuOpen} onClick={() => setFormationMenuOpen((open) => !open)} className="flex w-full items-center justify-between rounded-xl border border-white/70 bg-slate-950/90 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-white shadow-lg backdrop-blur"><span>{currentFormation.code} · {currentFormation.name}{currentFormation.recommended ? ' · Recomendada' : ''}</span><span aria-hidden="true">⌄</span></button>{formationMenuOpen && <div role="listbox" aria-label="Formaciones disponibles" className="mt-1 overflow-hidden rounded-xl border border-white/50 bg-slate-950/95 p-1 shadow-2xl backdrop-blur">{FOOTBALL9_FORMATIONS.map((formation) => <button type="button" role="option" aria-selected={formation.code === currentFormation.code} key={formation.code} onClick={() => selectFormation(formation.code)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide transition-colors ${formation.code === currentFormation.code ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-white/10'}`}><span>{formation.code} · {formation.name}</span><span className="ml-2 text-[8px] font-bold normal-case text-slate-300">{formation.focus === 'BALANCED' ? 'Equilibrada' : formation.focus === 'OFFENSIVE' ? 'Ofensiva' : formation.focus === 'DEFENSIVE' ? 'Defensiva' : formation.focus === 'HIGH_PRESS' ? 'Presión' : 'Posesión'}</span></button>)}</div>}</div>
    <div className="absolute inset-2 rounded-xl border-2 border-white/70"><div className="absolute left-0 right-0 top-1/2 border-t-2 border-white/70" /><div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70" /><div className="absolute left-1/2 top-0 h-20 w-36 -translate-x-1/2 border-2 border-t-0 border-white/70" /><div className="absolute bottom-0 left-1/2 h-20 w-36 -translate-x-1/2 border-2 border-b-0 border-white/70" /></div>
    {positions.map((slot) => { const selected = assignments[slot.id]; const player = players.find((item) => item.id === selected); const visualTop = Math.min(93, 14 + slot.y * 0.82); return <div key={slot.id} className="absolute w-[24%] min-w-[62px] max-w-[100px] -translate-x-1/2 -translate-y-1/2" style={{ left: `${slot.x}%`, top: `${visualTop}%` }}>
      <div className={`relative overflow-visible rounded-[10px] border-2 ${player ? 'border-amber-300 bg-gradient-to-br from-[#f9df78] via-[#d9a92e] to-[#fff0a8]' : 'border-white/80 bg-slate-950/85'} shadow-[0_6px_14px_rgba(15,23,42,.4)]`}>
        <div className="relative flex h-11 items-center justify-center bg-gradient-to-b from-white/35 to-transparent">
          <span className={`absolute left-1 top-1 text-[15px] font-black leading-none ${player ? 'text-slate-950' : 'text-blue-200'}`}>{player ? '85' : '?'}</span>
          <span className={`absolute left-1 top-5 text-[7px] font-black uppercase ${player ? 'text-slate-950' : 'text-white'}`}>{slot.abbreviation}</span>
          {(player?.photo_url || player?.face_photo_url || player?.image_url) ? <img src={(player.photo_url || player.face_photo_url || player.image_url) || undefined} alt="" loading="eager" decoding="async" className="h-14 w-14 rounded-full border-2 border-white/80 object-cover object-top shadow-sm" /> : <span className={`text-xl font-black ${player ? 'text-slate-800' : 'text-white'}`}>{player ? String(player.name || '?').slice(0, 1).toUpperCase() : '?'}</span>}
        </div>
        <div className={`truncate border-t border-black/10 px-1 py-0.5 text-center text-[7px] font-black uppercase ${player ? 'text-slate-950' : 'text-white'}`}>{player ? player.name : 'Elegir jugador'}</div>
        <button type="button" aria-label={`${slot.abbreviation} ${slot.label}`} aria-expanded={pickerSlot?.id === slot.id} disabled={disabled} onClick={() => setPickerSlot(slot)} className="flex w-full items-center justify-center gap-1 border-t border-slate-900/10 bg-slate-950/95 px-1 py-1.5 text-center text-[7px] font-black uppercase tracking-wide text-white outline-none transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"><span>{selected ? 'Cambiar jugador' : 'Elegir jugador'}</span><span aria-hidden="true">⌄</span></button>
      </div>
    </div>; })}
    {pickerSlot && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="presentation" onClick={() => setPickerSlot(null)}><div role="dialog" aria-modal="true" aria-label={`Seleccionar jugador para ${pickerSlot.abbreviation}`} className="max-h-[82dvh] w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Posición {pickerSlot.abbreviation}</p><h3 className="text-lg font-black uppercase">Seleccionar jugador</h3></div><button type="button" onClick={() => setPickerSlot(null)} aria-label="Cerrar selección" className="rounded-xl bg-white/10 p-2 text-xl">×</button></div><div className="grid max-h-[65dvh] gap-2 overflow-y-auto p-4 sm:grid-cols-2"><button type="button" onClick={() => { onAssign(pickerSlot.id, ''); setPickerSlot(null); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-black uppercase text-slate-500 hover:bg-slate-100">Sin asignar</button>{players.map((item) => { const isBlocked = blocked.has(item.id); const isAssigned = assignedIds.has(item.id) && item.id !== assignments[pickerSlot.id]; return <button type="button" key={item.id} disabled={isBlocked || isAssigned} onClick={() => { onAssign(pickerSlot.id, item.id); setPickerSlot(null); }} className={`rounded-xl border px-3 py-3 text-left text-xs font-black uppercase transition-colors ${item.id === assignments[pickerSlot.id] ? 'border-blue-600 bg-blue-600 text-white' : isBlocked || isAssigned ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300' : 'border-slate-200 text-slate-800 hover:border-blue-400 hover:bg-blue-50'}`}><span className="mr-2 text-blue-600">#{item.shirt_number || '-'}</span>{item.name}{isBlocked && <span className="ml-2 text-[9px] text-red-400">BLOQUEADO</span>}{isAssigned && <span className="ml-2 text-[9px] text-slate-400">EN USO</span>}</button>; })}</div></div></div>}
  </div>;
}
