'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabase';
import { useParams, useSearchParams } from 'next/navigation';
import { Scale, AlertTriangle, ShieldCheck, DollarSign, Search, CheckCircle2, ArrowLeft, Wallet, Calendar, Clock, Flag, Eye, Settings2, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ApprovedPaymentProofs from './ApprovedPaymentProofs';
import { formatCopAmount } from '@/app/lib/formatters';
import { normalizeDoubleCautions } from '@/app/lib/discipline/double-caution';
import { normalizeAsOfDate } from '@/app/lib/date-filter';
import { approveFinePaymentProof, getFinePaymentProofs, getFinePaymentProofUrl, markTeamFinesPaidExternally, rejectFinePaymentProof, updateDisciplinaryRecord } from './actions';

function tribunalTeamInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EQ';
}

function TribunalTeamLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <span className="text-lg font-black text-slate-400">{tribunalTeamInitials(name)}</span>
      {logoUrl && <img src={logoUrl} alt={`Logo de ${name}`} className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] object-contain" referrerPolicy="no-referrer" />}
    </div>
  );
}

export default function TribunalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const selectedTournamentId = searchParams.get('tournament');
  const asOfDate = normalizeAsOfDate(searchParams.get('hasta'));

  const [loading, setLoading] = useState(true);
  const [fines, setFines] = useState<any[]>([]);
  const [proofHistoryVersion, setProofHistoryVersion] = useState(0);
  const [paymentProofs, setPaymentProofs] = useState<any[]>([]);
  const [selectedProof, setSelectedProof] = useState<any | null>(null);
  const [selectedProofUrl, setSelectedProofUrl] = useState('');
  const [selectedProofEvents, setSelectedProofEvents] = useState<any[]>([]);
  const [selectedProofEventIds, setSelectedProofEventIds] = useState<string[]>([]);
  const [selectedProofAmount, setSelectedProofAmount] = useState('');
  const [proofRejectionReason, setProofRejectionReason] = useState('');
  const [selectedTeamHistory, setSelectedTeamHistory] = useState<any | null>(null);
  const [selectedDisciplinary, setSelectedDisciplinary] = useState<any | null>(null);
  const [disciplinaryComment, setDisciplinaryComment] = useState('');
  const [suspensionMatches, setSuspensionMatches] = useState('');
  const [externalPaymentTarget, setExternalPaymentTarget] = useState<{ rowId: string; teamId: string; teamName: string } | null>(null);
  const [externalPaymentNote, setExternalPaymentNote] = useState('Pago confirmado por fuera de la plataforma');
  const [externalPaymentFile, setExternalPaymentFile] = useState<File | null>(null);
  const [externalPaymentBusy, setExternalPaymentBusy] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  
  // Estados para los filtros y Pestañas
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTab, setSelectedTab] = useState<string>('GLOBAL'); 
  
  const [tournamentSettings, setTournamentSettings] = useState<any>(null);

  useEffect(() => {
    if (slug) loadData();
  }, [slug, selectedTournamentId, asOfDate]);

  async function loadData() {
    setLoading(true);

    const { data: clientData } = await supabase.from('clients').select('id').eq('slug', slug).single();
    
    if (clientData) {
      const { data: trns } = await supabase
        .from('tournaments')
        .select('id, name, fair_play_enabled, fine_yellow_amount, fine_red_amount')
        .eq('client_id', clientData.id)
        .eq(selectedTournamentId ? 'id' : 'is_active', selectedTournamentId || true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(); 
      
      setTournamentSettings(trns || { fair_play_enabled: false, fine_yellow_amount: 0, fine_red_amount: 0 });

      if (trns?.fair_play_enabled) {
        const { data: eventsData, error } = await supabase
          .from('match_events')
          // 🚨 AHORA PEDIMOS round_number EN LUGAR DE name 🚨
          .select(`
            id, event_type, fine_status, created_at, minute_record, period, disciplinary_comment, suspension_matches,
            match_id, player_id, team_id, match_second,
            players!inner(name, shirt_number, teams(id, name, schools(name, logo_url))),
            matches!inner(matchdays!inner(round_number, scheduled_date, categories!inner(tournaments!inner(id, client_id))))
          `)
          .eq('matches.matchdays.categories.tournaments.client_id', clientData.id)
          .eq('matches.matchdays.categories.tournaments.id', trns.id)
          .in('event_type', ['YELLOW', 'RED'])
          .neq('fine_status', 'NONE') 
          .order('created_at', { ascending: false });

        let compatibleEvents = eventsData;
        if (error) {
          // Compatibilidad mientras la migración disciplinaria aún no se aplica.
          const fallback = await supabase.from('match_events').select(`id, event_type, fine_status, created_at, minute_record, period, match_id, player_id, team_id, match_second, players!inner(name, shirt_number, teams(id, name, schools(name, logo_url))), matches!inner(matchdays!inner(round_number, scheduled_date, categories!inner(tournaments!inner(id, client_id))))`).eq('matches.matchdays.categories.tournaments.client_id', clientData.id).eq('matches.matchdays.categories.tournaments.id', trns.id).in('event_type', ['YELLOW', 'RED']).neq('fine_status', 'NONE').order('created_at', { ascending: false });
          compatibleEvents = fallback.data as any;
          if (fallback.error) toast.error(`Error BD: ${fallback.error.message}`);
        }

        if (compatibleEvents) setFines(normalizeDoubleCautions((compatibleEvents as any).filter((event: any) => !asOfDate || event.matches?.matchdays?.scheduled_date <= asOfDate)));

        const proofsResult = await getFinePaymentProofs(slug, trns.id);
        if (proofsResult.success) setPaymentProofs(proofsResult.data);
      }
    }
    setLoading(false);
  }

  const eventFineAmount = (event: any) => {
    const storedAmount = Number(event.fine_amount || 0);
    const configuredAmount = Number(event.event_type === 'RED' ? tournamentSettings?.fine_red_amount || 0 : tournamentSettings?.fine_yellow_amount || 0);
    return storedAmount > 0 ? storedAmount : configuredAmount;
  };

  const handleApproveProof = async (proof: any, eventIds = selectedProofEventIds, amount = selectedProofAmount) => {
    if (proof.proof_scope === 'TEAM' && eventIds.length === 0) return toast.error('Selecciona las sanciones que cubre el comprobante.');
    const amountText = amount.trim();
    const parsedAmount = amountText ? Number(amountText) : null;
    if (amountText && (parsedAmount === null || !Number.isFinite(parsedAmount) || parsedAmount <= 0)) return toast.error('Indica un valor válido para el comprobante.');
    const toastId = toast.loading('Validando comprobante...');
    const result = await approveFinePaymentProof(slug, proof.id, eventIds, parsedAmount);
    if (!result.success) return toast.error(result.error, { id: toastId });
    toast.success(result.data?.coverageType === 'PARTIAL' ? `Pago parcial validado. ${result.data.appliedAmount} COP aplicado.` : proof.proof_scope === 'TEAM' ? 'Pago validado. Equipo habilitado.' : 'Pago validado. Jugador habilitado.', { id: toastId });
    setSelectedProof(null);
    setSelectedProofEvents([]);
    setSelectedProofEventIds([]);
    setSelectedProofAmount('');
    setProofHistoryVersion(value => value + 1);
    loadData();
  };

  const handleViewProof = async (proof: any) => {
    setSelectedProof(proof);
    setSelectedProofUrl('');
    const result = await getFinePaymentProofUrl(slug, proof.id);
    if (!result.success) return toast.error(result.error);
    setSelectedProofUrl(result.data.url);
  };

  const openProofReview = async (proof: any, coverageEvents: any[] = []) => {
    const pendingEvents = coverageEvents.filter((event: any) => event.fine_status === 'UNPAID');
    const playerEventIds = proof.proof_scope === 'PLAYER' ? pendingEvents.map((event: any) => event.id) : [];
    setSelectedProofEvents(pendingEvents);
    setSelectedProofEventIds(playerEventIds);
    setSelectedProofAmount(proof.proof_scope === 'PLAYER' ? String(pendingEvents.reduce((sum: number, event: any) => sum + eventFineAmount(event), 0)) : '');
    setProofRejectionReason('');
    await handleViewProof(proof);
  };

  const handleRejectProof = async () => {
    if (!selectedProof) return;
    const result = await rejectFinePaymentProof(slug, selectedProof.id, proofRejectionReason);
    if (!result.success) return toast.error(result.error);
    toast.success('Comprobante rechazado. El delegado podrá enviar uno nuevo.');
    setSelectedProof(null);
    setSelectedProofEvents([]);
    setSelectedProofEventIds([]);
    setSelectedProofAmount('');
    setProofRejectionReason('');
    setProofHistoryVersion((value) => value + 1);
    loadData();
  };

  const toggleProofEvent = (event: any) => {
    const nextIds = selectedProofEventIds.includes(event.id)
      ? selectedProofEventIds.filter((id) => id !== event.id)
      : [...selectedProofEventIds, event.id];
    setSelectedProofEventIds(nextIds);
    setSelectedProofAmount(String(selectedProofEvents.filter((item: any) => nextIds.includes(item.id)).reduce((sum: number, item: any) => sum + eventFineAmount(item), 0)));
  };

  const openDisciplinaryEditor = (event: any) => {
    setSelectedDisciplinary(event);
    setDisciplinaryComment(event.disciplinary_comment || '');
    setSuspensionMatches(event.event_type === 'RED' && event.suspension_matches ? String(event.suspension_matches) : '');
  };
  const saveDisciplinaryRecord = async () => {
    if (!selectedDisciplinary) return;
    const result = await updateDisciplinaryRecord(slug, selectedDisciplinary.id, disciplinaryComment, selectedDisciplinary.event_type === 'RED' && suspensionMatches ? Number(suspensionMatches) : null);
    if (!result.success) return toast.error(result.error);
    toast.success('Resolución disciplinaria guardada.');
    setSelectedDisciplinary(null);
    loadData();
  };

  const proofByEvent = paymentProofs.reduce((acc: Record<string, any>, proof: any) => { acc[proof.match_event_id] = proof; return acc; }, {});
  const proofByPlayer = paymentProofs.reduce((acc: Record<string, any>, proof: any) => { if (proof.proof_scope === 'PLAYER' && proof.player_id) acc[proof.player_id] = proof; return acc; }, {});
  const proofByTeam = paymentProofs.reduce((acc: Record<string, any>, proof: any) => { if (proof.proof_scope === 'TEAM' && proof.team_id) acc[proof.team_id] = proof; return acc; }, {});

  const handlePayFine = async (eventId: string, playerName: string) => {
    const toastId = toast.loading(`Procesando pago de ${playerName}...`);

    const { error } = await supabase
      .from('match_events')
      .update({ fine_status: 'PAID' })
      .eq('id', eventId);

    if (error) {
      toast.error('Error al procesar el pago.', { id: toastId });
    } else {
      toast.success('Pago registrado correctamente. Jugador habilitado.', { id: toastId });
      loadData(); 
    }
  };

  const beginExternalPayment = (fine: any) => {
    const teamId = fine.team_id || fine.teamBalance?.team_id;
    const teamName = fine.teamBalance?.teamName || fine.players?.teams?.name || 'este equipo';
    if (!teamId) return toast.error('No se pudo identificar el equipo.');
    setExternalPaymentTarget({ rowId: fine.id, teamId, teamName });
    setExternalPaymentNote('Pago confirmado por fuera de la plataforma');
    setExternalPaymentFile(null);
  };

  const handleExternalPayment = async () => {
    if (!externalPaymentTarget || !externalPaymentNote.trim() || !externalPaymentFile) return toast.error('Adjunta el comprobante del pago externo.');
    setExternalPaymentBusy(true);
    const toastId = toast.loading('Registrando pago externo...');
    const result = await markTeamFinesPaidExternally(slug, tournamentSettings?.id || selectedTournamentId || '', externalPaymentTarget.teamId, externalPaymentNote.trim(), externalPaymentFile);
    if (!result.success) {
      setExternalPaymentBusy(false);
      return toast.error(result.error, { id: toastId });
    }
    toast.success(`Pago externo registrado. ${result.data.updated} multa(s) actualizada(s).`, { id: toastId });
    setExternalPaymentTarget(null);
    setExternalPaymentBusy(false);
    loadData();
  };

  const filteredFines = fines.filter(fine => {
    const matchesSearch = fine.players?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          fine.players?.teams?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesDate = true;
    if (startDate || endDate) {
      const fineDate = fine.created_at.split('T')[0];
      if (startDate && fineDate < startDate) matchesDate = false;
      if (endDate && fineDate > endDate) matchesDate = false;
    }

    return matchesSearch && matchesDate;
  });

  const groupedFines = filteredFines.reduce((acc: any, fine: any) => {
    // 🚨 ARMAMOS EL NOMBRE CON EL round_number 🚨
    const roundNum = fine.matches?.matchdays?.round_number;
    const tabName = roundNum ? `JORNADA ${roundNum}` : 'FECHA NO ASIGNADA';
    
    if (!acc[tabName]) acc[tabName] = [];
    acc[tabName].push(fine);
    return acc;
  }, {});

  const availableDates = Object.keys(groupedFines).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.replace(/\D/g, '')) || 0;
    return numA - numB;
  });
  
  const activeTab = (selectedTab !== 'GLOBAL' && !groupedFines[selectedTab]) ? 'GLOBAL' : selectedTab;
  const eventsToDisplay = activeTab === 'GLOBAL' ? filteredFines : groupedFines[activeTab];

  // La recaudación se consolida por equipo: el delegado realiza un único pago.
  const teamBalances = (eventsToDisplay || []).reduce((acc: Record<string, any>, fine: any) => {
    const teamId = fine.team_id || fine.players?.teams?.id || fine.players?.teams?.name || 'sin-equipo';
    const team = acc[teamId] || {
      id: teamId,
      name: fine.players?.teams?.name || 'Equipo sin asignar',
      events: [],
      unpaid: 0,
      paid: 0,
      pendingAmount: 0,
      collectedAmount: 0,
      proof: proofByTeam[teamId] || null,
      playerProofs: {},
    };
    const amount = fine.event_type === 'RED' ? (tournamentSettings?.fine_red_amount || fine.fine_amount || 0) : (tournamentSettings?.fine_yellow_amount || fine.fine_amount || 0);
    team.events.push(fine);
    if (fine.fine_status === 'PAID') {
      team.paid += 1;
      team.collectedAmount += amount;
    } else {
      team.unpaid += 1;
      team.pendingAmount += amount;
    }
    if (proofByEvent[fine.id]) team.proof = proofByEvent[fine.id];
    if (proofByPlayer[fine.player_id]) team.playerProofs[fine.player_id] = proofByPlayer[fine.player_id];
    acc[teamId] = team;
    return acc;
  }, {});
  const balancesToDisplay = Object.values(teamBalances);
  const finesToDisplay = balancesToDisplay.map((balance: any) => ({
    ...balance.events[0],
    id: `team-${balance.id}`,
    teamBalance: balance,
    fine_status: balance.unpaid > 0 ? 'UNPAID' : 'PAID',
    fine_amount: balance.pendingAmount || balance.collectedAmount,
  }));

  const totalUnpaidCount = Object.values(filteredFines.reduce((acc: Record<string, boolean>, fine: any) => { if (fine.fine_status === 'UNPAID') acc[fine.team_id || fine.players?.teams?.name || fine.id] = true; return acc; }, {})).length;
  const totalMoneyPending = filteredFines.filter(f => f.fine_status === 'UNPAID').reduce((sum, f) => sum + (f.event_type === 'RED' ? (tournamentSettings?.fine_red_amount || f.fine_amount || 0) : (tournamentSettings?.fine_yellow_amount || f.fine_amount || 0)), 0);
  const totalMoneyCollected = filteredFines.filter(f => f.fine_status === 'PAID').reduce((sum, f) => sum + (f.event_type === 'RED' ? (tournamentSettings?.fine_red_amount || f.fine_amount || 0) : (tournamentSettings?.fine_yellow_amount || f.fine_amount || 0)), 0);

  if (!tournamentSettings?.fair_play_enabled) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center">
         <div className="bg-white p-12 rounded-[2rem] border border-slate-200 shadow-xl text-center max-w-lg">
            <Scale size={64} className="text-slate-300 mx-auto mb-6"/>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-2">Tribunal Desactivado</h2>
            <p className="text-slate-500 font-medium mb-8">El torneo activo no tiene configurado el módulo de Fair Play y Sanciones.</p>
            <Link href={`/${slug}/admin/torneo`} className="bg-blue-600 text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-colors">
              Configurar Torneo
            </Link>
         </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 selection:bg-blue-500/30">
      <div className="max-w-6xl mx-auto relative">
        
        {/* NAVEGACIÓN Y CABECERA */}
        <div className="mb-8">
          <Link href={`/${slug}/admin`} className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-600 font-black uppercase tracking-widest text-[10px] mb-6 transition-colors bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <ArrowLeft size={16} /> Panel principal
          </Link>
          
          <div className="mb-6">
            <div className="flex items-center gap-3 text-red-500 mb-2">
              <Scale size={28} />
              <span className="font-black tracking-[0.3em] uppercase text-xs">Módulo Financiero</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">Tribunal Disciplinario</h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2">
              Gestión de Sanciones, Fair Play y Recaudación
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="bg-white border border-slate-200 p-5 md:p-6 rounded-3xl shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shrink-0"><AlertTriangle size={24}/></div>
              <div>
                <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400">Sanciones Activas</p>
                <p className="text-2xl md:text-3xl font-black text-slate-800 leading-none">{totalUnpaidCount}</p>
              </div>
            </div>
            
            <div className="bg-white border border-slate-200 p-5 md:p-6 rounded-3xl shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0"><DollarSign size={24}/></div>
              <div>
                <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400">Saldo en Mora</p>
                <p className="text-2xl md:text-3xl font-black text-amber-600 leading-none">{formatCopAmount(totalMoneyPending)}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 md:p-6 rounded-3xl shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0"><Wallet size={24}/></div>
              <div>
                <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400">Total Recaudado</p>
                <p className="text-2xl md:text-3xl font-black text-emerald-600 leading-none">{formatCopAmount(totalMoneyCollected)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* CONTENEDOR PRINCIPAL DE LA TABLA */}
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-4">

          <section className="hidden">
            <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Comprobantes recibidos</p><h2 className="text-xl font-black uppercase text-slate-900">Validar pagos de equipos</h2></div><span className="rounded-full bg-blue-600 px-3 py-1 text-[10px] font-black uppercase text-white">{paymentProofs.length} pendientes</span></div>
            {paymentProofs.length === 0 ? <p className="rounded-2xl border border-dashed border-blue-200 bg-white/70 p-4 text-xs font-bold uppercase tracking-wider text-slate-500">No hay comprobantes pendientes. Cuando un delegado cargue un baucher desde el perfil de su jugador, aparecerá aquí para revisarlo.</p> : <div className="grid gap-3 md:grid-cols-2">{paymentProofs.map((proof) => <div key={proof.id} className="flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-4"><div className="min-w-0"><p className="truncate text-sm font-black uppercase">#{proof.players?.shirt_number || '-'} {proof.players?.name}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{proof.original_filename}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => handleViewProof(proof)} className="rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-50">Ver</button><button type="button" onClick={() => handleApproveProof(proof)} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700">Aceptar</button></div></div>)}</div>}
          </section>
          
          <ApprovedPaymentProofs key={`${tournamentSettings.id}:${proofHistoryVersion}`} slug={slug} tournamentId={tournamentSettings.id} />

          {/* BARRA DE BÚSQUEDA Y FILTROS DE FECHA */}
          <div className="p-4 md:p-6 border-b border-slate-200 flex flex-col lg:flex-row items-center justify-between gap-4 bg-slate-50">
            <div className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-3 rounded-xl w-full lg:max-w-sm shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <Search size={16} className="text-slate-400" />
              <input type="text" placeholder="Buscar jugador o equipo..." className="bg-transparent text-sm font-bold text-slate-900 outline-none w-full placeholder:text-slate-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="flex items-center gap-2 md:gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 md:px-4 md:py-3 rounded-xl shadow-sm w-full lg:w-auto">
                <Calendar size={16} className="text-slate-400 hidden md:block" />
                <div className="flex flex-col w-full">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Desde</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-xs md:text-sm font-bold text-slate-700 outline-none w-full cursor-pointer" />
                </div>
              </div>
              <span className="font-black text-slate-300">-</span>
              <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 md:px-4 md:py-3 rounded-xl shadow-sm w-full lg:w-auto">
                <Calendar size={16} className="text-slate-400 hidden md:block" />
                <div className="flex flex-col w-full">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Hasta</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-xs md:text-sm font-bold text-slate-700 outline-none w-full cursor-pointer" />
                </div>
              </div>

              {(startDate || endDate) && (
                <button onClick={() => { setStartDate(''); setEndDate(''); setSelectedTab('GLOBAL'); }} className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-2 md:px-4 md:py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shrink-0">
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* 🚨 PESTAÑAS DESLIZABLES POR JORNADAS/FECHAS 🚨 */}
          {availableDates.length > 0 && (
            <div className="px-4 md:px-6 pt-4 pb-2 bg-slate-50 border-b border-slate-200">
              <div className="flex overflow-x-auto scrollbar-hide gap-2 pb-2">
                <button 
                  onClick={() => setSelectedTab('GLOBAL')} 
                  className={`flex-shrink-0 px-5 py-2 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest transition-all border shadow-sm ${activeTab === 'GLOBAL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                >
                  Global
                </button>
                {availableDates.map(date => (
                  <button 
                    key={date}
                    onClick={() => setSelectedTab(date)} 
                    className={`flex-shrink-0 px-5 py-2 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest transition-all border shadow-sm flex items-center gap-2 ${activeTab === date ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                  >
                    <Flag size={12} className={activeTab === date ? 'text-blue-500' : 'text-slate-400'}/>
                    {date}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 bg-slate-50/70 p-4 md:p-6">
            {loading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Consultando expedientes...</div>
            ) : finesToDisplay.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-xs font-bold uppercase tracking-widest text-slate-400">No hay sanciones para esta selección</div>
            ) : finesToDisplay.map((fine: any) => {
              const isPaid = fine.fine_status === 'PAID';
              const teamBalance = fine.teamBalance;
              const teamId = String(teamBalance?.id || fine.team_id || fine.players?.teams?.id || fine.id);
              const teamName = teamBalance?.name || fine.players?.teams?.name || 'Equipo sin asignar';
              const amount = teamBalance?.pendingAmount || teamBalance?.collectedAmount || (fine.event_type === 'RED' ? tournamentSettings?.fine_red_amount : tournamentSettings?.fine_yellow_amount);
              const sanctionLabels = teamBalance ? Array.from(new Set(teamBalance.events.map((event: any) => event.event_type === 'RED' ? (event.isDoubleCaution ? 'Doble amarilla · roja' : 'Roja directa') : 'Amarilla'))) : [];
              const isExpanded = expandedTeamId === teamId;
              const playerGroups = teamBalance ? Array.from(new Map(teamBalance.events.map((event: any) => [event.player_id || event.id, event])).values()) : [];
              const teamLogo = fine.players?.teams?.schools?.logo_url;

              return (
                <article key={fine.id} className={`overflow-hidden rounded-[2rem] border bg-white shadow-sm transition-all ${isExpanded ? 'border-blue-200 shadow-lg shadow-blue-100/60' : 'border-slate-200 hover:border-blue-200 hover:shadow-md'}`}>
                  <div className="flex flex-col gap-4 p-4 md:p-5 xl:flex-row xl:items-center">
                    <button type="button" onClick={() => setExpandedTeamId(isExpanded ? null : teamId)} aria-expanded={isExpanded} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                      <TribunalTeamLogo name={teamName} logoUrl={teamLogo} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}><span className={`h-1.5 w-1.5 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-red-500'}`} />{isPaid ? 'Pagado' : 'Deuda activa'}</span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{teamBalance?.events.length || 0} registros</span>
                        </div>
                        <h2 className="mt-2 truncate text-lg font-black uppercase tracking-tight text-slate-950 md:text-xl">{teamName}</h2>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{teamBalance?.unpaid || 0} pendientes · {teamBalance?.paid || 0} pagadas</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {sanctionLabels.map((label: any) => <span key={label} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider ${String(label).includes('Roja') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}><span className={`h-3 w-2 rounded-[2px] ${String(label).includes('Roja') ? 'bg-red-500' : 'bg-yellow-400'}`} />{label}</span>)}
                        </div>
                      </div>
                      <div className="hidden shrink-0 items-center gap-5 md:flex">
                        <div className="text-right"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{isPaid ? 'Total pagado' : 'Saldo pendiente'}</p><p className={`mt-1 text-xl font-black tracking-tight ${isPaid ? 'text-emerald-600' : 'text-slate-950'}`}>{formatCopAmount(amount)}</p></div>
                        <ChevronDown size={22} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                      <div className="flex items-center gap-2 md:hidden"><span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{isPaid ? 'Total pagado' : 'Saldo pendiente'}</span><span className={`text-lg font-black ${isPaid ? 'text-emerald-600' : 'text-slate-950'}`}>{formatCopAmount(amount)}</span></div>
                      {teamBalance && <button type="button" onClick={() => setSelectedTeamHistory(teamBalance)} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-700 transition-colors hover:bg-indigo-100"><Calendar size={14}/> Historial</button>}
                      {isPaid ? <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600"><ShieldCheck size={14}/> Liberado</span> : <>
                        {(teamBalance?.proof || Object.values(teamBalance?.playerProofs || {})[0] || proofByEvent[fine.id]) ? <button type="button" onClick={() => { const proof = teamBalance?.proof || Object.values(teamBalance?.playerProofs || {})[0] || proofByEvent[fine.id]; openProofReview(proof, proof.proof_scope === 'TEAM' ? teamBalance.events : teamBalance.events.filter((event: any) => event.player_id === proof.player_id)); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md transition-all hover:bg-blue-700 active:scale-95"><Eye size={14}/> Ver comprobante</button> : <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><Clock size={14}/> Sin comprobante</span>}
                        <button type="button" onClick={() => beginExternalPayment(fine)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 transition-colors hover:bg-amber-100">Registrar pago externo</button>
                      </>}
                    </div>
                  </div>

                  {isExpanded && teamBalance && <div className="border-t border-blue-100 bg-blue-50/40 p-4 md:p-5">
                    <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-700">Detalle de sanciones</p><p className="mt-1 text-xs font-semibold text-slate-500">Jugadores, tipo de tarjeta, estado del pago y comprobantes asociados.</p></div><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Haz clic en otro equipo para cambiar el detalle</span></div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {playerGroups.map((playerEvent: any) => {
                        const playerEvents = teamBalance.events.filter((event: any) => event.player_id === playerEvent.player_id);
                        const pendingEvents = playerEvents.filter((event: any) => event.fine_status === 'UNPAID');
                        const proof = teamBalance.proof || teamBalance.playerProofs?.[playerEvent.player_id];
                        return <div key={playerEvent.player_id || playerEvent.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-500">#{playerEvent.players?.shirt_number || '-'}</span><div className="min-w-0"><p className="truncate text-sm font-black uppercase text-slate-950">{playerEvent.players?.name || 'Jugador sin asignar'}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">{pendingEvents.length ? `${pendingEvents.length} pendiente(s)` : 'Saldo cancelado'}</p></div></div>
                            {pendingEvents.length ? (proof ? <span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">Comprobante recibido</span> : <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-500">Sin comprobante</span>) : <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">Pagado</span>}
                          </div>
                          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                            {playerEvents.map((event: any) => { const eventIsRed = event.event_type === 'RED'; const eventProof = teamBalance.proof || teamBalance.playerProofs?.[event.player_id] || proofByEvent[event.id]; return <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><span className={`h-6 w-4 shrink-0 rounded-[3px] border border-black/10 ${eventIsRed ? 'bg-red-500' : 'bg-yellow-400'}`} /><div className="min-w-0"><p className="truncate text-[10px] font-black uppercase text-slate-800">{eventIsRed ? (event.isDoubleCaution ? 'Roja por doble amarilla' : 'Roja directa') : 'Tarjeta amarilla'}</p><p className="truncate text-[9px] font-bold uppercase tracking-wider text-slate-400">{new Date(event.created_at).toLocaleDateString('es-CO')} · {event.period || '--'} {event.minute_record ? `· ${event.minute_record}'` : ''} · {event.fine_status === 'PAID' ? 'Pagada' : 'Pendiente'}</p></div></div><div className="flex shrink-0 items-center gap-2"><span className="text-[10px] font-black text-slate-700">{formatCopAmount(eventFineAmount(event))}</span>{event.fine_status === 'UNPAID' && eventProof && <button type="button" onClick={() => openProofReview(eventProof, eventProof.proof_scope === 'TEAM' ? teamBalance.events : playerEvents)} className="rounded-lg border border-blue-200 bg-white p-1.5 text-blue-700" title="Ver comprobante"><Eye size={14}/></button>}</div></div>; })}
                          </div>
                          {pendingEvents.length > 0 && proof && <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => openProofReview(proof, proof.proof_scope === 'TEAM' ? teamBalance.events : playerEvents)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-blue-700">Ver comprobante</button></div>}
                        </div>;
                      })}
                    </div>
                  </div>}
                </article>
              );
            })}
          </div>
        </div>
        {selectedTeamHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setSelectedTeamHistory(null)}>
            <section role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Historial disciplinario</p><h2 className="text-xl font-black uppercase">{selectedTeamHistory.name}</h2></div><button type="button" onClick={() => setSelectedTeamHistory(null)} className="rounded-xl bg-slate-100 p-2" aria-label="Cerrar">×</button></div>
              <div className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Control de comprobantes por jugador</p>
                <div className="mt-3 divide-y divide-violet-100">
                  {Array.from(new Map(selectedTeamHistory.events.map((event: any) => [event.player_id || event.id, event])).values()).map((playerEvent: any) => {
                    const proof = selectedTeamHistory.proof || selectedTeamHistory.playerProofs?.[playerEvent.player_id];
                    const playerEvents = selectedTeamHistory.events.filter((event: any) => event.player_id === playerEvent.player_id);
                    const pending = playerEvents.some((event: any) => event.fine_status === 'UNPAID');
                    return <div key={playerEvent.player_id || playerEvent.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5"><div><p className="text-xs font-black uppercase">#{playerEvent.players?.shirt_number || '-'} {playerEvent.players?.name || 'Jugador sin asignar'}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{pending ? `${playerEvents.filter((event: any) => event.fine_status === 'UNPAID').length} pendiente(s)` : 'Sin saldo pendiente'}</p></div><div className="flex items-center gap-2">{pending && (proof ? <><span className="rounded-lg bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">Comprobante recibido</span><button type="button" onClick={() => openProofReview(proof, proof.proof_scope === 'TEAM' ? selectedTeamHistory.events : playerEvents)} className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-[9px] font-black uppercase text-blue-700">Revisar</button></> : <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-500">Sin comprobante</span>)}</div></div>;
                  })}
                </div>
              </div>
              <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
                {selectedTeamHistory.events.map((event: any) => <div key={event.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-xs font-black uppercase">#{event.players?.shirt_number || '-'} {event.players?.name || 'Jugador sin asignar'} · {event.event_type === 'RED' ? 'Tarjeta roja' : 'Tarjeta amarilla'}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{new Date(event.created_at).toLocaleDateString('es-CO')} · {event.period || '--'} {event.minute_record ? `· ${event.minute_record}'` : ''} · {event.fine_status === 'PAID' ? 'Pagada' : 'Pendiente'} {event.suspension_matches ? `· Suspensión: ${event.suspension_matches} jornadas` : ''}</p>{event.disciplinary_comment && <p className="mt-1 text-[10px] font-semibold text-slate-500">{event.disciplinary_comment}</p>}</div><button type="button" onClick={() => openDisciplinaryEditor(event)} className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700"><Settings2 size={14} className="mr-1 inline"/> Resolver</button></div>)}
              </div>
            </section>
          </div>
        )}
        {selectedDisciplinary && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setSelectedDisciplinary(null)}>
            <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Resolución disciplinaria</p><h2 className="mt-1 text-2xl font-black uppercase">{selectedDisciplinary.players?.name || 'Jugador'}</h2>
              <label className="mt-5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Motivo / comentario<textarea value={disciplinaryComment} onChange={(event) => setDisciplinaryComment(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-blue-500" placeholder="Describe el motivo de la amonestación…" /></label>
              {selectedDisciplinary.event_type === 'RED' && <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-500">Jornadas de suspensión<select value={suspensionMatches} onChange={(event) => setSuspensionMatches(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-black outline-none focus:border-blue-500"><option value="">Sin suspensión adicional</option>{Array.from({ length: 20 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? 'jornada' : 'jornadas'}</option>)}</select></label>}
              <div className="mt-6 flex gap-3"><button type="button" onClick={() => setSelectedDisciplinary(null)} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600">Cancelar</button><button type="button" onClick={saveDisciplinaryRecord} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white">Guardar resolución</button></div>
            </section>
          </div>
        )}
        {selectedProof && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setSelectedProof(null)}>
            <section role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Revisión de comprobante</p><h2 className="text-xl font-black uppercase">{selectedProof.proof_scope === 'TEAM' ? (selectedProof.teams?.name || 'Equipo') : (selectedProof.players?.name || 'Jugador')}</h2><p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{selectedProof.proof_scope === 'TEAM' ? 'Pago global con cobertura seleccionable' : 'Pago individual del jugador'}</p></div><button type="button" onClick={() => setSelectedProof(null)} className="rounded-xl bg-slate-100 p-2" aria-label="Cerrar"><ArrowLeft size={18}/></button></div>
              {selectedProofUrl ? <iframe src={selectedProofUrl} title="Comprobante de pago" className="h-[38vh] w-full rounded-2xl border border-slate-200" /> : <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">Cargando comprobante…</div>}
              {selectedProof.proof_scope === 'TEAM' && <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Cobertura del comprobante global</p><p className="mt-1 text-xs font-semibold text-violet-900">Selecciona únicamente las sanciones que demuestra el valor pagado.</p></div><button type="button" onClick={() => { const ids = selectedProofEvents.map((event: any) => event.id); setSelectedProofEventIds(ids); setSelectedProofAmount(String(selectedProofEvents.reduce((sum: number, event: any) => sum + eventFineAmount(event), 0))); }} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-violet-700">Seleccionar todas</button></div><div className="mt-3 space-y-2">{selectedProofEvents.map((event: any) => { const checked = selectedProofEventIds.includes(event.id); return <label key={event.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-white px-3 py-3 ${checked ? 'border-violet-500 ring-2 ring-violet-100' : 'border-violet-100'}`}><span className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={checked} onChange={() => toggleProofEvent(event)} className="h-4 w-4 accent-violet-600" /><span className={`h-6 w-4 shrink-0 rounded-[3px] ${event.event_type === 'RED' ? 'bg-red-500' : 'bg-yellow-400'}`} /><span className="min-w-0"><span className="block truncate text-[10px] font-black uppercase text-slate-800">#{event.players?.shirt_number || '-'} {event.players?.name || 'Jugador'}</span><span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400">{event.event_type === 'RED' ? 'Tarjeta roja' : 'Tarjeta amarilla'} · {new Date(event.created_at).toLocaleDateString('es-CO')}</span></span></span><span className="shrink-0 text-xs font-black text-slate-800">{formatCopAmount(eventFineAmount(event))}</span></label>; })}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className="text-[9px] font-black uppercase tracking-widest text-violet-700">Sanciones seleccionadas</p><p className="mt-1 text-xl font-black text-slate-950">{formatCopAmount(selectedProofEvents.filter((event: any) => selectedProofEventIds.includes(event.id)).reduce((sum: number, event: any) => sum + eventFineAmount(event), 0))}</p></div><label className="text-[9px] font-black uppercase tracking-widest text-violet-700">Valor validado del comprobante<input type="number" min="1" step="1" value={selectedProofAmount} onChange={(event) => setSelectedProofAmount(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-black text-slate-950 outline-none focus:border-violet-500" placeholder="Ej. 25000" /></label></div></div>}
              {selectedProof.proof_scope === 'PLAYER' && <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Cobertura individual</p><p className="mt-1 text-xs font-semibold text-blue-900">Se aplicará a todas las sanciones pendientes de este jugador.</p><p className="mt-2 text-xl font-black text-slate-950">{formatCopAmount(selectedProofEvents.reduce((sum: number, event: any) => sum + eventFineAmount(event), 0))}</p></div>}
              <button type="button" onClick={() => handleApproveProof(selectedProof)} disabled={selectedProof.proof_scope === 'TEAM' && (!selectedProofEventIds.length || !selectedProofAmount.trim())} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={16} className="mr-2 inline"/> {selectedProof.proof_scope === 'TEAM' ? 'Aprobar cobertura seleccionada' : 'Confirmar pago del jugador'}</button>
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4"><label className="text-[9px] font-black uppercase tracking-widest text-red-700">Motivo si el comprobante no coincide<textarea value={proofRejectionReason} onChange={(event) => setProofRejectionReason(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-red-200 bg-white p-3 text-xs font-semibold text-slate-800 outline-none focus:border-red-500" placeholder="Ej. El valor del comprobante no cubre las sanciones seleccionadas" /></label><button type="button" onClick={handleRejectProof} disabled={proofRejectionReason.trim().length < 5} className="mt-3 w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40">Rechazar comprobante</button></div>
            </section>
          </div>
        )}
        {externalPaymentTarget && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4" onClick={() => !externalPaymentBusy && setExternalPaymentTarget(null)}>
            <section role="dialog" aria-modal="true" aria-labelledby="external-payment-title" className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Registro manual</p><h2 id="external-payment-title" className="mt-1 text-xl font-black uppercase text-slate-900">Pago externo</h2><p className="mt-1 text-xs font-bold uppercase text-slate-500">{externalPaymentTarget.teamName}</p></div>
                <button type="button" onClick={() => setExternalPaymentTarget(null)} disabled={externalPaymentBusy} className="rounded-xl bg-slate-100 px-3 py-2 text-xl leading-none text-slate-500 disabled:opacity-50" aria-label="Cerrar">×</button>
              </div>
              <label className="mt-5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Soporte o referencia del pago<textarea value={externalPaymentNote} onChange={(event) => setExternalPaymentNote(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" placeholder="Indica el soporte o referencia del pago" /></label>
              <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3 text-xs font-black uppercase tracking-widest text-amber-800"><span>{externalPaymentFile ? externalPaymentFile.name : 'Cargar imagen o PDF'}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={externalPaymentBusy} onChange={(event) => setExternalPaymentFile(event.target.files?.[0] || null)} /></label>
              <p className="mt-2 text-[10px] font-semibold text-slate-400">Archivo privado · JPG, PNG, WebP o PDF · máximo 5 MB.</p>
              <div className="mt-5 flex gap-3"><button type="button" onClick={() => setExternalPaymentTarget(null)} disabled={externalPaymentBusy} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 disabled:opacity-50">Cancelar</button><button type="button" onClick={handleExternalPayment} disabled={externalPaymentBusy || externalPaymentNote.trim().length < 5 || !externalPaymentFile} className="flex-1 rounded-xl bg-amber-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-amber-600/20 disabled:opacity-50">{externalPaymentBusy ? 'Guardando…' : 'Confirmar pago'}</button></div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
