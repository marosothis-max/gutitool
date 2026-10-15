import { getTenantContext, fmtDate, rows, TOOL_STATUS } from '@/lib/app';
import { Empty, PageHead, Panel, StatusBadge } from '@/components/ui';
import { ToolActions } from './ToolActions';

export const metadata = { title: 'Herramientas' };

export default async function ToolsPage({
  params, searchParams,
}: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ s?: string }> }) {
  const { tenantId } = await params;
  const { s = '' } = await searchParams;
  const { supabase } = await getTenantContext(tenantId);

  let query = supabase.from('v_tool_status').select('*').eq('tenant_id', tenantId).order('serial_number').limit(1000);
  if (s === 'overdue') query = query.eq('is_overdue', true);
  else if (s) query = query.eq('status', s);
  const [r1, r2] = await Promise.all([
    query,
    supabase.from('locations').select('id, code, warehouses(code)').eq('tenant_id', tenantId).eq('active', true).order('code'),
  ]);
  const tools = rows(r1.data);
  const locations = rows(r2.data).map((l) => ({ id: l.id as string, label: `${l.warehouses?.code ?? ''} ${l.code}` }));

  return (
    <>
      <PageHead
        title="Herramientas"
        lead="Cada unidad con su número de serie: dónde está, a quién se entregó y cuándo debe volver."
      />
      <Panel flush>
        <form className="toolbar">
          <select className="select" name="s" defaultValue={s} aria-label="Estado">
            <option value="">Todas</option>
            <option value="available">Disponibles</option>
            <option value="assigned">Entregadas</option>
            <option value="overdue">Con devolución vencida</option>
            <option value="maintenance">En mantenimiento</option>
          </select>
          <button className="btn btn-ghost btn-sm">Filtrar</button>
        </form>
        {tools.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Herramienta</th><th>Estado</th><th>Dónde está</th><th>Devolución</th><th /></tr></thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.asset_id} className={t.is_overdue ? 'row-low' : undefined}>
                    <td>{t.item_name}<span className="cell-sub code">{t.serial_number}</span></td>
                    <td><StatusBadge map={TOOL_STATUS} value={t.status} /></td>
                    <td>
                      {t.assignment_id ? <>{t.assigned_to_name}<span className="cell-sub">Desde {fmtDate(t.checked_out_at)}</span></>
                        : <>{t.warehouse_name}<span className="cell-sub code">{t.location_code ?? 'Sin ubicación'}</span></>}
                    </td>
                    <td>{t.due_at ? (t.is_overdue ? <span className="badge badge-red">{fmtDate(t.due_at)}</span> : fmtDate(t.due_at)) : '—'}</td>
                    <td className="r">
                      <ToolActions tenantId={tenantId} assetId={t.asset_id} status={t.status} assignmentId={t.assignment_id} locations={locations} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={s ? 'Ninguna herramienta en este estado' : 'Aún no hay herramientas registradas'}>
            {s ? 'Cambia el filtro para ver el resto.' : 'Da de alta las unidades con su número de serie en la tabla tool_assets o mediante la API.'}
          </Empty>
        )}
      </Panel>
    </>
  );
}
