import { COST_ROLES, getItemCosts, getTenantContext, fmtMoney, fmtQty, LEVEL_ES, rows } from '@/lib/app';
import { Badge, Empty, PageHead, Panel } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Stock por ubicación' };

export default async function StockPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ q?: string; w?: string; type?: string }> }) {
  const { tenantId } = await params;
  const { q, w, type } = await searchParams;
  const { supabase, can } = await getTenantContext(tenantId);
  const costs = await getItemCosts(supabase, tenantId, can(...COST_ROLES));

  let query = supabase.from('v_stock_by_location').select('*').eq('tenant_id', tenantId)
    .gt('qty_on_hand', 0).order('warehouse_code').order('location_code').limit(1000);
  if (w) query = query.eq('warehouse_id', w);
  if (type) query = query.eq('item_type', type);
  const term = q?.replace(/[,()*%\\]/g, ' ').trim();
  if (term) query = query.or(`sku.ilike.%${term}%,item_name.ilike.%${term}%,location_code.ilike.%${term}%`);

  const [stockRes, whRes] = await Promise.all([
    query,
    supabase.from('warehouses').select('id, code, name, level').eq('tenant_id', tenantId).order('code'),
  ]);
  const list = rows(stockRes.data);
  const value = (r: { item_id: string; qty_on_hand: string }) => Number(r.qty_on_hand) * (costs?.get(r.item_id) ?? 0);
  const total = costs ? list.reduce((s: number, r) => s + value(r), 0) : 0;
  const qs = new URLSearchParams({ ...(w ? { warehouseId: w } : {}) }).toString();

  return (
    <>
      <PageHead
        title="Stock por ubicación"
        lead={costs
          ? <>Cada artículo en su pasillo, estantería y bin. Valor del stock mostrado: <strong className="num">{fmtMoney(total)}</strong></>
          : 'Cada artículo en su pasillo, estantería y bin.'}
        actions={<a className="btn btn-ghost btn-sm" href={`/api/v1/${tenantId}/exports/stock.xlsx${qs ? `?${qs}` : ''}`}><Icon name="download" size={16} />Excel</a>}
      />
      <Panel flush>
        <form className="toolbar" role="search">
          <input className="input grow" name="q" defaultValue={q} placeholder="Código, nombre o ubicación (P01-E03…)" aria-label="Buscar" />
          <select className="select" name="w" defaultValue={w ?? ''} aria-label="Almacén">
            <option value="">Todos los almacenes</option>
            {rows(whRes.data).map((x) => <option key={x.id} value={x.id}>{x.code}, {x.name}</option>)}
          </select>
          <select className="select" name="type" defaultValue={type ?? ''} aria-label="Tipo">
            <option value="">Consumibles y herramientas</option>
            <option value="consumable">Solo consumibles</option>
            <option value="tool">Solo herramientas</option>
          </select>
          <button className="btn btn-ghost btn-sm">Filtrar</button>
        </form>
        {list.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Ubicación</th><th>Almacén</th><th>Artículo</th><th>Tipo</th><th className="r">Cantidad</th>{costs && <th className="r">Valor</th>}</tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={`${r.location_id}-${r.item_id}`}>
                    <td><span className="code">{r.location_code}</span>
                      <span className="cell-sub">Pasillo {r.aisle}, estantería {r.rack}, bin {r.bin}</span></td>
                    <td>{r.warehouse_code}<span className="cell-sub">{LEVEL_ES[r.warehouse_level]}</span></td>
                    <td>{r.item_name}<span className="cell-sub code">{r.sku}</span></td>
                    <td>{r.item_type === 'tool' ? <Badge tone="blue">Herramienta</Badge> : <Badge>Consumible</Badge>}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{fmtQty(r.qty_on_hand)} {r.uom}</td>
                    {costs && <td className="r">{fmtMoney(value(r))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={q || w || type ? 'Sin resultados' : 'Todavía no hay stock'}>
            {q || w || type ? 'Prueba con otro filtro o búsqueda.' : 'El stock aparece al registrar recepciones de compra o traslados.'}
          </Empty>
        )}
      </Panel>
    </>
  );
}
