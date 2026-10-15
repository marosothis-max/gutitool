import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, handler, parseBody, requireTenant, unwrap, uuid } from '@/lib/api';
import { findOrCreateUser } from '@/lib/users';

const ROLES = ['company_admin', 'supervisor', 'auditor', 'buyer', 'carrier', 'warehouse_keeper'] as const;

/** GET /api/v1/{tenantId}/members — usuarios de la empresa con sus roles y el uso del plan */
export const GET = handler<{ tenantId: string }>(async (_req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId);
  const [members, tenant] = await Promise.all([
    supabase.from('tenant_members').select('user_id, role, active, created_at, profiles(email, full_name)')
      .eq('tenant_id', tenantId).order('created_at'),
    supabase.from('tenants').select('plan, max_users').eq('id', tenantId).single(),
  ]);
  const data = unwrap(members) as unknown as { user_id: string; active: boolean }[];
  const used = new Set(data.filter((m) => m.active).map((m) => m.user_id)).size;
  const t = unwrap(tenant) as unknown as { plan: string; max_users: number | null };
  return NextResponse.json({ data, usage: { used, max: t.max_users, plan: t.plan } });
});

const Body = z.object({
  email: z.string().email(),
  fullName: z.string().max(120).optional(),
  /** Contraseña temporal: crea la cuenta ya activa. Si se omite, se envía invitación por correo. */
  password: z.string().min(8).max(72).optional(),
  roles: z.array(z.enum(ROLES)).min(1),
  warehouseIds: z.array(uuid).default([]),
});

/**
 * POST /api/v1/{tenantId}/members — el Administrador de Empresa da de alta un usuario y
 * le asigna roles (Supervisor, Auditor, Comprador, Transportista, Almacenista) y almacenes.
 * Respeta el límite de usuarios del plan (comprobado aquí y garantizado en la BD).
 */
export const POST = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase } = await requireTenant(tenantId, ['company_admin']);
  const b = await parseBody(req, Body);
  const email = b.email.trim().toLowerCase();

  // Comprobación previa para no crear cuentas que luego no se pueden asignar
  const [tenantRes, activeRes, profileRes] = await Promise.all([
    supabase.from('tenants').select('max_users').eq('id', tenantId).single(),
    supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId).eq('active', true),
    supabase.from('profiles').select('id').ilike('email', email).maybeSingle(),
  ]);
  const max = (unwrap(tenantRes) as unknown as { max_users: number | null }).max_users;
  const activeIds = new Set((unwrap(activeRes) as unknown as { user_id: string }[]).map((m) => m.user_id));
  const existingId = (profileRes.data as unknown as { id: string } | null)?.id;
  const alreadyMember = !!existingId && activeIds.has(existingId);
  if (max !== null && !alreadyMember && activeIds.size >= max) {
    throw new ApiError(409, `Has alcanzado el límite de tu plan (${max} usuarios). Pide al administrador de la plataforma que lo amplíe.`);
  }

  const user = await findOrCreateUser(email, { fullName: b.fullName, password: b.password });

  unwrap(await supabase.from('tenant_members').upsert(
    b.roles.map((role) => ({ tenant_id: tenantId, user_id: user.id, role, active: true })),
    { onConflict: 'tenant_id,user_id,role' },
  ));
  if (b.warehouseIds.length) {
    unwrap(await supabase.from('member_warehouses').upsert(
      b.warehouseIds.map((w) => ({ tenant_id: tenantId, user_id: user.id, warehouse_id: w })),
      { onConflict: 'user_id,warehouse_id' },
    ));
  }
  return NextResponse.json(
    { userId: user.id, roles: b.roles, created: user.created, invited: user.created && !b.password },
    { status: 201 },
  );
});

/** DELETE /api/v1/{tenantId}/members?userId=&role= — retira un rol, o al usuario entero si no se indica rol */
export const DELETE = handler<{ tenantId: string }>(async (req, { tenantId }) => {
  const { supabase, user } = await requireTenant(tenantId, ['company_admin']);
  const q = new URL(req.url).searchParams;
  const userId = uuid.parse(q.get('userId'));
  const role = q.get('role');
  if (userId === user.id && (!role || role === 'company_admin')) {
    throw new ApiError(422, 'No puedes quitarte a ti mismo el rol de administrador.');
  }
  let query = supabase.from('tenant_members').delete().eq('tenant_id', tenantId).eq('user_id', userId);
  if (role) query = query.eq('role', z.enum(ROLES).parse(role));
  unwrap(await query);
  if (!role) {
    unwrap(await supabase.from('member_warehouses').delete().eq('tenant_id', tenantId).eq('user_id', userId));
  }
  return new NextResponse(null, { status: 204 });
});
