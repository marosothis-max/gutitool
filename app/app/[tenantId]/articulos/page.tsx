import Link from 'next/link';
import { COST_ROLES, getItemCosts, getTenantContext, fmtMoney, fmtQty, rows } from '@/lib/app';
import { Badge, Empty, PageHead, Panel } from '@/components/ui';
import { NewItemForm, ThresholdForm } from './ItemForms';

export const metadata = { title: 'Artículos' };

export default async function ItemsPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ q?: string; type?: string }> }) {
  const { tenantId } = await params;
  const { q, type } = await searchParams;
  const { supabase, can } = await getTenantContext(tenantId);
  const canEdit = can('company_admin', 'supervisor', 'buyer');
  const canThresholds = can('company_admin', 'supervisor');
  const costs = await getItemCosts(supabase, tenantId, can(...COST_ROLES));

  let query = supabase.from('items').select('id, sku, name, item_type, uom, active').eq('tenant_id', tenantId).order('sku').limit(1000);
  const term = q?.replace(/[,()*%\\]/g, ' ').trim();
  if (term) query = query.or(`sku.ilike.%${term}%,name.ilike.%${term}%`);
  if (type) query = query.eq('item_type', type);

  const [iRes, sRes, tRes, wRes] = await Promise.all([
    query,
    supabase.from('stock_levels').select('item_id, qty_on_hand').eq('tenant_id', tenantId).limit(50000),
    supabase.from('item_thresholds').select('item_id, warehouse_id, min_qty').eq('tenant_id', tenantId),
    supabase.from('warehouses').select('id, code, name').eq('tenant_id', tenantId).eq('active', true).order('code'),
  ]);
  const stock = new Map<string, number>();
  for (const s of rows(sRes.data)) stock.set(s.item_id, (stock.get(s.item_id) ?? 0) + Number(s.qty_on_hand));
  const whCode = new Map(rows(wRes.data).map((w): [string, string] => [w.id, w.code]));
  const mins = new Map<string, string[]>();
  for (const t of rows(tRes.data)) {
    if (!mins.has(t.item_id)) mins.set(t.item_id, []);
    mins.get(t.item_id)!.push(`${whCode.get(t.warehouse_id) ?? '?'} ${fmtQty(t.min_qty)}`);
  }
  const items = rows(iRes.data);

  return (
    <>
      <PageHead
        title="Artículos"
        lead="Catálogo de consumibles y herramientas con su stock total y sus mínimos por almacén."
        actions={canThresholds ? <Link className="btn btn-primary btn-sm" href={`/app/${tenantId}/importar`}>Cargar desde Excel</Link> : undefined}
      />
      <div className="grid-2" style={{ gridTemplateColumns: canEdit ? 'minmax(0, 3fr) minmax(320px, 2fr)' : '1fr', alignItems: 'start' }}>
        <Panel flush>
          <form className="toolbar" role="search">
            <input className="input grow" name="q" defaultValue={q} placeholder="Buscar por código o nombre" aria-label="Buscar" />
            <select className="select" name="type" defaultValue={type ?? ''} aria-label="Tipo">
              <option value="">Todos</option><option value="consumable">Consumibles</option><option value="tool">Herramientas</option>
            </select>
            <button className="btn btn-ghost btn-sm">Filtrar</button>
          </form>
          {items.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Artículo</th><th>Tipo</th><th className="r">Stock total</th>{costs && <th className="r">Coste</th>}<th>Mínimos</th></tr></thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.name}<span className="cell-sub code">{it.sku}</span></td>
                      <td>{it.item_type === 'tool' ? <Badge tone="blue">Herramienta</Badge> : <Badge>Consumible</Badge>}</td>
                      <td className="r" style={{ fontWeight: 600 }}>{fmtQty(stock.get(it.id) ?? 0)} {it.uom}</td>
                      {costs && <td className="r">{fmtMoney(costs.get(it.id) ?? 0)}</td>}
                      <td className="code" style={{ fontSize: 13 }}>{mins.get(it.id)?.join(', ') ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={q || type ? 'Sin resultados' : 'El catálogo está vacío'}>
              {q || type ? 'Prueba con otra búsqueda.' : 'Crea artículos uno a uno o cárgalos todos desde Excel con su stock.'}
            </Empty>
          )}
        </Panel>

        {canEdit && (
          <div>
            <Panel title="Nuevo artículo"><NewItemForm tenantId={tenantId} /></Panel>
            {canThresholds && (
              <Panel title="Mínimo por almacén">
                <ThresholdForm tenantId={tenantId}
                  items={items.map((i) => ({ id: i.id, label: `${i.sku}, ${i.name}` }))}
                  warehouses={rows(wRes.data).map((w) => ({ id: w.id, label: `${w.code}, ${w.name}` }))} />
              </Panel>
            )}
          </div>
        )}
      </div>
    </>
  );
}
