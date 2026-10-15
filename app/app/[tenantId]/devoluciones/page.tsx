import { getTenantContext, fmtDate, fmtQty, rows, RET_STATUS } from '@/lib/app';
import { Badge, Empty, PageHead, Panel, StatusBadge } from '@/components/ui';
import { ReturnForm } from './ReturnForm';

export const metadata = { title: 'Devoluciones' };

export default async function ReturnsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase } = await getTenantContext(tenantId);

  const [r1, r2, r3, r4] = await Promise.all([
    supabase.from('returns')
      .select('id, number, kind, status, reason, created_at, warehouses(code, name), suppliers(name), transfer_orders(number), return_lines(quantity, items(sku, name, uom), locations(code))')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200),
    supabase.from('v_stock_by_location').select('warehouse_id, warehouse_code, warehouse_level, location_id, location_code, item_id, sku, item_name, uom, qty_on_hand')
      .eq('tenant_id', tenantId).gt('qty_on_hand', 0).order('warehouse_code').order('location_code').limit(2000),
    supabase.from('suppliers').select('id, name').eq('tenant_id', tenantId).eq('active', true).order('name'),
    supabase.from('warehouses').select('id, code, name, level').eq('tenant_id', tenantId).eq('active', true).order('code'),
  ]);
  const list = rows(r1.data);

  return (
    <>
      <PageHead
        title="Devoluciones"
        lead="Cada devolución recibe un número correlativo propio. A proveedor saca el material del stock; a un almacén superior genera el traslado de vuelta."
      />
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' }}>
        <Panel title="Historial" flush>
          {list.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Documento</th><th>Destino</th><th>Material</th><th>Estado</th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td><span className="code">{r.number}</span><span className="cell-sub">{fmtDate(r.created_at)}, {r.warehouses?.code}</span></td>
                      <td>
                        {r.kind === 'to_supplier' ? <>Proveedor<span className="cell-sub">{r.suppliers?.name}</span></>
                          : <>Almacén superior<span className="cell-sub code">{r.transfer_orders?.number}</span></>}
                      </td>
                      <td>
                        {(r.return_lines ?? []).map((l: any, i: number) => (
                          <span key={i} className="cell-sub" style={{ color: 'var(--ink)' }}>
                            {fmtQty(l.quantity)} {l.items?.uom} {l.items?.name} <span className="code muted">{l.locations?.code}</span>
                          </span>
                        ))}
                        <span className="cell-sub">{r.reason}</span>
                      </td>
                      <td><StatusBadge map={RET_STATUS} value={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Aún no hay devoluciones">Registra la primera con el formulario.</Empty>}
        </Panel>

        <Panel title="Nueva devolución" action={<Badge tone="blue">Número automático</Badge>}>
          <ReturnForm tenantId={tenantId} stock={rows(r2.data)} suppliers={rows(r3.data)} warehouses={rows(r4.data)} />
        </Panel>
      </div>
    </>
  );
}
