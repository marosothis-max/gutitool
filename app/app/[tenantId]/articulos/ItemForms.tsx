'use client';
import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FormMsg, useMutation } from '@/components/useMutation';

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

export function NewItemForm({ tenantId }: { tenantId: string }) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('consumable');
  const [uom, setUom] = useState('UD');
  const [cost, setCost] = useState('');
  const { busy, msg, run } = useMutation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(async () => {
      const { error } = await createClient().from('items').insert({
        tenant_id: tenantId, sku: sku.trim().toUpperCase(), name: name.trim(), item_type: type,
        uom: uom.trim().toUpperCase() || 'UD', unit_cost: num(cost) ?? 0,
      });
      if (error) throw error;
      return `Artículo ${sku.toUpperCase()} creado.`;
    });
    if (ok) { setSku(''); setName(''); setCost(''); }
  }

  return (
    <form onSubmit={submit}>
      <FormMsg msg={msg} />
      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="i-sku">Código (SKU)</label>
          <input id="i-sku" className="input code" required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="VAL-BOL-2" />
        </div>
        <div className="field">
          <label htmlFor="i-type">Tipo</label>
          <select id="i-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="consumable">Consumible</option>
            <option value="tool">Herramienta</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="i-name">Nombre</label>
        <input id="i-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Válvula de bola 2&quot; 300#" />
      </div>
      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="i-uom">Unidad</label>
          <input id="i-uom" className="input" value={uom} onChange={(e) => setUom(e.target.value)} placeholder="UD, KG, M, PAR" />
        </div>
        <div className="field">
          <label htmlFor="i-cost">Coste unitario</label>
          <input id="i-cost" className="input num" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy}>Crear artículo</button>
    </form>
  );
}

export function ThresholdForm({ tenantId, items, warehouses }: {
  tenantId: string; items: { id: string; label: string }[]; warehouses: { id: string; label: string }[];
}) {
  const [item, setItem] = useState(items[0]?.id ?? '');
  const [wh, setWh] = useState(warehouses[0]?.id ?? '');
  const [min, setMin] = useState('');
  const [reorder, setReorder] = useState('');
  const [max, setMax] = useState('');
  const { busy, msg, run } = useMutation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const m = num(min), r = num(reorder), x = num(max);
      if (m === null || m < 0) throw new Error('Indica el stock mínimo.');
      if (x !== null && x <= m) throw new Error('El máximo debe ser mayor que el mínimo.');
      const { error } = await createClient().from('item_thresholds').upsert(
        { tenant_id: tenantId, item_id: item, warehouse_id: wh, min_qty: m, reorder_qty: r && r > 0 ? r : Math.max(m, 1), max_qty: x },
        { onConflict: 'item_id,warehouse_id' },
      );
      if (error) throw error;
      return 'Mínimo guardado. Si el stock ya está por debajo, la alerta aparece al momento.';
    });
  }

  if (!items.length || !warehouses.length) return <p className="muted" style={{ margin: 0 }}>Necesitas al menos un artículo y un almacén.</p>;
  return (
    <form onSubmit={submit}>
      <FormMsg msg={msg} />
      <div className="field">
        <label htmlFor="t-item">Artículo</label>
        <select id="t-item" className="select" value={item} onChange={(e) => setItem(e.target.value)}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="t-wh">Almacén</label>
        <select id="t-wh" className="select" value={wh} onChange={(e) => setWh(e.target.value)}>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div className="field"><label htmlFor="t-min">Mínimo</label><input id="t-min" className="input num" inputMode="decimal" required value={min} onChange={(e) => setMin(e.target.value)} /></div>
        <div className="field"><label htmlFor="t-re">Reponer</label><input id="t-re" className="input num" inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} placeholder="= mín." /></div>
        <div className="field"><label htmlFor="t-max">Máximo</label><input id="t-max" className="input num" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Opcional" /></div>
      </div>
      <button className="btn btn-primary" disabled={busy}>Guardar mínimo</button>
    </form>
  );
}
