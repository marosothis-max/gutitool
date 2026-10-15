import { redirect } from 'next/navigation';
import { getTenantContext, rows } from '@/lib/app';
import { PageHead, Panel } from '@/components/ui';
import { ImportForm } from './ImportForm';

export const metadata = { title: 'Carga inicial desde Excel' };

export default async function ImportPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase, can } = await getTenantContext(tenantId);
  if (!can('company_admin', 'supervisor')) redirect(`/app/${tenantId}`);
  const whs = rows((await supabase.from('warehouses').select('code, name').eq('tenant_id', tenantId).order('code')).data);

  return (
    <>
      <PageHead
        title="Carga inicial desde Excel"
        lead="Copia las filas de tu Excel y pégalas aquí. Se crean los artículos y ubicaciones que falten y se registra el stock como inventario inicial."
      />
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 1fr)', alignItems: 'start' }}>
        <Panel title="Pegar datos">
          <ImportForm tenantId={tenantId} warehouseCodes={whs.map((w) => w.code as string)} />
        </Panel>
        <Panel title="Cómo preparar el Excel">
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--steel-600)', display: 'grid', gap: 8 }}>
            <li>Descarga la plantilla o usa tu Excel con estas columnas, con o sin cabecera: <strong>SKU, Nombre, Tipo, Unidad, Coste, Almacén, Ubicación, Cantidad, Mínimo</strong>.</li>
            <li><strong>Almacén</strong> es el código del almacén ya creado: {whs.length ? <span className="code">{whs.map((w) => w.code).join(', ')}</span> : 'crea antes tus almacenes'}.</li>
            <li><strong>Ubicación</strong> va como PASILLO-ESTANTERÍA-BIN, por ejemplo <span className="code">P01-E03-B12</span>. Si no existe, se crea.</li>
            <li><strong>Tipo</strong>: consumible o herramienta. Si lo dejas vacío, será consumible.</li>
            <li>Selecciona las filas en Excel, cópialas con Ctrl+C y pégalas en el cuadro con Ctrl+V.</li>
          </ol>
        </Panel>
      </div>
    </>
  );
}
