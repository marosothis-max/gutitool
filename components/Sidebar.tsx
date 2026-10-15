'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BrandMark, Icon } from './Icon';

type Item = { href: string; label: string; icon: string; badge?: number };

export function Shell({
  tenantId, tenantName, roleLabel, email, alerts, isSuperAdmin, children,
}: {
  tenantId: string; tenantName: string; roleLabel: string; email: string; alerts: number; isSuperAdmin: boolean; children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const base = `/app/${tenantId}`;

  const groups: { title: string; items: Item[] }[] = [
    { title: 'Control', items: [
      { href: base, label: 'Panel', icon: 'dashboard', badge: alerts },
      { href: `${base}/red`, label: 'Red de almacenes', icon: 'network' },
      { href: `${base}/stock`, label: 'Stock por ubicación', icon: 'location' },
      { href: `${base}/movimientos`, label: 'Movimientos', icon: 'movements' },
    ] },
    { title: 'Logística', items: [
      { href: `${base}/pedidos`, label: 'Órdenes de compra', icon: 'orders' },
      { href: `${base}/traslados`, label: 'Traslados', icon: 'transfer' },
      { href: `${base}/devoluciones`, label: 'Devoluciones', icon: 'returns' },
      { href: `${base}/herramientas`, label: 'Herramientas', icon: 'tools' },
    ] },
  ];

  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));

  return (
    <div className="shell">
      <div className="mobile-bar">
        <Link href={base} className="brand"><BrandMark />Gutitool</Link>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="sidebar">
          {open ? 'Cerrar' : 'Menú'}
        </button>
      </div>

      <aside className="sidebar" id="sidebar" data-open={open}>
        <Link href={base} className="brand"><BrandMark />Gutitool</Link>
        <div className="tenant-name">{tenantName}<small>{roleLabel}</small></div>
        <nav className="nav" aria-label="Secciones">
          {groups.map((g) => (
            <div key={g.title} style={{ display: 'contents' }}>
              <div className="nav-group">{g.title}</div>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} aria-current={isActive(it.href) ? 'page' : undefined}
                  onClick={() => setOpen(false)}>
                  <Icon name={it.icon} />{it.label}
                  {!!it.badge && <span className="nav-badge" aria-label={`${it.badge} alertas`}>{it.badge}</span>}
                </Link>
              ))}
            </div>
          ))}
          {isSuperAdmin && (
            <>
              <div className="nav-group">Plataforma</div>
              <Link href="/app/admin" aria-current={pathname.startsWith('/app/admin') ? 'page' : undefined}>
                <Icon name="building" />Empresas
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="who">{email}</div>
          <button onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
