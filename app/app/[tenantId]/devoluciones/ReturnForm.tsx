'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type StockRow = { warehouse_id: string; location_id: string; location_code: string; item_id: string; sku: string; item_name: string; uom: string; qty_on_hand: string };
type Line = { key: string; stockKey: string; quantity: string };

export function ReturnForm({
  tenantId, stock, suppliers, warehouses,
}: {
  tenantId: string; stock: StockRow[]; suppliers: { id: string; name: string }[];
  warehouses: { id: string; code: string; name: string; level: string }[];
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [kind, setKind] = useState<'to_supplier' | 'to_upstream_warehouse'>('to_supplier');
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: '1', stockKey: '', quantity: '' }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const wh = warehouses.find((w) => w.id === warehouseId);
  const options = useMemo(() => stock.filter((s) => s.warehouse_id === warehouseId), [stock, warehouseId]);
  const byKey = useMemo(
    () => new Map<string, StockRow>(options.map((s): [string, StockRow] => [`${s.location_id}|${s.item_id}`, s])),
    [options],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const payload = lines
      .map((l) => ({ s: byKey.get(l.stockKey), q: Number(l.quantity) }))
      .filter((l) => l.s && l.q > 0)
      .map((l) => ({ itemId: l.s!.item_id, locationId: l.s!.location_id, quantity: l.q }));
    if (!payload.length) { setMsg({ ok: false, text: 'Añade al menos un artículo con cantidad.' }); return; }
    setBusy(true);
    const res = await fetch(`/api/v1/${tenantId}/returns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId, kind, reason, supplierId: kind === 'to_supplier' ? supplierId || undefined : undefined, post: true, lines: payload }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      const detail = Array.isArray(body.details) ? body.details.map((d: { message: string }) => d.message).join(', ') : '';
      setMsg({ ok: false, text: detail || body.error || 'No se pudo registrar la devolución.' });
      return;
    }
    setMsg({ ok: true, text: `Devolución ${body.number} registrada.` });
    setReason(''); setLines([{ key: String(Date.now()), stockKey: '', quantity: '' }]);
    router.refresh();
  }

  if (!warehouses.length) return <p className="muted">Crea primero un almacén.</p>;

  return (
    <form onSubmit={submit}>
      {msg && <div className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</div>}
      <div className="field">
        <label htmlFor="r-wh">Almacén que devuelve</label>
        <select id="r-wh" className="select" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setLines([{ key: '1', stockKey: '', quantity: '' }]); }}>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code}, {w.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="r-kind">Destino</label>
        <select id="r-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="to_supplier">Devolver al proveedor</option>
          <option value="to_upstream_warehouse" disabled={wh?.level === 'central'}>Devolver al almacén superior</option>
        </select>
      </div>
      {kind === 'to_supplier' && (
        <div className="field">
          <label htmlFor="r-sup">Proveedor</label>
          <select id="r-sup" className="select" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Elige proveedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
        <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Material</legend>
        {lines.map((l, i) => {
          const s = byKey.get(l.stockKey);
          return (
            <div key={l.key} style={{ display: 'grid', gridTemplateColumns: '1fr 96px auto', gap: 6, marginBottom: 6 }}>
              <select className="select" aria-label={`Artículo ${i + 1}`} value={l.stockKey}
                onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, stockKey: e.target.value } : x))}>
                <option value="">{options.length ? 'Artículo y ubicación' : 'Este almacén no tiene stock'}</option>
                {options.map((o) => (
                  <option key={`${o.location_id}|${o.item_id}`} value={`${o.location_id}|${o.item_id}`}>
                    {o.location_code}: {o.item_name} ({Number(o.qty_on_hand)} {o.uom})
                  </option>
                ))}
              </select>
              <input className="input" type="number" min="0" step="any" inputMode="decimal" aria-label={`Cantidad ${i + 1}`}
                max={s ? Number(s.qty_on_hand) : undefined} placeholder="Cant." value={l.quantity}
                onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, quantity: e.target.value } : x))} />
              <button type="button" className="link-btn" aria-label="Quitar línea" disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Quitar</button>
            </div>
          );
        })}
        <button type="button" className="link-btn" onClick={() => setLines((ls) => [...ls, { key: String(Date.now()), stockKey: '', quantity: '' }])}>
          Añadir otro artículo
        </button>
      </fieldset>

      <div className="field">
        <label htmlFor="r-reason">Motivo</label>
        <input id="r-reason" className="input" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Lote defectuoso, sobrante de obra…" />
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Registrando…' : 'Registrar devolución'}</button>
    </form>
  );
}
