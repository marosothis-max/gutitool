import { getTenantContext, fmtDateTime, fmtQty, rows } from '@/lib/app';
import { Empty, PageHead, Panel } from '@/components/ui';
import { ReceiptForm } from './ReceiptForm';

export const metadata = { title: 'Entradas de material' };

export default async function ReceiptsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase, can } = await getTenantContext(tenantId);
  const canReceive = can('company_admin', 'supervisor', 'warehouse_keeper');

  const [rRes, wRes, lRes, iRes, sRes, pRes] = await Promise.all([
    supabase.from('goods_receipts')
      .select('id, number, received_at, supplier_invoice_number, warehouses(code), purchase_orders(number), suppliers(name), goods_receipt_lines(quantity, items(name, uom))')
      .eq('tenant_id', tenantId).order('received_at', { ascending: false }).limit(50),
    supabase.from('warehouses').select('id, code, name').eq('tenant_id', tenantId).eq('active', true).order('code'),
    supabase.from('locations').select('id, warehouse_id, code').eq('tenant_id', tenantId).eq('active', true).order('code').limit(20000),
    supabase.from('items').select('id, sku, name, uom').eq('tenant_id', tenantId).eq('active', true).order('sku').limit(5000),
    supabase.from('suppliers').select('id, name').eq('tenant_id', tenantId).eq('active', true).order('name'),
    supabase.from('purchase_orders')
      .select('id, number, warehouse_id, suppliers(name), purchase_order_lines(item_id, qty_ordered, qty_received)')
      .eq('tenant_id', tenantId).in('status', ['sent', 'confirmed', 'partially_received']).order('created_at', { ascending: false }),
  ]);
  const receipts = rows(rRes.data);

  return (
    <>
      <PageHead
        title="Entradas de material"
        lead="Registra la mercancía que llega, siempre contra una orden de compra o la factura del proveedor, y ubícala en su bin."
      />
      <div className="grid-2" style={{ gridTemplateColumns: canReceive ? 'minmax(0, 2fr) minmax(360px, 3fr)' : '1fr', alignItems: 'start' }}>
        <Panel title="Últimas entradas" flush>
          {receipts.length ? (
            <div className="table-scroll">
              <table className="table">
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="code">{r.number}</span>
                        <span className="cell-sub">{fmtDateTime(r.received_at)}, {r.warehouses?.code}</span>
                      </td>
                      <td>
                        {r.purchase_orders?.number ? <span className="code">{r.purchase_orders.number}</span> : `Factura ${r.supplier_invoice_number}`}
                        <span className="cell-sub">{r.suppliers?.name ?? ''}</span>
                      </td>
                      <td>
                        {(r.goods_receipt_lines ?? []).slice(0, 3).map((l: any, i: number) => (
                          <span key={i} className="cell-sub" style={{ color: 'var(--ink)' }}>{fmtQty(l.quantity)} {l.items?.uom} {l.items?.name}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Aún no hay entradas">La primera entrada aparecerá aquí.</Empty>}
        </Panel>

        {canReceive && (
          <Panel title="Nueva entrada">
            <ReceiptForm
              tenantId={tenantId}
              warehouses={rows(wRes.data).map((w) => ({ id: w.id, label: `${w.code}, ${w.name}` }))}
              locations={rows(lRes.data).map((l) => ({ id: l.id, warehouseId: l.warehouse_id, code: l.code }))}
              items={rows(iRes.data).map((i) => ({ id: i.id, label: `${i.sku}, ${i.name}`, uom: i.uom }))}
              suppliers={rows(sRes.data).map((s) => ({ id: s.id, name: s.name }))}
              orders={rows(pRes.data).map((p) => ({
                id: p.id, number: p.number, warehouseId: p.warehouse_id, supplier: p.suppliers?.name ?? '',
                lines: (p.purchase_order_lines ?? []).map((l: any) => ({ itemId: l.item_id, pending: Math.max(Number(l.qty_ordered) - Number(l.qty_received), 0) })),
              }))}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
