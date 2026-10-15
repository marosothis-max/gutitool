import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handler, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';
import { findOrInviteUser } from '@/lib/users';

const ROLES = ['company_admin', 'supervisor', 'auditor', 'buyer', 'carrier', 'warehouse_keeper'] as const;

/** GET /api/v1/{tenantId}/members — usuarios de la empresa con sus roles */
export const GET = handler<{ tenantId: string }>(async (_req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const data = unwrap(await supabase.from('tenant_members')
    .select('user_id, role, active, created_at, profiles(email, full_name)')
    .eq('tenant_id', tenantId).order('created_at'));
  return NextResponse.json({ data });
});

const Body = z.object({
  email: z.string().email(),
  fullName: z.string().max(120).optional(),
  roles: z.array(z.enum(ROLES)).min(1),
  warehouseIds: z.array(uuid).default([]),   // almacenes asignados (almacenistas)
});

/**
 * POST /api/v1/{tenantId}/members — el Administrador de Empresa invita a un usuario
 * y le asigna roles (Supervisor, Auditor, Comprador, Transportista, Almacenista).
 */
export const POST = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId, ['company_admin']);
  const b = await parseBody(req, Body);
  const userId = await findOrInviteUser(b.email, b.fullName);

  // Escrituras con el cliente del ADMIN: el RLS garantiza que solo toca su empresa.
  unwrap(await supabase.from('tenant_members').upsert(
    b.roles.map((role) => ({ tenant_id: tenantId, user_id: userId, role, active: true })),
    { onConflict: 'tenant_id,user_id,role' },
  ));
  if (b.warehouseIds.length) {
    unwrap(await supabase.from('member_warehouses').upsert(
      b.warehouseIds.map((w) => ({ tenant_id: tenantId, user_id: userId, warehouse_id: w })),
      { onConflict: 'user_id,warehouse_id' },
    ));
  }
  return NextResponse.json({ userId, roles: b.roles }, { status: 201 });
});

/** DELETE /api/v1/{tenantId}/members?userId=&role= — retira un rol (o todos si no se indica) */
export const DELETE = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId, ['company_admin']);
  const q = new URL(req.url).searchParams;
  const userId = uuid.parse(q.get('userId'));
  let query = supabase.from('tenant_members').delete().eq('tenant_id', tenantId).eq('user_id', userId);
  if (q.get('role')) query = query.eq('role', z.enum(ROLES).parse(q.get('role')));
  unwrap(await query);
  return new NextResponse(null, { status: 204 });
});
