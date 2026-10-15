import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { createClient } from './supabase/server';

export type AppRole =
  | 'company_admin' | 'supervisor' | 'auditor' | 'buyer' | 'carrier' | 'warehouse_keeper';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type PgError = { code?: string; message: string; hint?: string | null; details?: string | null };

/** Traduce errores de PostgreSQL / PostgREST a códigos HTTP coherentes. */
export function fromPg(err: PgError): ApiError {
  if (err.code === '42501') return new ApiError(403, err.message);
  if (err.hint === 'INSUFFICIENT_STOCK') return new ApiError(409, err.message);
  if (err.code === '23505') return new ApiError(409, 'Registro duplicado', err.details);
  if (err.code === 'PGRST116') return new ApiError(404, 'No encontrado');
  if (['P0001', '23503', '23514', '22P02', '23502'].includes(err.code ?? '')) {
    return new ApiError(422, err.message, err.details);
  }
  return new ApiError(500, err.message);
}

/** Desenvuelve { data, error } de supabase-js lanzando ApiError. */
export function unwrap<T>(res: { data: T; error: PgError | null }): T {
  if (res.error) throw fromPg(res.error);
  return res.data;
}

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, 'No autenticado');
  return { supabase, user };
}

/**
 * Comprueba pertenencia al tenant de la URL. La seguridad real está en RLS/RPC;
 * esto da respuestas 403 claras y expone los roles para la lógica de UI/API.
 */
export async function requireTenant(tenantId: string, allowed?: AppRole[]) {
  const ctx = await requireUser();
  const rows = unwrap(
    await ctx.supabase
      .from('tenant_members')
      .select('role, tenants!inner(status)')
      .eq('tenant_id', tenantId)
      .eq('user_id', ctx.user.id)
      .eq('active', true),
  ) as unknown as { role: AppRole; tenants: { status: string } }[];

  if (!rows.length) throw new ApiError(403, 'Sin acceso a esta empresa');
  if (rows[0].tenants.status !== 'active') throw new ApiError(403, 'Empresa suspendida');
  const roles = rows.map((r) => r.role);
  if (allowed && !roles.some((r) => allowed.includes(r))) {
    throw new ApiError(403, `Requiere uno de los roles: ${allowed.join(', ')}`);
  }
  return { ...ctx, roles };
}

export async function requireSuperAdmin() {
  const ctx = await requireUser();
  const profile = unwrap(
    await ctx.supabase.from('profiles').select('is_super_admin').eq('id', ctx.user.id).single(),
  );
  if (!profile.is_super_admin) throw new ApiError(403, 'Solo super administradores');
  return ctx;
}

export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  const json = await req.json().catch(() => {
    throw new ApiError(400, 'JSON inválido');
  });
  return schema.parse(json);
}

/** Paginación ?page=1&pageSize=50 → rango para .range() */
export function pagination(url: URL, max = 500) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(max, Math.max(1, Number(url.searchParams.get('pageSize') ?? 50)));
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

/** Limpia texto libre antes de usarlo dentro de un filtro .or() de PostgREST. */
export function safeSearch(s: string | null) {
  return s ? s.replace(/[,()*%\\]/g, ' ').trim().slice(0, 60) : null;
}

/** Envuelve un route handler con manejo uniforme de errores. */
export function handler<P extends Record<string, string>>(
  fn: (req: Request, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      return await fn(req, await ctx.params);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ error: 'Datos inválidos', details: e.issues }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
  };
}

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato AAAA-MM-DD');
