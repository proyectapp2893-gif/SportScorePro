import type { Metadata } from 'next';
import { Activity, Archive, CalendarDays, CheckCircle2, ClipboardList, Eye, FileSpreadsheet, Flag, LayoutDashboard, LockKeyhole, MonitorPlay, ShieldCheck, Smartphone, Trophy, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Demo privada | SportScore Pro',
  description: 'Recorrido privado y de solo lectura por SportScore Pro.',
  robots: { index: false, follow: false, nocache: true },
};

const modules = [
  { icon: LayoutDashboard, title: 'Administración integral', text: 'Torneos, deportes, categorías, colegios, delegaciones, permisos y configuración desde un panel central.', color: 'blue' },
  { icon: CalendarDays, title: 'Fixture inteligente', text: 'Cruces equilibrados, equipos impares, descansos rotativos, canchas, horarios, fases, grupos y finales.', color: 'violet' },
  { icon: Users, title: 'Portal de delegados', text: 'Inscripción autónoma, carga Excel, documentos privados, borradores recuperables y sincronización automática.', color: 'emerald' },
  { icon: Activity, title: 'Mesa de control', text: 'Alineaciones, goles, tarjetas, periodos, resultados oficiales y actualización del partido en tiempo real.', color: 'rose' },
  { icon: ClipboardList, title: 'Planillas oficiales', text: 'Planillas manuales imprimibles por partido, jornada y fase, con jugadores y espacios para incidencias.', color: 'amber' },
  { icon: Trophy, title: 'Resultados y estadísticas', text: 'Tabla de posiciones, goleadores, sanciones, historial, próximos partidos y portales públicos por equipo.', color: 'cyan' },
  { icon: Archive, title: 'Respaldos y reutilización', text: 'Exportación masiva de delegaciones y restauración de información para nuevas ediciones del torneo.', color: 'indigo' },
  { icon: ShieldCheck, title: 'Privacidad y auditoría', text: 'Separación por institución, documentos privados, permisos por rol y trazabilidad de operaciones sensibles.', color: 'slate' },
] as const;

const colorClasses: Record<string, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700', violet: 'border-violet-200 bg-violet-50 text-violet-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700', rose: 'border-rose-200 bg-rose-50 text-rose-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700', cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700', slate: 'border-slate-200 bg-slate-50 text-slate-700',
};

