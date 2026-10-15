import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, parseBody, requireSuperAdmin, unwrap } from '@/lib/api';

const Body = z.object({
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
  name: z.string().min(2).max(120).optional(),
  taxId: z.string().max(30).nullable().optional(),
});

/**
 * PATCH /api/v1/admin/tenants/{id} — Super Admin: suspender / reactivar / editar.
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
  const data = unwrap(await supabase.from('tenants').update(patch).eq('id', id).select().single());
  return NextResponse.json({ data });
});
