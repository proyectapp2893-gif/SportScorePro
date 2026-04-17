'use client';

import { ShieldCheck, Trophy, Medal, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans text-slate-900">
      
      {/* Luces de estadio de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-400/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-400/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="z-10 text-center max-w-4xl w-full flex flex-col items-center">
        
        {/* LOGO DEL COLEGIO ANFITRIÓN */}
        <div className="mx-auto w-40 h-40 md:w-56 md:h-56 bg-white border border-slate-200 rounded-full shadow-2xl flex items-center justify-center mb-8 overflow-hidden relative z-20">
          <img src="/logo.png" alt="Logo CSJB" className="w-full h-full object-contain p-4 md:p-6" />
        </div>

        {/* TÍTULO PRINCIPAL */}
        <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-slate-900 uppercase tracking-tighter leading-none italic mb-4 drop-shadow-sm">
          CSJB <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 inline-block pr-4 pb-2">
            Championship
          </span>
        </h1>
        
        <p className="text-slate-500 font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-xs sm:text-sm md:text-base mb-12 flex items-center justify-center gap-2 sm:gap-3">
          <Medal size={20} className="text-amber-500" /> Plataforma Oficial Multideporte <Medal size={20} className="text-amber-500" />
        </p>

        {/* ACCESO PRINCIPAL ÚNICO (GIGANTE) PARA EL PÚBLICO */}
        <Link 
          href="/fixture" 
          className="group relative flex items-center gap-6 bg-white border border-blue-200 p-4 pr-10 rounded-full hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-200 transition-all duration-300 active:scale-95"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-400/50 group-hover:scale-105 transition-transform">
            <Trophy size={32} className="text-white" />
          </div>
          <div className="text-left">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter mb-1">Portal Público</h2>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest flex items-center gap-2">
              Ingresar al Torneo <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform text-blue-600" />
            </p>
          </div>
        </Link>
        
      </div>

      {/* ACCESO ADMIN ESCONDIDO EN EL FOOTER */}
      <div className="absolute bottom-8 text-center w-full flex justify-center z-20">
        <Link 
          href="/admin" 
          className="flex items-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100"
        >
          <ShieldCheck size={14} /> 
        </Link>
      </div>

    </main>
  );
}