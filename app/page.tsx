'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { loginCentralUser } from './login-actions';

export default function SportScoreMainLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const toastId = toast.loading('Verificando credenciales...');

    const result = await loginCentralUser(username, password);

    if (result.success) {
      if (result.isMaster) {
        // 🔐 MODO DIOS: Teletransporte directo al panel maestro
        toast.success('Modo Maestro Activado. Abriendo Bóveda Central...', { id: toastId, icon: '🔐' });
        router.push('/master');
      } else {
        // 🏫 MODO COLEGIO: Redirección normal al búnker del colegio
        toast.success(`Bienvenido a la red, ${result.name}`, { id: toastId });
        router.push(`/${result.slug}/admin`);
      }
    } else {
      toast.error(result.error || 'Acceso denegado', { id: toastId });
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col md:flex-row font-sans selection:bg-blue-500/30">
      
      {/* SECCIÓN IZQUIERDA: BRANDING CLARO Y LOGO GIGANTE */}
      <div className="hidden md:flex flex-[1.2] bg-white p-12 flex-col justify-center items-center relative overflow-hidden">
        
        {/* Patrón de cuadrícula de fondo estilo software */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-60"></div>
        
        <div className="relative z-10 w-full max-w-2xl px-8 flex flex-col items-center">
          {/* EL LOGO NUEVO EN HD */}
          <img 
            src="/sportscore.png" 
            alt="SportScore Pro Logo" 
            className="w-full h-auto object-contain drop-shadow-2xl"
          />
        </div>

        {/* Footer del área de branding */}
        <div className="absolute bottom-8 left-12 right-12 flex items-center justify-between gap-4 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] z-10">
          <span>Sistema Oficial Multi-Tenant</span>
          <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
          <span>Versión 4.1</span>
        </div>
      </div>

      {/* SECCIÓN DERECHA: LOGIN OSCURO (EL ACCESO AL BÚNKER) */}
      <div className="flex-[0.8] bg-slate-950 p-8 md:p-16 flex flex-col justify-center items-center relative shadow-[-20px_0_50px_rgba(0,0,0,0.3)] z-20">
        <div className="w-full max-w-md">
          
          {/* Logo visible solo en celulares */}
          <div className="md:hidden flex items-center justify-center mb-12">
            <img src="/sportscore.png" alt="SportScore" className="h-20 object-contain drop-shadow-lg" />
          </div>

          <div className="mb-12">
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Iniciar Sesión</h2>
            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Portal Central de Instituciones</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            
            <div className="space-y-2">
              <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Usuario Asignado</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <User size={18} className="text-slate-600 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ID de Institución"
                  required
                  disabled={loading}
                  className="w-full bg-slate-900 border border-slate-800 text-white pl-14 pr-4 py-4 rounded-2xl font-bold uppercase text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none placeholder:text-slate-700 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Contraseña de Operador</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <Lock size={18} className="text-slate-600 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  className="w-full bg-slate-900 border border-slate-800 text-white pl-14 pr-4 py-4 rounded-2xl font-black tracking-[0.2em] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none placeholder:text-slate-700 disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? 'Sincronizando Matriz...' : <>Acceder al Sistema <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="mt-12 text-center flex items-center justify-center gap-2 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em]">
            <ShieldCheck size={14} className="text-blue-600/60" /> 
            CONEXIÓN CIFRADA
          </div>

        </div>
      </div>
    </main>
  );
}
