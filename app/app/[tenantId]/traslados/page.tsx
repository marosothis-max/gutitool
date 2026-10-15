import Link from 'next/link';
import { getTenantContext, fmtDate, fmtDateTime, fmtQty, isLate, rows, TRF_STATUS } from '@/lib/app';
import { Badge, Empty, PageHead, Panel, StatusBadge } from '@/components/ui';
import { TransferActions } from './TransferActions';

export const metadata = { title: 'Traslados' };

const OPEN = ['requested', 'approved', 'in_transit'];

export default async function TransfersPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ s?: string }> }) {
  const { tenantId } = await params;
  const { s = 'open' } = await searchParams;
  const { supabase, can } = await getTenantContext(tenantId);

  let query = supabase.from('transfer_orders')
    .select(`id, number, status, from_warehouse_id, to_warehouse_id, est_dispatch_date, est_delivery_date, dispatched_at, received_at, has_discrepancy, notes,
             from:warehouses!transfer_orders_tenant_id_from_warehouse_id_fkey(code, name),
             to:warehouses!transfer_orders_tenant_id_to_warehouse_id_fkey(code, name),
             transfer_order_lines(id, qty_requested, qty_dispatched, qty_received, items(sku, name, uom))`)
    .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200);
  query = s === 'open' ? query.in('status', OPEN) : s === 'all' ? query : query.eq('status', s);

  const [trfRes, locRes] = await Promise.all([
    query,
    supabase.from('locations').select('id, warehouse_id, code').eq('tenant_id', tenantId).eq('active', true).order('code'),
  ]);
  const locsByWh: Record<string, { id: string; code: string }[]> = {};
  for (const l of rows(locRes.data)) (locsByWh[l.warehouse_id] ??= []).push({ id: l.id, code: l.code });
  const transfers = rows(trfRes.data);

  const tabs: [string, string][] = [['open', 'En curso'], ['received', 'Recibidos'], ['all', 'Todos']];
  const isManager = can('company_admin', 'supervisor');

  return (
    <>
      <PageHead
        title="Traslados"
        lead="Movimiento de material entre el central, los intermedios y los almacenes finales, con fechas de despacho y entrega."
      />
      <Panel flush>
        <nav className="toolbar" aria-label="Estado">
          {tabs.map(([k, label]) => (
            <Link key={k} href={`?s=${k}`} className={`btn btn-sm ${s === k ? 'btn-primary' : 'btn-ghost'}`}
              aria-current={s === k ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        {transfers.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Traslado</th><th>Ruta</th><th>Material</th><th>Estado</th><th>Despacho</th><th>Entrega</th><th /></tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const lines = t.transfer_order_lines ?? [];
                  const late = OPEN.includes(t.status) && isLate(t.est_delivery_date);
                  return (
                    <tr key={t.id}>
                      <td><span className="code">{t.number}</span>{t.notes && <span className="cell-sub">{t.notes}</span>}</td>
                      <td>{t.from?.code} a {t.to?.code}<span className="cell-sub">{t.from?.name} a {t.to?.name}</span></td>
                      <td>
                        {lines.slice(0, 3).map((l: any) => (
                          <span key={l.id} className="cell-sub" style={{ color: 'var(--ink)' }}>
                            {fmtQty(t.status === 'received' ? l.qty_received : l.qty_dispatched || l.qty_requested)} {l.items?.uom} {l.items?.name}
                          </span>
                        ))}
                        {lines.length > 3 && <span className="cell-sub">y {lines.length - 3} más</span>}
                      </td>
                      <td>
                        <StatusBadge map={TRF_STATUS} value={t.status} />
                        {t.has_discrepancy && <span className="cell-sub"><Badge tone="red">Con diferencias</Badge></span>}
                      </td>
                      <td>{t.dispatched_at ? fmtDateTime(t.dispatched_at) : fmtDate(t.est_dispatch_date)}</td>
                      <td>{t.received_at ? fmtDateTime(t.received_at)
                        : late ? <span className="badge badge-red">{fmtDate(t.est_delivery_date)}</span> : fmtDate(t.est_delivery_date)}</td>
                      <td className="r">
                        <TransferActions
                          tenantId={tenantId} id={t.id} status={t.status} canApprove={isManager}
                          destLocations={locsByWh[t.to_warehouse_id] ?? []}
                          lineIds={lines.filter((l: any) => Number(l.qty_dispatched) > 0).map((l: any) => l.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay traslados en esta vista">
            Los traslados se generan al pedir reposición desde una alerta, o al devolver material a un almacén superior.
          </Empty>
        )}
      </Panel>
    </>
  );
}
