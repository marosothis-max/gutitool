'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { FormMsg, useMutation } from '@/components/useMutation';

type Opt = { id: string; label: string };
type Loc = { id: string; warehouseId: string; code: string };
type Item = { id: string; label: string; uom: string };
type Order = { id: string; number: string; warehouseId: string; supplier: string; lines: { itemId: string; pending: number }[] };
type Line = { key: string; itemId: string; locationId: string; quantity: string };

let seq = 0;
const newLine = (itemId = '', quantity = ''): Line => ({ key: String(++seq), itemId, locationId: '', quantity });

export function ReceiptForm({ tenantId, warehouses, locations, items, suppliers, orders }: {
  tenantId: string; warehouses: Opt[]; locations: Loc[]; items: Item[]; suppliers: { id: string; name: string }[]; orders: Order[];
}) {
  const [wh, setWh] = useState(warehouses[0]?.id ?? '');
  const [mode, setMode] = useState<'po' | 'invoice'>('invoice');
  const [poId, setPoId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const { busy, msg, run } = useMutation();

  const whLocs = useMemo(() => locations.filter((l) => l.warehouseId === wh), [locations, wh]);
  const whOrders = orders.filter((o) => o.warehouseId === wh);
  const itemById = useMemo(() => new Map<string, Item>(items.map((i): [string, Item] => [i.id, i])), [items]);

  function choosePo(id: string) {
    setPoId(id);
    const po = orders.find((o) => o.id === id);
    if (po) setLines(po.lines.filter((l) => l.pending > 0).map((l) => newLine(l.itemId, String(l.pending))));
  }
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(async () => {
      const payload = lines
        .filter((l) => l.itemId && Number(l.quantity.replace(',', '.')) > 0)
        .map((l) => ({ itemId: l.itemId, locationId: l.locationId, quantity: Number(l.quantity.replace(',', '.')) }));
      if (!payload.length) throw new Error('Añade al menos un artículo con cantidad.');
      if (payload.some((l) => !l.locationId)) throw new Error('Indica la ubicación de cada artículo.');
      if (mode === 'po' && !poId) throw new Error('Elige la orden de compra.');
      if (mode === 'invoice' && !invoice.trim()) throw new Error('Indica el número de factura del proveedor.');
      const res = await fetch(`/api/v1/${tenantId}/receipts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: wh, lines: payload, notes: notes || undefined,
          ...(mode === 'po' ? { purchaseOrderId: poId } : { supplierInvoiceNumber: invoice.trim(), supplierId: supplierId || undefined }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'No se pudo registrar la entrada.');
      return `Entrada ${body.number} registrada. El stock ya está actualizado.`;
    });
    if (ok) { setLines([newLine()]); setInvoice(''); setPoId(''); setNotes(''); }
  }

  if (!warehouses.length) return <p className="muted" style={{ margin: 0 }}>Crea primero un almacén y sus ubicaciones.</p>;

  return (
    <form onSubmit={submit}>
      <FormMsg msg={msg} />
      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="r-wh">Almacén que recibe</label>
          <select id="r-wh" className="select" value={wh} onChange={(e) => { setWh(e.target.value); setPoId(''); setLines([newLine()]); }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-mode">Documento</label>
          <select id="r-mode" className="select" value={mode} onChange={(e) => setMode(e.target.value as 'po' | 'invoice')}>
            <option value="invoice">Factura del proveedor</option>
            <option value="po" disabled={!whOrders.length}>Orden de compra{!whOrders.length ? ' (ninguna abierta)' : ''}</option>
          </select>
        </div>
      </div>

      {mode === 'po' ? (
        <div className="field">
          <label htmlFor="r-po">Orden de compra</label>
          <select id="r-po" className="select" required value={poId} onChange={(e) => choosePo(e.target.value)}>
            <option value="">Elige la orden…</option>
            {whOrders.map((o) => <option key={o.id} value={o.id}>{o.number}, {o.supplier}</option>)}
          </select>
        </div>
      ) : (
        <div className="pair" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="r-inv">Nº de factura</label>
            <input id="r-inv" className="input code" required value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="FV-2026/0042" />
          </div>
          <div className="field">
            <label htmlFor="r-sup">Proveedor</label>
            <select id="r-sup" className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Sin indicar</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
        <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Material recibido</legend>
        {!whLocs.length && <div className="form-error">Este almacén no tiene ubicaciones. Créalas en Almacenes y ubicaciones.</div>}
        {lines.map((l, i) => (
          <div key={l.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) 90px auto', gap: 6, marginBottom: 6 }}>
            <select className="select" aria-label={`Artículo ${i + 1}`} value={l.itemId} disabled={mode === 'po'}
              onChange={(e) => setLine(l.key, { itemId: e.target.value })}>
              <option value="">Artículo…</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}
            </select>
            <select className="select" aria-label={`Ubicación ${i + 1}`} value={l.locationId} onChange={(e) => setLine(l.key, { locationId: e.target.value })}>
              <option value="">Ubicación…</option>
              {whLocs.map((loc) => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
            </select>
            <input className="input num" inputMode="decimal" aria-label={`Cantidad ${i + 1}`} placeholder={itemById.get(l.itemId)?.uom ?? 'Cant.'}
              value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
            <button type="button" className="link-btn" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Quitar</button>
          </div>
        ))}
        {mode === 'invoice' && <button type="button" className="link-btn" onClick={() => setLines((ls) => [...ls, newLine()])}>Añadir artículo</button>}
      </fieldset>

      <div className="field">
        <label htmlFor="r-notes">Observaciones</label>
        <input id="r-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Albarán, transportista, incidencias…" />
      </div>
      <button className="btn btn-primary" disabled={busy || !whLocs.length}>{busy ? 'Registrando…' : 'Registrar entrada'}</button>
    </form>
  );
}
