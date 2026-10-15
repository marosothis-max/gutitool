import { getTenantContext, rows } from '@/lib/app';
import { Empty, PageHead, Panel } from '@/components/ui';
import { SupplierForm } from './SupplierForm';

export const metadata = { title: 'Proveedores' };

export default async function SuppliersPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase, can } = await getTenantContext(tenantId);
  const canEdit = can('company_admin', 'supervisor', 'buyer');
  const list = rows((await supabase.from('suppliers').select('id, name, tax_id, email, phone').eq('tenant_id', tenantId).order('name')).data);

  return (
    <>
      <PageHead title="Proveedores" lead="A quién se compra. El correo del proveedor se puede poner en copia al enviar una orden de compra." />
      <div className="grid-2" style={{ gridTemplateColumns: canEdit ? 'minmax(0, 3fr) minmax(320px, 2fr)' : '1fr', alignItems: 'start' }}>
        <Panel flush>
          {list.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Proveedor</th><th>CIF / RIF</th><th>Correo</th><th>Teléfono</th></tr></thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id}><td>{s.name}</td><td className="code">{s.tax_id ?? '—'}</td><td>{s.email ?? '—'}</td><td>{s.phone ?? '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Sin proveedores">Da de alta el primero con el formulario.</Empty>}
        </Panel>
        {canEdit && <Panel title="Nuevo proveedor"><SupplierForm tenantId={tenantId} /></Panel>}
      </div>
    </>
  );
}
