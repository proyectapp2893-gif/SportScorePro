'use client';

import { useState } from 'react';
import { ShieldCheck, Lock, User, KeyRound, ArrowRight } from 'lucide-react';
import { authenticateMaster } from './actions';
import toast from 'react-hot-toast';

export default function MasterLogin() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const result = await authenticateMaster(formData);

    if (result.success) {
      toast.success('Acceso Autorizado. Bienvenido Maestro.');
      // Recargamos la página para que el layout detecte la cookie y nos deje pasar
      window.location.reload(); 
    } else {
      toast.error(result.error || 'Acceso denegado.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* EFECTOS DE FONDO TIPO BÓVEDA */}
      <div className="absolute top-0 left-0 w-full h-full bg-[url('/bg-pattern.png')] opacity-5 bg-cover pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none z-0"></div>

      <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 md:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-500">
        
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-20 h-20 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
            <ShieldCheck size={40} className="text-blue-500" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Control Maestro</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em]">Acceso Restringido Nivel 1</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-2">
              <User size={12} /> Usuario
            </label>
            <div className="relative">
              <input 
                type="text" 
                name="username"
                required
                autoComplete="off"
                className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-2xl px-5 py-4 font-medium text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                placeholder="ID de Administrador"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-2">
              <Lock size={12} /> Contraseña de Seguridad
            </label>
            <div className="relative">
              <input 
                type="password" 
                name="password"
                required
                className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-2xl px-5 py-4 font-medium text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-4 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verificando...' : (
              <>Ingresar al Sistema <KeyRound size={16}/></>
            )}
          </button>

        </form>
        
        <div className="mt-8 text-center border-t border-slate-800 pt-6">
           <p className="text-slate-600 text-[8px] font-bold uppercase tracking-[0.3em]">SportScore Pro Platform</p>
        </div>
      </div>
    </div>
  );
}