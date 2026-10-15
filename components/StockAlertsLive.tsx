'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Alert = {
  id: string;
  status: 'open' | 'in_replenishment' | 'resolved';
  qty_at_trigger: string;
  min_qty: string;
  items: { sku: string; name: string; uom: string };
  warehouses: { code: string; name: string; level: string };
  purchase_orders: { number: string; est_delivery_date: string | null } | null;
  transfer_orders: { number: string; est_delivery_date: string | null } | null;
};

/**
 * Panel de alertas visuales en tiempo real. Escucha cambios en stock_alerts
 * (Supabase Realtime, filtrado por tenant y protegido por RLS) y recarga.
 */
export function StockAlertsLive({ tenantId }: { tenantId: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/${tenantId}/alerts`);
    if (res.ok) setAlerts((await res.json()).data);
  }, [tenantId]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`alerts-${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'stock_alerts', filter: `tenant_id=eq.${tenantId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, load]);

  async function replenish(a: Alert) {
    let supplierId: string | undefined;
    if (a.warehouses.level === 'central') {
      supplierId = window.prompt('ID del proveedor para la orden de compra') ?? undefined;
      if (!supplierId) return;
    }
    setBusy(a.id);
    const res = await fetch(`/api/v1/${tenantId}/alerts/${a.id}/replenish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId }),
    });
    setBusy(null);
    const body = await res.json();
    if (!res.ok) alert(body.error);
    else load();
  }

  if (!alerts.length) return <p>✅ Sin artículos bajo mínimo.</p>;

  return (
    <table>
      <thead>
        <tr><th>Estado</th><th>Artículo</th><th>Almacén</th><th>Stock / Mín.</th><th>Reposición</th><th /></tr>
      </thead>
      <tbody>
        {alerts.map((a) => {
          const doc = a.purchase_orders ?? a.transfer_orders;
          return (
            <tr key={a.id} style={{ background: a.status === 'open' ? '#fef3f2' : '#fffaeb' }}>
              <td>{a.status === 'open' ? '🔴 Bajo mínimo' : '🟡 En reposición'}</td>
              <td>{a.items.sku} · {a.items.name}</td>
              <td>{a.warehouses.code} ({a.warehouses.level})</td>
              <td>{Number(a.qty_at_trigger)} / {Number(a.min_qty)} {a.items.uom}</td>
              <td>{doc ? `${doc.number} · entrega ${doc.est_delivery_date ?? 'sin fecha'}` : '—'}</td>
              <td>
                {a.status === 'open' && (
                  <button disabled={busy === a.id} onClick={() => replenish(a)}>
                    {a.warehouses.level === 'central' ? 'Crear orden de compra' : 'Pedir traslado'}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
