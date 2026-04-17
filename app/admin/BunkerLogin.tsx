'use client';

import { useState } from 'react';
import { Lock, ShieldAlert, ArrowRight, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { verifyBunkerPassword } from './actions';
import { useRouter } from 'next/navigation';

export default function BunkerLogin() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Le enviamos la contraseña al servidor (actions.ts) en lugar de evaluarla aquí
    const isSuccess = await verifyBunkerPassword(password);

    if (isSuccess) {
      toast.success('Acceso Autorizado al Búnker Oficial');
      // Refrescamos la ruta para que el servidor detecte la nueva cookie y nos deje pasar
      router.refresh();
    } else {
      toast.error('Acceso Denegado. Contraseña incorrecta.');
      setPassword('');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden m-0 absolute inset-0 z-[9999]">
      
      {/* Luces de fondo del Búnker */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 p-10 rounded-[3rem] w-full max-w-md shadow-2xl relative z-10">
        
        <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-8 border border-slate-700 shadow-inner">
          <ShieldAlert size={32} className="text-red-500" />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-2">Búnker Admin</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">Acceso Restringido</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                <Lock size={18} className="text-slate-500" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="CONTRASEÑA DE OPERADOR"
                required
                autoFocus
                disabled={loading}
                className="w-full bg-slate-900 border border-slate-700 text-white pl-12 pr-4 py-4 rounded-2xl font-bold uppercase tracking-widest text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none placeholder:text-slate-600 disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] disabled:bg-blue-800 disabled:shadow-none"
          >
            {loading ? 'Verificando...' : <>Autorizar Acceso <ArrowRight size={16} /></>}
          </button>
        </form>
        
        <div className="mt-8 text-center flex items-center justify-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
          <ShieldCheck size={14} className="text-emerald-500" /> CSJB Championship Security
        </div>
      </div>
    </div>
  );
}