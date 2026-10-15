import Link from 'next/link';
import { getTenantContext, fmtDateTime, fmtQty, MOVE_ES, rows } from '@/lib/app';
import { Empty, PageHead, Panel } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Movimientos' };
const PAGE = 100;

export default async function MovementsPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ w?: string; type?: string; from?: string; to?: string; p?: string }> }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p ?? 1));
  const { supabase } = await getTenantContext(tenantId);

  let query = supabase.from('v_movements_detail').select('*', { count: 'exact' }).eq('tenant_id', tenantId)
    .order('id', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.w) query = query.eq('warehouse_id', sp.w);
  if (sp.type) query = query.eq('movement_type', sp.type);
  if (sp.from) query = query.gte('created_at', sp.from);
  if (sp.to) query = query.lte('created_at', `${sp.to}T23:59:59`);

  const [r1, r2] = await Promise.all([
    query,
    supabase.from('warehouses').select('id, code, name').eq('tenant_id', tenantId).order('code'),
  ]);
  const moves = rows(r1.data);
  const total = r1.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const filters = new URLSearchParams(Object.entries({ warehouseId: sp.w, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][]);
  const pageHref = (p: number) => `?${new URLSearchParams({ ...sp, p: String(p) } as Record<string, string>).toString()}`;

  return (
    <>
      <PageHead
        title="Movimientos"
        lead="Registro inmutable de cada entrada, salida, traslado, devolución y ajuste, con su documento y su autor."
        actions={<a className="btn btn-ghost btn-sm" href={`/api/v1/${tenantId}/exports/movements.xlsx?${filters}`}><Icon name="download" size={16} />Excel</a>}
      />
      <Panel flush>
        <form className="toolbar">
          <select className="select" name="w" defaultValue={sp.w ?? ''} aria-label="Almacén">
            <option value="">Todos los almacenes</option>
            {rows(r2.data).map((w) => <option key={w.id} value={w.id}>{w.code}, {w.name}</option>)}
          </select>
          <select className="select" name="type" defaultValue={sp.type ?? ''} aria-label="Tipo de movimiento">
            <option value="">Todos los tipos</option>
            {Object.entries(MOVE_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input" type="date" name="from" defaultValue={sp.from} aria-label="Desde" />
          <input className="input" type="date" name="to" defaultValue={sp.to} aria-label="Hasta" />
          <button className="btn btn-ghost btn-sm">Filtrar</button>
        </form>
        {moves.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Movimiento</th><th>Artículo</th><th>Ubicación</th><th className="r">Cantidad</th><th>Documento</th><th>Usuario</th></tr></thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDateTime(m.created_at)}</td>
                    <td>{MOVE_ES[m.movement_type] ?? m.movement_type}{m.notes && <span className="cell-sub">{m.notes}</span>}</td>
                    <td>{m.item_name}<span className="cell-sub code">{m.sku}</span></td>
                    <td><span className="code">{m.warehouse_code} {m.location_code}</span></td>
                    <td className="r" style={{ color: Number(m.quantity) < 0 ? 'var(--danger)' : 'var(--ok)', fontWeight: 600 }}>
                      {Number(m.quantity) > 0 ? '+' : ''}{fmtQty(m.quantity)} {m.uom}
                    </td>
                    <td className="code">{m.doc_number ?? '—'}</td>
                    <td className="muted">{m.created_by_email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Sin movimientos">No hay movimientos con estos filtros.</Empty>}
        {pages > 1 && (
          <div className="toolbar" style={{ borderTop: '1px solid var(--steel-100)', borderBottom: 0, justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 14 }}>Página {page} de {pages}, {total.toLocaleString('es-ES')} movimientos</span>
            <span className="inline-actions">
              {page > 1 && <Link className="btn btn-ghost btn-sm" href={pageHref(page - 1)}>Anterior</Link>}
              {page < pages && <Link className="btn btn-ghost btn-sm" href={pageHref(page + 1)}>Siguiente</Link>}
            </span>
          </div>
        )}
      </Panel>
    </>
  );
}
