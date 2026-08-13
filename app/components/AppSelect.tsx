'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type AppSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type AppSelectProps = {
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
};

export default function AppSelect({
  value,
  options,
  onChange,
  placeholder = 'Seleccionar',
  className = '',
  compact = false,
  disabled = false,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 text-left font-black text-slate-900 outline-none transition-all hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60 ${compact ? 'px-3 py-2 text-[10px] uppercase tracking-widest' : 'px-4 py-3 text-sm'}`}
      >
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="truncate">{selected?.label || placeholder}</span>
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <>
          <button type="button" aria-label="Cerrar selector" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-[50dvh] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-300/40 sm:max-h-80">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => selectOption(option.value)}
                  className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black uppercase tracking-wide">{option.label}</span>
                    {option.description && <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">{option.description}</span>}
                  </span>
                  {active && <Check size={16} className="shrink-0 text-blue-600" />}
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                Sin opciones
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
