import { NextResponse } from 'next/server';
import { handler, requireTenant, unwrap } from '@/lib/api';

/** POST /api/v1/{tenantId}/returns/{id}/post — contabiliza una devolución en borrador */
export const POST = handler<{ tenantId: string; id: string }>(async (_req, { tenantId, id }) => {
  const { supabase } = await requireTenant(tenantId);
  unwrap(await supabase.from('returns').select('id').eq('tenant_id', tenantId).eq('id', id).single());
  unwrap(await supabase.rpc('post_return', { p_return_id: id }));
  const data = unwrap(await supabase.from('returns').select('*').eq('id', id).single());
  return NextResponse.json({ data });
});
