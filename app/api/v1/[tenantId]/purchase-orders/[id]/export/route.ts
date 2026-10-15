import { handler, requireTenant } from '@/lib/api';
import { xlsxResponse } from '@/lib/excel';
import { buildPurchaseOrderWorkbook, loadPurchaseOrder } from '@/lib/purchase-orders';

/** GET /api/v1/{tenantId}/purchase-orders/{id}/export — descarga el pedido en Excel */
export const GET = handler<{ tenantId: string; id: string }>(async (_req, { tenantId, id }) => {
  const { supabase } = await requireTenant(tenantId);
  const po = await loadPurchaseOrder(supabase, tenantId, id);
  return xlsxResponse(await buildPurchaseOrderWorkbook(po), `${po.number}.xlsx`);
});
