import { getTenantContext, LEVEL_ES, rows } from '@/lib/app';
import { Empty, Level, PageHead, Panel } from '@/components/ui';
import { LocationGenerator, NewWarehouseForm } from './WarehouseForms';

export const metadata = { title: 'Almacenes y ubicaciones' };

type Wh = { id: string; code: string; name: string; level: string; parent_id: string | null; address: string | null };

export default async function WarehousesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase, can } = await getTenantContext(tenantId);
  const canEdit = can('company_admin', 'supervisor');

  const [wRes, lRes] = await Promise.all([
    supabase.from('warehouses').select('id, code, name, level, parent_id, address').eq('tenant_id', tenantId).order('code'),
    supabase.from('locations').select('warehouse_id, aisle').eq('tenant_id', tenantId).limit(20000),
  ]);
  const all = rows(wRes.data) as Wh[];
  const locCount = new Map<string, number>();
  const aisles = new Map<string, Set<string>>();
  for (const l of rows(lRes.data)) {
    locCount.set(l.warehouse_id, (locCount.get(l.warehouse_id) ?? 0) + 1);
    if (!aisles.has(l.warehouse_id)) aisles.set(l.warehouse_id, new Set());
    aisles.get(l.warehouse_id)!.add(l.aisle);
  }

  // Orden jerárquico con sangría
  const ordered: { w: Wh; depth: number }[] = [];
  const add = (w: Wh, depth: number) => {
    ordered.push({ w, depth });
    all.filter((c) => c.parent_id === w.id).sort((a, b) => a.code.localeCompare(b.code)).forEach((c) => add(c, depth + 1));
  };
  all.filter((w) => !w.parent_id).forEach((w) => add(w, 0));
  const parentName = new Map(all.map((w): [string, string] => [w.id, w.code]));

  return (
    <>
      <PageHead
        title="Almacenes y ubicaciones"
        lead="La red de almacenes de la empresa y las ubicaciones (pasillo, estantería y bin) de cada uno."
      />
      <div className="grid-2" style={{ gridTemplateColumns: canEdit ? 'minmax(0, 3fr) minmax(320px, 2fr)' : '1fr', alignItems: 'start' }}>
        <Panel title="Red de almacenes" flush>
          {ordered.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Almacén</th><th>Nivel</th><th>Depende de</th><th className="r">Ubicaciones</th><th>Pasillos</th></tr></thead>
                <tbody>
                  {ordered.map(({ w, depth }) => (
                    <tr key={w.id}>
                      <td style={{ paddingLeft: 14 + depth * 22 }}>
                        {depth > 0 && <span className="muted" aria-hidden="true">└ </span>}
                        <strong>{w.code}</strong> {w.name}
                        {w.address && <span className="cell-sub">{w.address}</span>}
                      </td>
                      <td><Level level={w.level} label={LEVEL_ES[w.level]} /></td>
                      <td className="code">{w.parent_id ? parentName.get(w.parent_id) : '—'}</td>
                      <td className="r">{locCount.get(w.id) ?? 0}</td>
                      <td className="code">{[...(aisles.get(w.id) ?? [])].sort().slice(0, 8).join(', ') || <span className="muted">Sin ubicaciones</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Sin almacenes">Crea primero el almacén central.</Empty>}
        </Panel>

        {canEdit && (
          <div>
            <Panel title="Nuevo almacén">
              <NewWarehouseForm tenantId={tenantId} warehouses={all.map((w) => ({ id: w.id, code: w.code, name: w.name, level: w.level }))} />
            </Panel>
            <Panel title="Generar ubicaciones">
              <LocationGenerator tenantId={tenantId} warehouses={all.map((w) => ({ id: w.id, label: `${w.code}, ${w.name}` }))} />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
