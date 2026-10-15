import { getTenantContext, fmtQty, LEVEL_ES, rows } from '@/lib/app';
import { Empty, Level, PageHead, Panel } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Red de almacenes' };

type Row = {
  item_id: string; sku: string; item_name: string; uom: string; item_type: string;
  warehouse_id: string; qty_on_hand: string; qty_in_transit: string; qty_on_order: string;
  min_qty: string | null; below_min: boolean;
};
type Wh = { id: string; code: string; name: string; level: string; parent_id: string | null };

const ORDER: Record<string, number> = { central: 0, intermediate: 1, final: 2 };

/** Matriz artículo × almacén: lo que ve el Almacén Central de toda la red. */
export default async function NetworkPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ q?: string; low?: string }> }) {
  const { tenantId } = await params;
  const { q, low } = await searchParams;
  const { supabase } = await getTenantContext(tenantId);

  const [whRes, netRes] = await Promise.all([
    supabase.from('warehouses').select('id, code, name, level, parent_id').eq('tenant_id', tenantId).eq('active', true),
    supabase.from('v_stock_network').select('*').eq('tenant_id', tenantId).order('sku').limit(5000),
  ]);

  // Orden jerárquico: central, sus intermedios y, tras cada intermedio, sus finales.
  const all = rows(whRes.data) as Wh[];
  const ordered: Wh[] = [];
  const add = (w: Wh) => { ordered.push(w); all.filter((c) => c.parent_id === w.id).sort((a, b) => a.code.localeCompare(b.code)).forEach(add); };
  all.filter((w) => !w.parent_id).forEach(add);
  all.filter((w) => !ordered.includes(w)).sort((a, b) => ORDER[a.level] - ORDER[b.level]).forEach((w) => ordered.push(w));

  const items = new Map<string, { sku: string; name: string; uom: string; type: string; cells: Map<string, Row>; low: boolean; total: number }>();
  for (const r of rows(netRes.data) as Row[]) {
    const it = items.get(r.item_id) ?? { sku: r.sku, name: r.item_name, uom: r.uom, type: r.item_type, cells: new Map(), low: false, total: 0 };
    it.cells.set(r.warehouse_id, r);
    it.low ||= r.below_min;
    it.total += Number(r.qty_on_hand);
    items.set(r.item_id, it);
  }
  const term = q?.trim().toLowerCase();
  const list = [...items.values()].filter((it) =>
    (!term || it.sku.toLowerCase().includes(term) || it.name.toLowerCase().includes(term)) && (low !== '1' || it.low));

  return (
    <>
      <PageHead
        title="Red de almacenes"
        lead="Stock exacto de cada artículo en el central, los intermedios y los almacenes finales. Se actualiza con cada movimiento."
        actions={<a className="btn btn-ghost btn-sm" href={`/api/v1/${tenantId}/exports/stock.xlsx`}><Icon name="download" size={16} />Excel</a>}
      />
      <Panel flush>
        <form className="toolbar" role="search">
          <input className="input grow" name="q" defaultValue={q} placeholder="Buscar por código o nombre" aria-label="Buscar artículo" />
          <select className="select" name="low" defaultValue={low ?? ''} aria-label="Filtro">
            <option value="">Todos los artículos</option>
            <option value="1">Solo bajo mínimo</option>
          </select>
          <button className="btn btn-ghost btn-sm">Filtrar</button>
        </form>
        {!ordered.length ? (
          <Empty title="No hay almacenes">Crea el almacén central y sus intermedios y finales para ver la red.</Empty>
        ) : !list.length ? (
          <Empty title="Sin resultados">{term || low ? 'Prueba con otro filtro.' : 'Registra la primera recepción para ver stock aquí.'}</Empty>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th className="r">Total red</th>
                  {ordered.map((w) => (
                    <th key={w.id} className="r" title={w.name}>
                      <span style={{ display: 'block' }}>{w.code}</span>
                      <Level level={w.level} label={LEVEL_ES[w.level]} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((it) => (
                  <tr key={it.sku} className={it.low ? 'row-low' : undefined}>
                    <td>{it.name}<span className="cell-sub code">{it.sku}{it.type === 'tool' ? ', herramienta' : ''}</span></td>
                    <td className="r" style={{ fontWeight: 700 }}>{fmtQty(it.total)} <span className="muted" style={{ fontWeight: 400 }}>{it.uom}</span></td>
                    {ordered.map((w) => {
                      const c = it.cells.get(w.id);
                      if (!c) return <td key={w.id} className="r muted">—</td>;
                      const transit = Number(c.qty_in_transit), onOrder = Number(c.qty_on_order);
                      return (
                        <td key={w.id} className="r">
                          <span className={`matrix-cell${c.below_min ? ' low' : ''}`}>
                            {fmtQty(c.qty_on_hand)}
                            {c.min_qty !== null && <span className="sub">mín. {fmtQty(c.min_qty)}</span>}
                            {transit > 0 && <span className="sub">+{fmtQty(transit)} en camino</span>}
                            {onOrder > 0 && <span className="sub">+{fmtQty(onOrder)} pedido</span>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
