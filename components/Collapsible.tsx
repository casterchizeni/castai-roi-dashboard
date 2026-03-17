'use client';

import { useState } from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Colored dot before title */
  color?: string;
  /** Extra class on the outer wrapper */
  className?: string;
}

const DOT_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  indigo: 'bg-indigo-500',
  gray: 'bg-gray-400',
  slate: 'bg-slate-500',
  teal: 'bg-teal-500',
};

export default function Collapsible({
  title,
  children,
  defaultOpen = true,
  color,
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 group cursor-pointer"
      >
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          {color && (
            <span className={`w-1 h-5 rounded-full ${DOT_COLORS[color] ?? DOT_COLORS.gray}`} />
          )}
          {title}
        </h2>
        <span
          className={`text-gray-400 group-hover:text-gray-600 transition-transform duration-200 text-sm select-none ${
            open ? 'rotate-0' : '-rotate-90'
          }`}
        >
          ▼
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? 'mt-3 max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </section>
  );
}
