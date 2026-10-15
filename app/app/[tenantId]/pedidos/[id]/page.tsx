import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COST_ROLES, getLinePrices, getTenantContext, fmtDate, fmtMoney, fmtQty, PO_STATUS, rows } from '@/lib/app';
import { PageHead, Panel, StatusBadge } from '@/components/ui';
import { SendOrderEmailButton } from '@/components/SendOrderEmailButton';
import { OrderStatusActions } from './OrderStatusActions';

export default async function OrderDetail({ params }: { params: Promise<{ tenantId: string; id: string }> }) {
  const { tenantId, id } = await params;
  const { supabase, can } = await getTenantContext(tenantId);

  const [poRes, settingsRes, receiptsRes] = await Promise.all([
    supabase.from('purchase_orders')
      .select(`id, number, status, est_dispatch_date, est_delivery_date, supplier_reference, notes, created_at,
               suppliers(name, email), warehouses(code, name),
               purchase_order_lines(id, qty_ordered, qty_received, est_dispatch_date, est_delivery_date, items(sku, name, uom))`)
      .eq('tenant_id', tenantId).eq('id', id).maybeSingle(),
    supabase.from('tenant_settings').select('notify_email').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('goods_receipts').select('id, number, received_at, supplier_invoice_number').eq('purchase_order_id', id).order('received_at'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = poRes.data as any;
  if (!o) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRes.data as any;
  const receipts = rows(receiptsRes.data);
  const prices = await getLinePrices(supabase, tenantId, can(...COST_ROLES), [id]);
  const price = (lineId: string) => prices?.get(lineId)?.price ?? 0;
  const total = (o.purchase_order_lines ?? []).reduce((a: number, l: any) => a + Number(l.qty_ordered) * price(l.id), 0);
  const canBuy = can('company_admin', 'supervisor', 'buyer');

  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: 14 }}><Link href={`/app/${tenantId}/pedidos`}>Órdenes de compra</Link></p>
      <PageHead
        title={`Orden ${o.number}`}
        lead={<>{o.suppliers?.name}, destino {o.warehouses?.name}. <StatusBadge map={PO_STATUS} value={o.status} /></>}
        actions={canBuy ? (
          <SendOrderEmailButton tenantId={tenantId} orderId={o.id} orderNumber={o.number}
            supplierEmail={o.suppliers?.email} notifyEmail={settings?.notify_email} />
        ) : undefined}
      />

      <div className="kpis">
        {prices && <div className="kpi"><div className="kpi-label">Importe</div><div className="kpi-value" style={{ fontSize: 26 }}>{fmtMoney(total)}</div></div>}
        <div className="kpi"><div className="kpi-label">Despacho estimado</div><div className="kpi-value" style={{ fontSize: 26 }}>{fmtDate(o.est_dispatch_date)}</div></div>
        <div className="kpi"><div className="kpi-label">Entrega estimada</div><div className="kpi-value" style={{ fontSize: 26 }}>{fmtDate(o.est_delivery_date)}</div></div>
        <div className="kpi"><div className="kpi-label">Ref. proveedor</div><div className="kpi-value" style={{ fontSize: 26 }}>{o.supplier_reference || '—'}</div></div>
      </div>

      {canBuy && <OrderStatusActions tenantId={tenantId} orderId={o.id} status={o.status} />}

      <Panel title="Líneas" flush>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Artículo</th><th className="r">Pedido</th><th className="r">Recibido</th><th className="r">Pendiente</th>{prices && <><th className="r">Precio</th><th className="r">Importe</th></>}<th>Despacho</th><th>Entrega</th></tr></thead>
            <tbody>
              {(o.purchase_order_lines ?? []).map((l: any) => {
                const pending = Math.max(Number(l.qty_ordered) - Number(l.qty_received), 0);
                return (
                  <tr key={l.id}>
                    <td>{l.items?.name}<span className="cell-sub code">{l.items?.sku}</span></td>
                    <td className="r">{fmtQty(l.qty_ordered)} {l.items?.uom}</td>
                    <td className="r">{fmtQty(l.qty_received)}</td>
                    <td className="r" style={{ fontWeight: pending ? 700 : 400 }}>{fmtQty(pending)}</td>
                    {prices && <>
                      <td className="r">{fmtMoney(price(l.id))}</td>
                      <td className="r">{fmtMoney(Number(l.qty_ordered) * price(l.id))}</td>
                    </>}
                    <td>{fmtDate(l.est_dispatch_date ?? o.est_dispatch_date)}</td>
                    <td>{fmtDate(l.est_delivery_date ?? o.est_delivery_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Recepciones" flush>
        {receipts.length ? (
          <table className="table">
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}><td className="code">{r.number}</td><td>{fmtDate(r.received_at)}</td><td>{r.supplier_invoice_number ? `Factura ${r.supplier_invoice_number}` : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Aún no se ha recibido mercancía de esta orden.</div>}
      </Panel>
    </>
  );
}
