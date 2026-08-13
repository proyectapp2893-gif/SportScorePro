'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, QrCode } from 'lucide-react';
import QRCode from 'qrcode';

type PublicQrCardProps = {
  path: string;
  title: string;
  fileName: string;
};

export default function PublicQrCard({ path, title, fileName }: PublicQrCardProps) {
  const [qrImage, setQrImage] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const url = new URL(path, window.location.origin).toString();
    QRCode.toDataURL(url, { width: 420, margin: 2, color: { dark: '#020617', light: '#ffffff' } })
      .then(setQrImage)
      .catch(() => setQrImage(''));
  }, [path]);

  async function copyLink() {
    await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="rounded-[2rem] border border-cyan-100 bg-cyan-50/50 p-5">
      <div className="flex items-center gap-2 text-cyan-700">
        <QrCode size={18} />
        <h2 className="text-lg font-black uppercase">{title}</h2>
      </div>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-white p-2 shadow-sm">
          {qrImage ? <img src={qrImage} alt={`Código QR de ${title}`} className="h-full w-full" /> : <QrCode className="text-slate-300" size={72} />}
        </div>
        <div className="flex w-full flex-col gap-2">
          <p className="text-xs font-semibold leading-relaxed text-slate-600">Escanea el código o copia el enlace para abrir esta información pública.</p>
          <button type="button" onClick={copyLink} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white">
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Enlace copiado' : 'Copiar enlace'}
          </button>
          {qrImage && <a href={qrImage} download={`${fileName}.png`} className="flex items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-cyan-700"><Download size={15} /> Descargar QR</a>}
        </div>
      </div>
    </section>
  );
}
