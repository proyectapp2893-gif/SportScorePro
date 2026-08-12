'use client';

import { useState } from 'react';
import { Lock, ShieldAlert, ArrowRight, ShieldCheck, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { authorizeClientAccess } from './actions';
import { useParams } from 'next/navigation';

export default function BunkerLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const params = useParams();
  const slug = params.slug as string; 
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Enviamos el usuario, la contraseña y el slug a la acción
    const result = await authorizeClientAccess(username, password, slug);

    if (result.success) {
      if (result.isMaster) {
        // TRAMPA MODO DIOS ACTIVADA
        toast.success('Modo Maestro Activado. Abriendo Bóveda...', { icon: '🔐' });
        window.location.href = '/master';
      } else {
        // INGRESO NORMAL DEL COLEGIO
        toast.success(`Acceso Autorizado. Bienvenido, ${result.client?.name || 'al sistema'}.`);
        window.location.reload(); 
      }
    } else {
      toast.error(result.error || 'Acceso Denegado. Credenciales incorrectas.');
      setPassword('');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden m-0 absolute inset-0 z-[9999]">
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none"></div>

      <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-800 p-6 sm:p-8 md:p-10 rounded-[2rem] sm:rounded-[3rem] w-full max-w-md shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="w-20 h-20 bg-slate-950 rounded-full flex items-center justify-center mx-auto mb-8 border border-slate-800 shadow-inner">
          <ShieldAlert size={32} className="text-blue-500" />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-widest mb-2">Portal Admin</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">Acceso Restringido</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* CAMPO DE USUARIO */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
              <User size={18} className="text-slate-600 group-focus-within:text-blue-500 transition-colors" />
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ID DE INSTITUCIÓN"
              required
              autoFocus
              disabled={loading}
              className="w-full bg-slate-950 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-2xl font-bold text-center tracking-[0.2em] uppercase text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none placeholder:text-slate-700 disabled:opacity-50 focus:shadow-[0_0_15px_rgba(37,99,235,0.2)]"
            />
          </div>

          {/* CAMPO DE CONTRASEÑA */}
          <div className="relative group pb-2">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
              <Lock size={18} className="text-slate-600 group-focus-within:text-blue-500 transition-colors" />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="CÓDIGO DE OPERADOR"
              required
              disabled={loading}
              className="w-full bg-slate-950 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-2xl font-bold text-center tracking-[0.3em] uppercase text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none placeholder:text-slate-700 disabled:opacity-50 focus:shadow-[0_0_15px_rgba(37,99,235,0.2)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] disabled:bg-blue-900 disabled:text-blue-400 disabled:shadow-none active:scale-[0.98]"
          >
            {loading ? 'Validando acceso...' : <>Autorizar Acceso <ArrowRight size={16} /></>}
          </button>
        </form>
        
        <div className="mt-10 text-center flex items-center justify-center gap-2 text-slate-600 text-[9px] font-black uppercase tracking-[0.2em]">
          <ShieldCheck size={14} className="text-emerald-600" /> 
          SISTEMA PROTEGIDO • {slug || 'SportScore'}
        </div>
      </div>
    </div>
  );
}
