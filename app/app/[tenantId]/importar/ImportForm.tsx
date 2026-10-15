'use client';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FormMsg, useMutation } from '@/components/useMutation';

type Row = {
  sku: string; name: string; item_type: string; uom: string; unit_cost: string;
  warehouse_code: string; location_code: string; quantity: string; min_qty: string;
};
const FIELDS: (keyof Row)[] = ['sku', 'name', 'item_type', 'uom', 'unit_cost', 'warehouse_code', 'location_code', 'quantity', 'min_qty'];
const LABELS: Record<keyof Row, string> = {
  sku: 'SKU', name: 'Nombre', item_type: 'Tipo', uom: 'Unidad', unit_cost: 'Coste',
  warehouse_code: 'Almacén', location_code: 'Ubicación', quantity: 'Cantidad', min_qty: 'Mínimo',
};
// Sinónimos de cabecera (en minúsculas y sin acentos)
const SYN: Record<string, keyof Row> = {
  sku: 'sku', codigo: 'sku', referencia: 'sku', ref: 'sku', 'cod.': 'sku',
  nombre: 'name', descripcion: 'name', articulo: 'name', denominacion: 'name',
  tipo: 'item_type', clase: 'item_type',
  unidad: 'uom', udm: 'uom', um: 'uom', 'u.m.': 'uom',
  coste: 'unit_cost', costo: 'unit_cost', precio: 'unit_cost', 'coste unitario': 'unit_cost', 'costo unitario': 'unit_cost',
  almacen: 'warehouse_code', deposito: 'warehouse_code', bodega: 'warehouse_code',
  ubicacion: 'location_code', bin: 'location_code', posicion: 'location_code',
  cantidad: 'quantity', stock: 'quantity', existencia: 'quantity', existencias: 'quantity', unidades: 'quantity',
  minimo: 'min_qty', 'stock minimo': 'min_qty', min: 'min_qty',
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function parse(text: string): { rows: Row[]; headerFound: boolean } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { rows: [], headerFound: false };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const cells = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
  const mapped = cells[0].map((h) => SYN[norm(h)]);
  const headerFound = mapped.filter(Boolean).length >= 2;
  const order: (keyof Row | undefined)[] = headerFound ? mapped : FIELDS;
  const body = headerFound ? cells.slice(1) : cells;
  return {
    headerFound,
    rows: body.map((c) => {
      const r = Object.fromEntries(FIELDS.map((f) => [f, ''])) as Row;
      order.forEach((f, i) => { if (f) r[f] = c[i] ?? ''; });
      return r;
    }),
  };
}

const TEMPLATE = [
  'SKU;Nombre;Tipo;Unidad;Coste;Almacén;Ubicación;Cantidad;Mínimo',
  'VAL-BOL-2;Válvula de bola 2" 300#;consumible;UD;85,40;CEN;P01-E01-B01;24;6',
  'HER-TAL-18V;Taladro percutor 18V;herramienta;UD;189;CEN;P09-E01-B01;3;',
].join('\n');

export function ImportForm({ tenantId, warehouseCodes }: { tenantId: string; warehouseCodes: string[] }) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('Inventario inicial');
  const { busy, msg, run } = useMutation();
  const { rows, headerFound } = useMemo(() => parse(text), [text]);
  const whSet = useMemo(() => new Set(warehouseCodes.map((c) => c.toUpperCase())), [warehouseCodes]);

  const problems = rows.map((r) => {
    if (!r.sku) return 'Falta el SKU';
    if (!whSet.has(r.warehouse_code.toUpperCase())) return `Almacén "${r.warehouse_code}" no existe`;
    if (r.location_code.split('-').filter(Boolean).length !== 3) return 'Ubicación con formato P01-E01-B01';
    if (r.quantity && isNaN(Number(r.quantity.replace(',', '.')))) return 'Cantidad no numérica';
    return '';
  });
  const bad = problems.filter(Boolean).length;
  const units = rows.reduce((s, r) => s + (Number(r.quantity.replace(',', '.')) || 0), 0);

  async function importNow() {
    await run(async () => {
      const supabase = createClient();
      let created = 0, locs = 0, moves = 0;
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000);
        const { data, error } = await supabase.rpc('import_initial_stock', { p_tenant_id: tenantId, p_rows: chunk, p_reason: reason || 'Inventario inicial' });
        if (error) throw new Error(i ? `${error.message} (bloque desde la fila ${i + 1}; lo anterior ya se cargó)` : error.message);
        const d = data as { items_created: number; locations_created: number; movements: number };
        created += d.items_created; locs += d.locations_created; moves += d.movements;
      }
      setText('');
      return `Carga completada: ${moves} entradas de stock, ${created} artículos nuevos y ${locs} ubicaciones nuevas.`;
    });
  }

  return (
    <div>
      <FormMsg msg={msg} />
      <div className="inline-actions" style={{ marginBottom: 10 }}>
        <a className="btn btn-ghost btn-sm" download="plantilla-carga-inicial.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + TEMPLATE)}`}>Descargar plantilla</a>
        <button type="button" className="link-btn" onClick={() => setText(TEMPLATE)}>Probar con el ejemplo</button>
      </div>
      <textarea
        className="input"
        style={{ height: 180, padding: 12, fontFamily: 'ui-monospace, monospace', fontSize: 13, resize: 'vertical' }}
        placeholder={'Pega aquí las filas copiadas de Excel (Ctrl+V)'}
        aria-label="Datos a importar"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {rows.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 14, margin: '12px 0 8px' }}>
            {rows.length} filas{headerFound ? ' (cabecera reconocida)' : ' (sin cabecera: se usa el orden de la plantilla)'}, {units.toLocaleString('es-ES')} unidades.
            {bad > 0 && <strong style={{ color: 'var(--danger)' }}> {bad} filas con errores: corrígelas antes de cargar.</strong>}
          </p>
          <div className="table-scroll" style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--steel-200)', borderRadius: 6 }}>
            <table className="table">
              <thead><tr><th>#</th>{FIELDS.map((f) => <th key={f}>{LABELS[f]}</th>)}<th /></tr></thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className={problems[i] ? 'row-low' : undefined}>
                    <td className="muted">{i + 1}</td>
                    {FIELDS.map((f) => <td key={f} className={f === 'sku' || f === 'location_code' ? 'code' : undefined}>{r[f]}</td>)}
                    <td style={{ color: 'var(--danger)', fontSize: 13 }}>{problems[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 200 && <p className="muted" style={{ fontSize: 13 }}>Se muestran las primeras 200 filas.</p>}
          <div className="inline-actions" style={{ marginTop: 14 }}>
            <input className="input" style={{ width: 260 }} aria-label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || bad > 0} onClick={importNow}>
              {busy ? 'Cargando…' : `Cargar ${rows.length} filas`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
