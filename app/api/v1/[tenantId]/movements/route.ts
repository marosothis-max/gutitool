import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, pagination, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';

/**
 * GET /api/v1/{tenantId}/movements — ledger (kardex)
 * Filtros: warehouseId, itemId, type, from, to (ISO), page, pageSize
 */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const url = new URL(req.url);
  const q = url.searchParams;
  const { page, pageSize, from, to } = pagination(url);

  let query = supabase.from('v_movements_detail').select('*', { count: 'exact' })
    .eq('tenant_id', tenantId).order('id', { ascending: false }).range(from, to);
  if (q.get('warehouseId')) query = query.eq('warehouse_id', q.get('warehouseId')!);
  if (q.get('itemId')) query = query.eq('item_id', q.get('itemId')!);
  if (q.get('type')) query = query.eq('movement_type', q.get('type')!);
  if (q.get('from')) query = query.gte('created_at', q.get('from')!);
  if (q.get('to')) query = query.lte('created_at', q.get('to')!);

  const { data, error, count } = await query;
  if (error) unwrap({ data, error });
  return NextResponse.json({ data, page, pageSize, total: count });
});

const Body = z.discriminatedUnion('type', [
  // Consumo de consumible (salida a obra / OT)
  z.object({ type: z.literal('issue'), locationId: uuid, itemId: uuid, quantity: z.number().positive(),
             reference: z.string().max(200).optional() }),
  // Ajuste por inventario físico (solo admin/supervisor; lo valida la BD)
  z.object({ type: z.literal('adjustment'), locationId: uuid, itemId: uuid,
             delta: z.number().refine((n) => n !== 0, 'delta no puede ser 0'), reason: z.string().min(3) }),
]);

/** POST /api/v1/{tenantId}/movements — consumo o ajuste */
export const POST = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const b = await parseBody(req, Body);
  const id = b.type === 'issue'
    ? unwrap(await supabase.rpc('issue_consumable', {
        p_location_id: b.locationId, p_item_id: b.itemId, p_quantity: b.quantity, p_reference: b.reference ?? null }))
    : unwrap(await supabase.rpc('adjust_stock', {
        p_location_id: b.locationId, p_item_id: b.itemId, p_delta: b.delta, p_reason: b.reason }));
  return NextResponse.json({ movement_id: id }, { status: 201 });
});
