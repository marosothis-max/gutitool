import Link from 'next/link';
import { COST_ROLES, getLinePrices, getTenantContext, fmtDate, fmtMoney, isLate, PO_STATUS, rows } from '@/lib/app';
import { Empty, PageHead, Panel, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Órdenes de compra' };

const OPEN = ['draft', 'sent', 'confirmed', 'partially_received'];

export default async function OrdersPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ s?: string }> }) {
  const { tenantId } = await params;
  const { s = 'open' } = await searchParams;
  const { supabase, can } = await getTenantContext(tenantId);

  let query = supabase.from('purchase_orders')
    .select('id, number, status, est_dispatch_date, est_delivery_date, created_at, suppliers(name), warehouses(code, name), purchase_order_lines(id, qty_ordered, qty_received)')
    .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(300);
  if (s === 'open') query = query.in('status', OPEN);
  else if (s !== 'all') query = query.eq('status', s);
  const orders = rows((await query).data);
  const prices = await getLinePrices(supabase, tenantId, can(...COST_ROLES), orders.map((o) => o.id));

  const tabs: [string, string][] = [['open', 'Abiertas'], ['received', 'Recibidas'], ['cancelled', 'Canceladas'], ['all', 'Todas']];

  return (
    <>
      <PageHead
        title="Órdenes de compra"
        lead="Pedidos a proveedor con sus fechas estimadas de despacho y entrega. Las alertas del almacén central generan borradores aquí."
        actions={<a className="btn btn-ghost btn-sm" href={`/api/v1/${tenantId}/exports/orders.xlsx`}><Icon name="download" size={16} />Seguimiento en Excel</a>}
      />
      <Panel flush>
        <nav className="toolbar" aria-label="Estado">
          {tabs.map(([k, label]) => (
            <Link key={k} href={`?s=${k}`} className={`btn btn-sm ${s === k ? 'btn-primary' : 'btn-ghost'}`}
              aria-current={s === k ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        {orders.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Orden</th><th>Proveedor</th><th>Destino</th><th>Estado</th><th className="r">Recibido</th>{prices && <th className="r">Importe</th>}<th>Despacho</th><th>Entrega</th></tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const lines = o.purchase_order_lines ?? [];
                  const ordered = lines.reduce((a: number, l: any) => a + Number(l.qty_ordered), 0);
                  const received = lines.reduce((a: number, l: any) => a + Number(l.qty_received), 0);
                  const amount = lines.reduce((a: number, l: any) => a + Number(l.qty_ordered) * (prices?.get(l.id)?.price ?? 0), 0);
                  const late = OPEN.includes(o.status) && o.status !== 'draft' && isLate(o.est_delivery_date);
                  return (
                    <tr key={o.id}>
                      <td><Link className="code" href={`/app/${tenantId}/pedidos/${o.id}`}>{o.number}</Link>
                        <span className="cell-sub">{fmtDate(o.created_at)}</span></td>
                      <td>{o.suppliers?.name}</td>
                      <td>{o.warehouses?.code}</td>
                      <td><StatusBadge map={PO_STATUS} value={o.status} /></td>
                      <td className="r">{ordered ? `${Math.round((received / ordered) * 100)} %` : '—'}</td>
                      {prices && <td className="r">{fmtMoney(amount)}</td>}
                      <td>{fmtDate(o.est_dispatch_date)}</td>
                      <td>{late ? <span className="badge badge-red">{fmtDate(o.est_delivery_date)}</span> : fmtDate(o.est_delivery_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay órdenes en esta vista">
            Las órdenes se crean desde las alertas del almacén central o mediante la API de compras.
          </Empty>
        )}
      </Panel>
    </>
  );
}
