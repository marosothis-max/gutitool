import type { ReactNode } from 'react';

export const metadata = { title: 'Gutitool · Inventario industrial', description: 'Gestión de inventario multialmacén' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 24 }}>{children}</body>
    </html>
  );
}
