import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, parseBody, requireSuperAdmin, unwrap } from '@/lib/api';
import { PLANS } from '@/lib/plans';

const Body = z.object({
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
  name: z.string().min(2).max(120).optional(),
  taxId: z.string().max(30).nullable().optional(),
  plan: z.enum(PLANS).optional(),
  /** null = sin límite. Si se reduce por debajo de los usuarios actuales, no se da de baja a nadie:
   *  simplemente no se podrán añadir más hasta bajar del límite. */
  maxUsers: z.number().int().positive().nullable().optional(),
});

/**
 * PATCH /api/v1/admin/tenants/{id} — Super Admin: suspender / reactivar / cambiar plan y límite.
 * Una empresa suspendida pierde el acceso al instante (lo aplica el RLS).
 */
export const PATCH = handler<{ id: string }>(async (req, { id }) => {
  const { supabase } = await requireSuperAdmin();
  const b = await parseBody(req, Body);
  const patch: Record<string, unknown> = {};
  if (b.status) {
    patch.status = b.status;
    patch.suspended_at = b.status === 'active' ? null : new Date().toISOString();
  }
  if (b.name) patch.name = b.name;
  if (b.taxId !== undefined) patch.tax_id = b.taxId;
  if (b.plan) patch.plan = b.plan;
  if (b.maxUsers !== undefined) patch.max_users = b.maxUsers;
  const data = unwrap(await supabase.from('tenants').update(patch).eq('id', id).select().single());
  return NextResponse.json({ data });
});
