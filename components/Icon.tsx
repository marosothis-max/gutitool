// Iconos de trazo propio (sin dependencias). 24×24, stroke = currentColor.
const PATHS: Record<string, string> = {
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  network: 'M12 3v5M12 8l-6 5M12 8l6 5M4 13h4v4H4zM16 13h4v4h-4zM10 3h4v5h-4zM6 17v4M18 17v4',
  stock: 'M3 21V7l9-4 9 4v14M3 11h18M3 16h18M8 21v-5M16 21v-5',
  orders: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
  receipt: 'M4 4h16v6H4zM6 10v10h12V10M10 14h4',
  transfer: 'M4 8h13l-3-3M20 16H7l3 3',
  returns: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  tools: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  movements: 'M4 6h16M4 12h10M4 18h6',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.9M16 4.1a3.5 3.5 0 010 6.8',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  location: 'M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  check: 'M5 12l5 5L20 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  building: 'M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

/** Marca: un bin de estantería con su franja de señalización. */
export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="6" fill="#FF5B14" />
      <rect x="7" y="8" width="18" height="14" rx="1.5" fill="none" stroke="#120600" strokeWidth="2.6" />
      <path d="M7 15h18" stroke="#120600" strokeWidth="2.6" />
      <path d="M7 25.5h18" stroke="#120600" strokeWidth="2.6" strokeDasharray="3 2" />
    </svg>
  );
}
