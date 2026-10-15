import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Archivo } from 'next/font/google';
import './globals.css';

// Archivo con eje de anchura: ancha para titulares, estrecha para datos.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Gutitool · Inventario industrial multialmacén', template: '%s · Gutitool' },
  description:
    'Control de stock para almacén central, intermedios y obras: ubicación exacta por bin, herramientas asignadas, alertas de mínimo, compras, devoluciones y trazabilidad.',
};

export const viewport: Viewport = { themeColor: '#131d26' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
