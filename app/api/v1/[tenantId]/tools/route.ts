import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, isoDate, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';

/** GET /api/v1/{tenantId}/tools?status=assigned&overdue=true — herramientas y su asignación abierta */
export const GET = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const q = new URL(req.url).searchParams;
  let query = supabase.from('v_tool_status').select('*').eq('tenant_id', tenantId).order('serial_number');
  if (q.get('status')) query = query.eq('status', q.get('status')!);
  if (q.get('warehouseId')) query = query.eq('warehouse_id', q.get('warehouseId')!);
  if (q.get('overdue') === 'true') query = query.eq('is_overdue', true);
  return NextResponse.json({ data: unwrap(await query) });
});

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('checkout'),
    assetId: uuid,
    assignedToName: z.string().min(2).max(120),   // operario, cuadrilla u orden de trabajo
    assignedToUser: uuid.optional(),
    dueAt: isoDate.optional(),
    condition: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('checkin'),
    assignmentId: uuid,
    locationId: uuid,
    condition: z.string().max(200).optional(),
    toMaintenance: z.boolean().default(false),
  }),
]);

/** POST /api/v1/{tenantId}/tools — entrega (checkout) o devolución (checkin) de una herramienta */
export const POST = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const b = await parseBody(req, Body);
  if (b.action === 'checkout') {
    const assignmentId = unwrap(await supabase.rpc('checkout_tool', {
      p_asset_id: b.assetId, p_assigned_to_name: b.assignedToName, p_assigned_to_user: b.assignedToUser ?? null,
      p_due_at: b.dueAt ?? null, p_condition: b.condition ?? null,
    }));
    return NextResponse.json({ assignmentId }, { status: 201 });
  }
  unwrap(await supabase.rpc('checkin_tool', {
    p_assignment_id: b.assignmentId, p_location_id: b.locationId,
    p_condition: b.condition ?? null, p_to_maintenance: b.toMaintenance,
  }));
  return NextResponse.json({ ok: true });
});
