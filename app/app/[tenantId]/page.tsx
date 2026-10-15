import Link from 'next/link';
import { getTenantContext, fmtDate, fmtDateTime, fmtQty, MOVE_ES, rows } from '@/lib/app';
import { StockAlertsLive } from '@/components/StockAlertsLive';
import { Empty, PageHead, Panel } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Panel' };

export default async function Dashboard({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase, tenant, profile, can } = await getTenantContext(tenantId);
  const t = tenantId;

  const [alerts, transit, openPo, tools, late, moves, suppliers, warehouses] = await Promise.all([
    supabase.from('stock_alerts').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('status', 'open'),
    supabase.from('transfer_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('status', 'in_transit'),
    supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', t)
      .in('status', ['sent', 'confirmed', 'partially_received']),
    supabase.from('tool_assets').select('id', { count: 'exact', head: true }).eq('tenant_id', t).eq('status', 'assigned'),
    supabase.from('v_order_tracking').select('kind, doc_id, number, sku, item_name, qty, qty_done, est_delivery_date, counterpart')
      .eq('tenant_id', t).eq('is_late', true).order('est_delivery_date').limit(8),
    supabase.from('v_movements_detail').select('id, created_at, movement_type, quantity, sku, item_name, uom, warehouse_code, location_code, doc_number')
      .eq('tenant_id', t).order('id', { ascending: false }).limit(8),
    supabase.from('suppliers').select('id, name').eq('tenant_id', t).eq('active', true).order('name'),
    supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('tenant_id', t),
  ]);

  const first = (profile?.full_name ?? '').split(' ')[0];
  const lateRows = rows(late.data);
  const moveRows = rows(moves.data);
  const isNew = (warehouses.count ?? 0) <= 1 && !moveRows.length;

  return (
    <>
      <PageHead
        title={first ? `Hola, ${first}` : 'Panel'}
        lead={`Estado del inventario de ${tenant.name}, actualizado en tiempo real.`}
        actions={<>
          <a className="btn btn-ghost btn-sm" href={`/api/v1/${t}/exports/stock.xlsx`}><Icon name="download" size={16} />Stock en Excel</a>
          <Link className="btn btn-primary btn-sm" href={`/app/${t}/red`}>Ver red de almacenes</Link>
        </>}
      />

      {isNew && (
        <div className="notice">
          Para empezar: crea tus almacenes intermedios y finales, sus ubicaciones y tu catálogo de artículos. Después
          podrás registrar la primera recepción. Tienes los pasos en el README del proyecto.
        </div>
      )}

      <div className="kpis">
        <Kpi href={`/app/${t}`} label="Artículos bajo mínimo" value={alerts.count ?? 0} alert={(alerts.count ?? 0) > 0} />
        <Kpi href={`/app/${t}/traslados`} label="Traslados en tránsito" value={transit.count ?? 0} />
        <Kpi href={`/app/${t}/pedidos`} label="Órdenes de compra abiertas" value={openPo.count ?? 0} />
        <Kpi href={`/app/${t}/herramientas`} label="Herramientas entregadas" value={tools.count ?? 0} />
      </div>

      <Panel title="Alertas de stock mínimo" flush>
        <StockAlertsLive tenantId={t} suppliers={rows(suppliers.data)} canReplenish={can('company_admin', 'supervisor', 'buyer', 'warehouse_keeper')} />
      </Panel>

      <div className="grid-2">
        <Panel title="Entregas con retraso" flush>
          {lateRows.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Documento</th><th>Artículo</th><th className="r">Pendiente</th><th>Entrega prevista</th></tr></thead>
                <tbody>
                  {lateRows.map((r) => (
                    <tr key={`${r.doc_id}-${r.sku}`}>
                      <td>
                        <Link className="code" href={r.kind === 'transfer' ? `/app/${t}/traslados` : `/app/${t}/pedidos/${r.doc_id}`}>{r.number}</Link>
                        <span className="cell-sub">{r.counterpart}</span>
                      </td>
                      <td>{r.item_name}</td>
                      <td className="r">{fmtQty(Number(r.qty) - Number(r.qty_done))}</td>
                      <td><span className="badge badge-red">{fmtDate(r.est_delivery_date)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Sin retrasos">Todos los pedidos y traslados en curso van en plazo.</Empty>}
        </Panel>

        <Panel title="Últimos movimientos" action={<Link href={`/app/${t}/movimientos`} style={{ fontSize: 14 }}>Ver todos</Link>} flush>
          {moveRows.length ? (
            <div className="table-scroll">
              <table className="table">
                <tbody>
                  {moveRows.map((m) => (
                    <tr key={m.id}>
                      <td>{MOVE_ES[m.movement_type] ?? m.movement_type}<span className="cell-sub">{fmtDateTime(m.created_at)}</span></td>
                      <td>{m.item_name}<span className="cell-sub code">{m.warehouse_code} {m.location_code}</span></td>
                      <td className="r" style={{ color: Number(m.quantity) < 0 ? 'var(--danger)' : 'var(--ok)', fontWeight: 600 }}>
                        {Number(m.quantity) > 0 ? '+' : ''}{fmtQty(m.quantity)} {m.uom}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Aún no hay movimientos">Aparecerán aquí las recepciones, consumos y traslados.</Empty>}
        </Panel>
      </div>
    </>
  );
}

function Kpi({ href, label, value, alert }: { href: string; label: string; value: number; alert?: boolean }) {
  return (
    <Link href={href} className={`kpi${alert ? ' is-alert' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value.toLocaleString('es-ES')}</div>
    </Link>
  );
}
