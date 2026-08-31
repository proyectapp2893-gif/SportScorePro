'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabase';
import { useParams, useSearchParams } from 'next/navigation';
import { Scale, AlertTriangle, ShieldCheck, DollarSign, Search, CheckCircle2, Flame, ArrowLeft, Wallet, Calendar, Clock, Flag, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { formatCopAmount } from '@/app/lib/formatters';
import { normalizeDoubleCautions } from '@/app/lib/discipline/double-caution';
import { approveFinePaymentProof, getFinePaymentProofs, getFinePaymentProofUrl } from './actions';

export default function TribunalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const selectedTournamentId = searchParams.get('tournament');

  const [loading, setLoading] = useState(true);
  const [fines, setFines] = useState<any[]>([]);
  const [paymentProofs, setPaymentProofs] = useState<any[]>([]);
  const [selectedProof, setSelectedProof] = useState<any | null>(null);
  const [selectedProofUrl, setSelectedProofUrl] = useState('');
  
  // Estados para los filtros y Pestañas
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTab, setSelectedTab] = useState<string>('GLOBAL'); 
  
  const [tournamentSettings, setTournamentSettings] = useState<any>(null);

  useEffect(() => {
    if (slug) loadData();
  }, [slug, selectedTournamentId]);

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
            id, event_type, fine_status, created_at, minute_record, period,
            match_id, player_id, team_id, match_second,
            players!inner(name, shirt_number, teams(name, schools(logo_url))),
            matches!inner(matchdays!inner(round_number, categories!inner(tournaments!inner(id, client_id))))
          `)
          .eq('matches.matchdays.categories.tournaments.client_id', clientData.id)
          .eq('matches.matchdays.categories.tournaments.id', trns.id)
          .in('event_type', ['YELLOW', 'RED'])
          .neq('fine_status', 'NONE') 
          .order('created_at', { ascending: false });

        if (error) {
          console.error("Error cargando tarjetas:", error);
          toast.error(`Error BD: ${error.message}`);
        }

        if (eventsData) setFines(normalizeDoubleCautions(eventsData as any));

        const proofsResult = await getFinePaymentProofs(slug, trns.id);
        if (proofsResult.success) setPaymentProofs(proofsResult.data);
      }
    }
    setLoading(false);
  }

  const handleApproveProof = async (proof: any) => {
    const toastId = toast.loading('Validando comprobante...');
    const result = await approveFinePaymentProof(slug, proof.id);
    if (!result.success) return toast.error(result.error, { id: toastId });
    toast.success('Pago validado. Jugador habilitado.', { id: toastId });
    loadData();
  };

  const handleViewProof = async (path: string) => {
    const result = await getFinePaymentProofUrl(slug, path);
    if (!result.success) return toast.error(result.error);
    setSelectedProofUrl(result.data.url);
  };

  const proofByEvent = paymentProofs.reduce((acc: Record<string, any>, proof: any) => { acc[proof.match_event_id] = proof; return acc; }, {});

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
  const finesToDisplay = activeTab === 'GLOBAL' ? filteredFines : groupedFines[activeTab];

  const totalUnpaidCount = filteredFines.filter(f => f.fine_status === 'UNPAID').length;
  const totalMoneyPending = filteredFines.filter(f => f.fine_status === 'UNPAID').reduce((sum, f) => {
    return sum + (f.event_type === 'RED' ? (tournamentSettings?.fine_red_amount || 0) : (tournamentSettings?.fine_yellow_amount || 0));
  }, 0);
  const totalMoneyCollected = filteredFines.filter(f => f.fine_status === 'PAID').reduce((sum, f) => {
    return sum + (f.event_type === 'RED' ? (tournamentSettings?.fine_red_amount || 0) : (tournamentSettings?.fine_yellow_amount || 0));
  }, 0);

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
            <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Comprobantes recibidos</p><h2 className="text-xl font-black uppercase text-slate-900">Validar pagos de jugadores</h2></div><span className="rounded-full bg-blue-600 px-3 py-1 text-[10px] font-black uppercase text-white">{paymentProofs.length} pendientes</span></div>
            {paymentProofs.length === 0 ? <p className="rounded-2xl border border-dashed border-blue-200 bg-white/70 p-4 text-xs font-bold uppercase tracking-wider text-slate-500">No hay comprobantes pendientes. Cuando un delegado cargue un baucher desde el perfil de su jugador, aparecerá aquí para revisarlo.</p> : <div className="grid gap-3 md:grid-cols-2">{paymentProofs.map((proof) => <div key={proof.id} className="flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-4"><div className="min-w-0"><p className="truncate text-sm font-black uppercase">#{proof.players?.shirt_number || '-'} {proof.players?.name}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{proof.original_filename}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => handleViewProof(proof.storage_path)} className="rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-50">Ver</button><button type="button" onClick={() => handleApproveProof(proof)} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700">Aceptar</button></div></div>)}</div>}
          </section>
          
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

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-100 text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] border-b border-slate-200">
                  <th className="p-6 pl-8">Estado</th>
                  <th className="p-6">Minuto / Hora</th>
                  <th className="p-6">Jugador Infractor</th>
                  <th className="p-6">Sanción</th>
                  <th className="p-6 text-right">Monto a Pagar</th>
                  <th className="p-6 text-right pr-8">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="p-12 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">Consultando Expedientes...</td></tr>
                ) : finesToDisplay.length === 0 ? (
                   <tr><td colSpan={6} className="p-12 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">No hay sanciones para esta selección</td></tr>
                ) : (
                  finesToDisplay.map((fine: any) => {
                    const isRed = fine.event_type === 'RED';
                    const isPaid = fine.fine_status === 'PAID';
                    const amount = isRed ? tournamentSettings?.fine_red_amount : tournamentSettings?.fine_yellow_amount;
                    
                    const dateObj = new Date(fine.created_at);

                    return (
                      <tr key={fine.id} className="hover:bg-slate-50 transition-colors group">
                        {/* ESTADO */}
                        <td className="p-6 pl-8">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full shadow-sm ${isPaid ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                              {isPaid ? 'Pagado' : 'Deuda Activa'}
                            </span>
                          </div>
                        </td>

                        {/* MINUTO DEL PARTIDO Y FECHA COMPLETA */}
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-500 shrink-0 border border-slate-200">
                              <Clock size={18}/>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-slate-800 tracking-tight">
                                Minuto {fine.minute_record}'
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                {dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).replace('.', '')} • {dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* JUGADOR Y EQUIPO */}
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-black text-slate-400 shrink-0 border border-slate-200 shadow-sm">
                              {fine.players?.shirt_number || '#'}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 uppercase tracking-tight text-sm flex items-center gap-2">
                                 {fine.players?.name}
                                 {!isPaid && <Flame size={14} className="text-red-500"/>}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{fine.players?.teams?.name}</span>
                            </div>
                          </div>
                        </td>

                        {/* TIPO DE SANCIÓN */}
                        <td className="p-6">
                           <div className="flex items-center gap-3">
                              <div className={`w-5 h-7 rounded-[4px] shadow-sm border border-black/10 ${isRed ? 'bg-red-500' : 'bg-yellow-400'}`}></div>
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                                 {isRed ? (fine.isDoubleCaution ? 'Roja por doble amonestación' : 'Roja directa') : 'Amonestación'}
                              </span>
                           </div>
                        </td>

                        {/* MONTO */}
                        <td className="p-6 text-center">
                           <span className={`text-lg font-black tracking-tighter ${isPaid ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                              {formatCopAmount(amount)}
                           </span>
                        </td>

                        {/* BOTÓN DE ACCIÓN */}
                        <td className="p-6 pr-8 text-center">
                           {isPaid ? (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                 <ShieldCheck size={14}/> Liberado
                              </span>
                           ) : (
                              proofByEvent[fine.id] ? <button type="button" onClick={async () => { setSelectedProof(proofByEvent[fine.id]); setSelectedProofUrl(''); await handleViewProof(proofByEvent[fine.id].storage_path); }} className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-center text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95"><Eye size={14}/> Ver comprobante</button> : <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400"><Clock size={14}/> Sin comprobante</span>
                           )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        {selectedProof && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setSelectedProof(null)}>
            <section role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Comprobante privado</p><h2 className="text-xl font-black uppercase">{selectedProof.players?.name}</h2></div><button type="button" onClick={() => setSelectedProof(null)} className="rounded-xl bg-slate-100 p-2" aria-label="Cerrar"><ArrowLeft size={18}/></button></div>
              {selectedProofUrl ? <iframe src={selectedProofUrl} title="Comprobante de pago" className="h-[55vh] w-full rounded-2xl border border-slate-200" /> : <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">Cargando comprobante…</div>}
              <button type="button" onClick={() => handleApproveProof(selectedProof)} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700"><CheckCircle2 size={16} className="mr-2 inline"/> Confirmar pago y habilitar jugador</button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
