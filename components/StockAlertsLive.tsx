'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
type Supplier = { id: string; name: string };

const n = (v: string) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: 3 });
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : 'sin fecha');

/**
 * Alertas de stock mínimo en tiempo real. Escucha stock_alerts por Realtime
 * (filtrado por empresa y protegido por RLS) y recarga al instante.
 */
export function StockAlertsLive({ tenantId, suppliers, canReplenish }: { tenantId: string; suppliers: Supplier[]; canReplenish: boolean }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [supplierFor, setSupplierFor] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
        () => { load(); router.refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, load, router]);

  async function replenish(a: Alert) {
    const supplierId = supplierFor[a.id];
    if (a.warehouses.level === 'central' && !supplierId) {
      setMsg({ ok: false, text: 'Elige el proveedor para generar la orden de compra.' });
      return;
    }
    setBusy(a.id); setMsg(null);
    const res = await fetch(`/api/v1/${tenantId}/alerts/${a.id}/replenish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: supplierId || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: body.error ?? 'No se pudo crear la reposición.' }); return; }
    setMsg({ ok: true, text: `${body.kind === 'transfer' ? 'Traslado' : 'Orden de compra'} ${body.number} creado por ${n(String(body.quantity))} unidades.` });
    load(); router.refresh();
  }

  if (alerts === null) return <div className="empty">Cargando alertas…</div>;
  if (!alerts.length) {
    return <div className="empty"><h3>Todo el stock está por encima del mínimo</h3><p>Las alertas aparecerán aquí en cuanto un artículo cruce su umbral.</p></div>;
  }

  return (
    <>
      {msg && <div style={{ padding: '12px 18px 0' }}><div className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</div></div>}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr><th>Artículo</th><th>Almacén</th><th className="r">Stock</th><th className="r">Mínimo</th><th>Reposición</th><th /></tr>
          </thead>
          <tbody>
            {alerts.map((a) => {
              const doc = a.purchase_orders ?? a.transfer_orders;
              return (
                <tr key={a.id} className={a.status === 'open' ? 'row-low' : undefined}>
                  <td>{a.items.name}<span className="cell-sub code">{a.items.sku}</span></td>
                  <td>{a.warehouses.name}<span className="cell-sub">{a.warehouses.code}</span></td>
                  <td className="r">{n(a.qty_at_trigger)} {a.items.uom}</td>
                  <td className="r">{n(a.min_qty)}</td>
                  <td>
                    {doc
                      ? <><span className="badge badge-yellow">En curso</span><span className="cell-sub"><span className="code">{doc.number}</span>, llega {d(doc.est_delivery_date)}</span></>
                      : <span className="badge badge-low"><i aria-hidden="true" />Bajo mínimo</span>}
                  </td>
                  <td className="r">
                    {a.status === 'open' && canReplenish && (
                      <span className="inline-actions">
                        {a.warehouses.level === 'central' && (
                          <select className="select" style={{ height: 34, width: 170, fontSize: 14 }}
                            aria-label="Proveedor" value={supplierFor[a.id] ?? ''}
                            onChange={(e) => setSupplierFor((s) => ({ ...s, [a.id]: e.target.value }))}>
                            <option value="">Proveedor…</option>
                            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        )}
                        <button className="btn btn-primary btn-sm" disabled={busy === a.id} onClick={() => replenish(a)}>
                          {a.warehouses.level === 'central' ? 'Crear orden de compra' : 'Pedir traslado'}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
