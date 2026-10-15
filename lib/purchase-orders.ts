import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, unwrap } from './api';
import { buildWorkbook, fmt } from './excel';

export type PurchaseOrderDetail = {
  id: string;
  number: string;
  status: string;
  est_dispatch_date: string | null;
  est_delivery_date: string | null;
  supplier_reference: string | null;
  notes: string | null;
  created_at: string;
  suppliers: { name: string; email: string | null; tax_id: string | null };
  warehouses: { code: string; name: string };
  purchase_order_lines: {
    qty_ordered: string;
    qty_received: string;
    unit_price: string;
    est_dispatch_date: string | null;
    est_delivery_date: string | null;
    items: { sku: string; name: string; uom: string; item_type: string };
  }[];
};

const STATUS_ES: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviada', confirmed: 'Confirmada',
  partially_received: 'Recibida parcialmente', received: 'Recibida', cancelled: 'Cancelada',
};

export async function loadPurchaseOrder(supabase: SupabaseClient, tenantId: string, id: string) {
  const po = unwrap(
    await supabase
      .from('purchase_orders')
      .select(`id, number, status, est_dispatch_date, est_delivery_date, supplier_reference, notes, created_at,
               suppliers(name, email, tax_id), warehouses(code, name),
               purchase_order_lines(qty_ordered, qty_received, unit_price, est_dispatch_date, est_delivery_date,
                                    items(sku, name, uom, item_type))`)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle(),
  ) as unknown as PurchaseOrderDetail | null;
  if (!po) throw new ApiError(404, 'Orden de compra no encontrada');
  return po;
}

function lineRows(po: PurchaseOrderDetail) {
  return po.purchase_order_lines.map((l) => ({
    sku: l.items.sku,
    name: l.items.name,
    type: l.items.item_type === 'tool' ? 'Herramienta' : 'Consumible',
    uom: l.items.uom,
    qty_ordered: l.qty_ordered,
    qty_received: l.qty_received,
    qty_pending: Math.max(Number(l.qty_ordered) - Number(l.qty_received), 0),
    unit_price: l.unit_price,
    total: Number(l.qty_ordered) * Number(l.unit_price),
    est_dispatch: l.est_dispatch_date ?? po.est_dispatch_date,
    est_delivery: l.est_delivery_date ?? po.est_delivery_date,
  }));
}

export function poTotal(po: PurchaseOrderDetail) {
  return po.purchase_order_lines.reduce((s, l) => s + Number(l.qty_ordered) * Number(l.unit_price), 0);
}

export function buildPurchaseOrderWorkbook(po: PurchaseOrderDetail) {
  return buildWorkbook([
    {
      name: po.number,
      meta: [
        ['Orden de compra', po.number],
        ['Estado', STATUS_ES[po.status] ?? po.status],
        ['Proveedor', po.suppliers.name],
        ['Almacén destino', `${po.warehouses.code} · ${po.warehouses.name}`],
        ['Despacho estimado', po.est_dispatch_date],
        ['Entrega estimada', po.est_delivery_date],
        ['Total', poTotal(po).toFixed(2) + ' €'],
      ],
      columns: [
        { header: 'SKU', key: 'sku', width: 16 },
        { header: 'Artículo', key: 'name', width: 36 },
        { header: 'Tipo', key: 'type' },
        { header: 'UdM', key: 'uom', width: 8 },
        { header: 'Pedido', key: 'qty_ordered', numFmt: fmt.QTY },
        { header: 'Recibido', key: 'qty_received', numFmt: fmt.QTY },
        { header: 'Pendiente', key: 'qty_pending', numFmt: fmt.QTY },
        { header: 'Precio', key: 'unit_price', numFmt: fmt.MONEY },
        { header: 'Importe', key: 'total', numFmt: fmt.MONEY },
        { header: 'Despacho est.', key: 'est_dispatch', numFmt: fmt.DATE },
        { header: 'Entrega est.', key: 'est_delivery', numFmt: fmt.DATE },
      ],
      rows: lineRows(po),
    },
  ]);
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-ES') : '—');

export function renderPurchaseOrderEmail(po: PurchaseOrderDetail, tenantName: string, message?: string) {
  const rows = lineRows(po)
    .map((r) => `<tr><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td align="right">${esc(r.qty_ordered)} ${esc(r.uom)}</td>
      <td align="right">${Number(r.unit_price).toFixed(2)} €</td><td align="right">${r.total.toFixed(2)} €</td>
      <td>${d(r.est_dispatch)}</td><td>${d(r.est_delivery)}</td></tr>`)
    .join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1b2430">
  <h2 style="margin:0 0 4px">${esc(tenantName)} · Orden de compra ${esc(po.number)}</h2>
  <p style="margin:0 0 16px;color:#555">Estado: ${esc(STATUS_ES[po.status] ?? po.status)} ·
     Proveedor: ${esc(po.suppliers.name)} · Destino: ${esc(po.warehouses.name)}</p>
  ${message ? `<p>${esc(message)}</p>` : ''}
  <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#d0d7de;font-size:13px">
    <thead style="background:#1f3a5f;color:#fff"><tr><th>SKU</th><th>Artículo</th><th>Cantidad</th><th>Precio</th>
      <th>Importe</th><th>Despacho est.</th><th>Entrega est.</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4" align="right"><b>Total</b></td><td align="right"><b>${poTotal(po).toFixed(2)} €</b></td><td colspan="2"></td></tr></tfoot>
  </table>
  <p style="color:#888;font-size:12px">Se adjunta el detalle en Excel.</p>
  </body></html>`;
}
