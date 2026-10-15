import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Saira } from 'next/font/google';
import './globals.css';

// Saira con eje de anchura: estrecha y gruesa para rótulos industriales, normal para texto.
const saira = Saira({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Gutitool · Inventario industrial multialmacén', template: '%s · Gutitool' },
  description:
    'Control de stock para almacén central, intermedios y obras: ubicación exacta por bin, herramientas asignadas, alertas de mínimo, compras, devoluciones y trazabilidad.',
};

export const viewport: Viewport = { themeColor: '#050506' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={saira.variable}>
      <body>{children}</body>
    </html>
  );
}
