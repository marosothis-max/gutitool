import { ApiError, handler, requireTenant, unwrap } from '@/lib/api';
import { COST_ROLES, getItemCosts } from '@/lib/app';
import { buildWorkbook, fmt, xlsxResponse } from '@/lib/excel';

const LEVEL = { central: 'Central', intermediate: 'Intermedio', final: 'Final' } as Record<string, string>;
const MAX_ROWS = 50_000;

/**
 * GET /api/v1/{tenantId}/exports/{kind}.xlsx
 *   kind = stock      → stock por ubicación + red de almacenes (2 hojas)
 *        = movements  → kardex (filtros from, to, warehouseId, itemId)
 *        = orders     → seguimiento de OC y traslados con fechas estimadas
 */
export const GET = handler<{ tenantId: string; kind: string }>(async (req, { tenantId, kind }) => {
  const { supabase, roles } = await requireTenant(tenantId);
  const showCosts = roles.some((r) => COST_ROLES.includes(r));
  const q = new URL(req.url).searchParams;
  const k = kind.replace(/\.xlsx$/, '');
  const stamp = new Date().toISOString().slice(0, 10);

  if (k === 'stock') {
    let byLoc = supabase.from('v_stock_by_location').select('*').eq('tenant_id', tenantId)
      .gt('qty_on_hand', 0).order('warehouse_code').order('location_code').limit(MAX_ROWS);
    if (q.get('warehouseId')) byLoc = byLoc.eq('warehouse_id', q.get('warehouseId')!);
    const [locRes, netRes] = await Promise.all([
      byLoc,
      supabase.from('v_stock_network').select('*').eq('tenant_id', tenantId).order('sku').limit(MAX_ROWS),
    ]);
    const loc = unwrap(locRes) as any[];
    const costs = await getItemCosts(supabase, tenantId, showCosts);
    const net = unwrap(netRes) as any[];
    const buf = await buildWorkbook([
      {
        name: 'Stock por ubicación',
        columns: [
          { header: 'Almacén', key: 'warehouse_code' }, { header: 'Nivel', key: 'level' },
          { header: 'Pasillo', key: 'aisle', width: 9 }, { header: 'Estantería', key: 'rack', width: 11 },
          { header: 'Bin', key: 'bin', width: 8 }, { header: 'SKU', key: 'sku', width: 16 },
          { header: 'Artículo', key: 'item_name', width: 34 }, { header: 'Tipo', key: 'type' },
          { header: 'UdM', key: 'uom', width: 8 }, { header: 'Cantidad', key: 'qty_on_hand', numFmt: fmt.QTY },
          ...(showCosts ? [{ header: 'Coste unit.', key: 'unit_cost', numFmt: fmt.MONEY }, { header: 'Valor', key: 'stock_value', numFmt: fmt.MONEY }] : []),
        ],
        rows: (loc as any[]).map((r) => ({ ...r, level: LEVEL[r.warehouse_level],
          unit_cost: costs?.get(r.item_id) ?? null, stock_value: costs ? Number(r.qty_on_hand) * (costs.get(r.item_id) ?? 0) : null,
          type: r.item_type === 'tool' ? 'Herramienta' : 'Consumible' })),
      },
      {
        name: 'Red de almacenes',
        columns: [
          { header: 'SKU', key: 'sku', width: 16 }, { header: 'Artículo', key: 'item_name', width: 34 },
          { header: 'Almacén', key: 'warehouse_code' }, { header: 'Nivel', key: 'level' },
          { header: 'Stock', key: 'qty_on_hand', numFmt: fmt.QTY }, { header: 'En tránsito', key: 'qty_in_transit', numFmt: fmt.QTY },
          { header: 'Pedido', key: 'qty_on_order', numFmt: fmt.QTY }, { header: 'Mínimo', key: 'min_qty', numFmt: fmt.QTY },
          { header: 'Máximo', key: 'max_qty', numFmt: fmt.QTY }, { header: 'Bajo mínimo', key: 'below_min' },
        ],
        rows: (net as any[]).map((r) => ({ ...r, level: LEVEL[r.warehouse_level] })),
      },
    ]);
    return xlsxResponse(buf, `stock_${stamp}.xlsx`);
  }

  if (k === 'movements') {
    let query = supabase.from('v_movements_detail').select('*').eq('tenant_id', tenantId)
      .order('id', { ascending: true }).limit(MAX_ROWS);
    if (q.get('from')) query = query.gte('created_at', q.get('from')!);
    if (q.get('to')) query = query.lte('created_at', q.get('to')!);
    if (q.get('warehouseId')) query = query.eq('warehouse_id', q.get('warehouseId')!);
    if (q.get('itemId')) query = query.eq('item_id', q.get('itemId')!);
    const rows = unwrap(await query) as any[];
    const buf = await buildWorkbook([{
      name: 'Movimientos',
      columns: [
        { header: 'Fecha', key: 'created_at', numFmt: fmt.DATETIME, width: 18 }, { header: 'Tipo', key: 'movement_type', width: 15 },
        { header: 'Documento', key: 'doc_number', width: 18 }, { header: 'Almacén', key: 'warehouse_code' },
        { header: 'Ubicación', key: 'location_code' }, { header: 'SKU', key: 'sku', width: 16 },
        { header: 'Artículo', key: 'item_name', width: 34 }, { header: 'Cantidad', key: 'quantity', numFmt: fmt.QTY },
        { header: 'UdM', key: 'uom', width: 8 }, { header: 'Notas', key: 'notes', width: 30 },
        { header: 'Usuario', key: 'created_by_email', width: 26 },
      ],
      rows,
    }]);
    return xlsxResponse(buf, `movimientos_${stamp}.xlsx`);
  }

  if (k === 'orders') {
    const rows = unwrap(await supabase.from('v_order_tracking').select('*').eq('tenant_id', tenantId)
      .order('number').limit(MAX_ROWS)) as any[];
    const buf = await buildWorkbook([{
      name: 'Pedidos y traslados',
      columns: [
        { header: 'Documento', key: 'number', width: 18 }, { header: 'Tipo', key: 'kind_es' },
        { header: 'Estado', key: 'status', width: 18 }, { header: 'Proveedor / Origen', key: 'counterpart', width: 26 },
        { header: 'SKU', key: 'sku', width: 16 }, { header: 'Artículo', key: 'item_name', width: 34 },
        { header: 'Cantidad', key: 'qty', numFmt: fmt.QTY }, { header: 'Recibido', key: 'qty_done', numFmt: fmt.QTY },
        { header: 'Despacho est.', key: 'est_dispatch_date', numFmt: fmt.DATE },
        { header: 'Entrega est.', key: 'est_delivery_date', numFmt: fmt.DATE },
        { header: 'Retrasado', key: 'is_late' },
      ],
      rows: rows.map((r) => ({ ...r, kind_es: r.kind === 'transfer' ? 'Traslado' : 'Orden de compra' })),
    }]);
    return xlsxResponse(buf, `pedidos_${stamp}.xlsx`);
  }

  throw new ApiError(404, 'Exportación desconocida: use stock, movements u orders');
});