export default function PrivateDemoPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50/95 px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.18em] text-amber-800 backdrop-blur">
        Demo privada · datos simulados · ninguna acción modifica información real
      </div>

      <header className="relative overflow-hidden bg-slate-950 px-4 py-12 text-white sm:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,.28),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,.16),transparent_30%)]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-300"><LockKeyhole size={14} /> Recorrido exclusivo</div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-400">SportScore Pro</p>
              <h1 className="mt-3 text-4xl font-black uppercase tracking-tighter sm:text-6xl">Todo el torneo.<br /><span className="text-blue-500">Un solo sistema.</span></h1>
              <p className="mt-5 max-w-2xl text-sm font-semibold leading-relaxed text-slate-300 sm:text-base">Explora cómo la plataforma conecta organización, delegaciones, operación deportiva y publicación de resultados sin crear una cuenta.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[470px] lg:grid-cols-2">
              {[['9', 'Equipos'], ['36', 'Partidos'], ['198', 'Jugadores'], ['100%', 'Responsive']].map(([value, label]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"><p className="text-2xl font-black text-white">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p></div>)}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:py-12">
        <nav className="flex gap-2 overflow-x-auto pb-2">
          {['Resumen', 'Fixture', 'Delegados', 'Mesa de control', 'Resultados'].map((label) => <a key={label} href={`#${label.toLowerCase().replaceAll(' ', '-')}`} className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-700">{label}</a>)}
        </nav>

        <section id="resumen" className="scroll-mt-20">
          <div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Mapa de capacidades</p><h2 className="mt-1 text-2xl font-black uppercase tracking-tight sm:text-3xl">Una plataforma de extremo a extremo</h2></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{modules.map(({ icon: Icon, title, text, color }) => <article key={title} className={`rounded-2xl border p-5 shadow-sm ${colorClasses[color]}`}><Icon size={23} /><h3 className="mt-4 text-sm font-black uppercase">{title}</h3><p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">{text}</p></article>)}</div>
        </section>

        <section id="fixture" className="scroll-mt-20 overflow-hidden rounded-[2rem] border border-blue-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Fixture inteligente</p><h2 className="text-xl font-black uppercase">Jornada 1 · Fase de grupos</h2></div><span className="w-fit rounded-full bg-emerald-100 px-3 py-2 text-[9px] font-black uppercase text-emerald-700">Publicado</span></div>
          <div className="grid gap-4 p-4 lg:grid-cols-2 lg:p-6">
            {[['Sporting San José', 'La Banda', 'Cancha 1 · 2:00 p. m.'], ['Tercer Tiempo', 'San José United', 'Cancha 2 · 2:00 p. m.'], ['Arsenal', 'Tiburones', 'Cancha 1 · 4:00 p. m.'], ['Niupi', 'Real San José', 'Cancha 2 · 4:00 p. m.']].map(([home, away, slot]) => <div key={`${home}-${away}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-center text-[9px] font-black uppercase tracking-widest text-blue-600">{slot}</p><div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><p className="text-xs font-black uppercase">{home}</p><span className="rounded-lg bg-slate-950 px-3 py-2 text-[10px] font-black text-white">VS</span><p className="text-xs font-black uppercase">{away}</p></div></div>)}
            <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4 text-center lg:col-span-2"><p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Descansa esta jornada</p><p className="mt-1 text-sm font-black uppercase">Equipo Demo</p></div>
          </div>
        </section>

        <section id="delegados" className="scroll-mt-20 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-sm"><div className="border-b border-emerald-100 bg-emerald-50 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Portal de delegados</p><h2 className="text-xl font-black uppercase">Nómina oficial</h2></div><div className="divide-y divide-slate-100">{[['10', 'Manuel Ramírez', 'Completo'], ['7', 'Carlos Pérez', 'Completo'], ['22', 'Javier Torres', 'Falta documento']].map(([number, name, status]) => <div key={number} className={`grid grid-cols-[48px_1fr_auto] items-center gap-3 p-4 ${status === 'Completo' ? 'bg-emerald-50/60' : 'bg-red-50/60'}`}><span className="rounded-xl bg-white px-2 py-3 text-center text-xs font-black text-blue-700">#{number}</span><div><p className="text-xs font-black uppercase">{name}</p><p className="mt-1 text-[9px] font-bold uppercase text-slate-400">Identidad y fecha verificadas</p></div><span className={`text-[9px] font-black uppercase ${status === 'Completo' ? 'text-emerald-700' : 'text-red-600'}`}>{status}</span></div>)}</div></div>
          <div className="rounded-[2rem] border border-violet-200 bg-violet-50 p-5 shadow-sm"><Smartphone className="text-violet-600" size={26} /><h2 className="mt-4 text-xl font-black uppercase">Carga segura y recuperable</h2><ul className="mt-4 space-y-3">{['Plantilla Excel unificada', 'Borrador local con archivos', 'Sincronización automática por jugador', 'Validación de edad, identidad y dorsal', 'Modo maestro de edición'].map((item) => <li key={item} className="flex items-center gap-2 text-xs font-bold text-slate-700"><CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> {item}</li>)}</ul></div>
        </section>

        <section id="mesa-de-control" className="scroll-mt-20 rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Mesa de control</p><h2 className="text-2xl font-black uppercase">Sporting 2 – 1 La Banda</h2><p className="mt-1 text-xs font-bold text-slate-400">Segundo tiempo · 18:42</p></div><span className="flex w-fit items-center gap-2 rounded-full bg-red-500/15 px-4 py-2 text-[10px] font-black uppercase text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> En vivo</span></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Gol', '⚽'], ['Amarilla', '■'], ['Roja', '■'], ['Planilla', '▤']].map(([label, symbol], index) => <button key={label} type="button" className={`rounded-2xl border p-4 text-left ${index === 0 ? 'border-emerald-500/30 bg-emerald-500/10' : index === 1 ? 'border-amber-500/30 bg-amber-500/10' : index === 2 ? 'border-red-500/30 bg-red-500/10' : 'border-blue-500/30 bg-blue-500/10'}`}><span className="text-xl">{symbol}</span><p className="mt-2 text-[10px] font-black uppercase tracking-widest">{label}</p></button>)}</div></section>

        <section id="resultados" className="scroll-mt-20 grid gap-5 md:grid-cols-3"><div className="rounded-[2rem] border border-blue-200 bg-blue-50 p-5 md:col-span-2"><MonitorPlay className="text-blue-600" /><h2 className="mt-4 text-xl font-black uppercase">Portales públicos</h2><p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">Resultados oficiales, tabla de posiciones, calendario, goleadores, historial y página pública para cada equipo.</p></div><div className="rounded-[2rem] border border-slate-200 bg-white p-5"><Eye className="text-slate-700" /><h2 className="mt-4 text-xl font-black uppercase">Visibilidad controlada</h2><p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">El administrador decide cuándo publicar el fixture y la información del próximo rival.</p></div></section>

        <footer className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm"><Flag className="mx-auto text-blue-600" /><h2 className="mt-3 text-xl font-black uppercase">Fin del recorrido</h2><p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">Esta demostración es de solo lectura. Para una presentación guiada o acceso institucional, comparte este enlace únicamente con personas autorizadas.</p><div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500"><FileSpreadsheet size={14} /> Sin datos reales</div></footer>
      </div>
    </main>
  );
}
