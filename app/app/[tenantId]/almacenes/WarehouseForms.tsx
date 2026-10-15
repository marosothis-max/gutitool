'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FormMsg, useMutation } from '@/components/useMutation';

type W = { id: string; code: string; name: string; level: string };
const LEVELS: [string, string][] = [['central', 'Central'], ['intermediate', 'Intermedio'], ['final', 'Final (obra, planta, pozo, mina)']];

export function NewWarehouseForm({ tenantId, warehouses }: { tenantId: string; warehouses: W[] }) {
  const hasCentral = warehouses.some((w) => w.level === 'central');
  const [level, setLevel] = useState(hasCentral ? 'intermediate' : 'central');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const parents = warehouses.filter((w) => (level === 'intermediate' ? w.level === 'central' : level === 'final' ? w.level !== 'final' : false));
  const [parentId, setParentId] = useState('');
  const { busy, msg, run } = useMutation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(async () => {
      const { error } = await createClient().from('warehouses').insert({
        tenant_id: tenantId, code: code.trim().toUpperCase(), name: name.trim(), level,
        parent_id: level === 'central' ? null : parentId || parents[0]?.id || null, address: address.trim() || null,
      });
      if (error) throw error;
      return `Almacén ${code.toUpperCase()} creado.`;
    });
    if (ok) { setCode(''); setName(''); setAddress(''); }
  }

  return (
    <form onSubmit={submit}>
      <FormMsg msg={msg} />
      <div className="field">
        <label htmlFor="w-level">Nivel</label>
        <select id="w-level" className="select" value={level} onChange={(e) => { setLevel(e.target.value); setParentId(''); }}>
          {LEVELS.map(([v, l]) => <option key={v} value={v} disabled={v === 'central' && hasCentral}>{l}{v === 'central' && hasCentral ? ' (ya existe)' : ''}</option>)}
        </select>
      </div>
      {level !== 'central' && (
        <div className="field">
          <label htmlFor="w-parent">Recibe material de</label>
          <select id="w-parent" className="select" required value={parentId || parents[0]?.id || ''} onChange={(e) => setParentId(e.target.value)}>
            {parents.length ? parents.map((p) => <option key={p.id} value={p.id}>{p.code}, {p.name}</option>)
              : <option value="">Crea antes un almacén superior</option>}
          </select>
        </div>
      )}
      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="w-code">Código</label>
          <input id="w-code" className="input code" required maxLength={20} placeholder="POZO-14" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="w-name">Nombre</label>
          <input id="w-name" className="input" required placeholder="Pozo 14 Morichal" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="w-addr">Dirección o localización</label>
        <input id="w-addr" className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy || (level !== 'central' && !parents.length)}>Crear almacén</button>
    </form>
  );
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Genera en bloque ubicaciones PASILLO-ESTANTERÍA-BIN (p. ej. P01-E01-B01 … P01-E05-B10). */
export function LocationGenerator({ tenantId, warehouses }: { tenantId: string; warehouses: { id: string; label: string }[] }) {
  const [wh, setWh] = useState(warehouses[0]?.id ?? '');
  const [aisles, setAisles] = useState('P01');
  const [racks, setRacks] = useState('5');
  const [bins, setBins] = useState('10');
  const [rackPrefix, setRackPrefix] = useState('E');
  const [binPrefix, setBinPrefix] = useState('B');
  const { busy, msg, run } = useMutation();

  const list = useMemo(() => {
    const as = aisles.split(/[,\s]+/).map((a) => a.trim().toUpperCase()).filter(Boolean);
    const nr = Math.min(Math.max(Number(racks) || 0, 0), 99);
    const nb = Math.min(Math.max(Number(bins) || 0, 0), 99);
    const out: { aisle: string; rack: string; bin: string }[] = [];
    for (const a of as) for (let r = 1; r <= nr; r++) for (let b = 1; b <= nb; b++) {
      out.push({ aisle: a, rack: `${rackPrefix.toUpperCase()}${pad(r, 2)}`, bin: `${binPrefix.toUpperCase()}${pad(b, 2)}` });
    }
    return out;
  }, [aisles, racks, bins, rackPrefix, binPrefix]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (!list.length) throw new Error('Indica al menos un pasillo, una estantería y un bin.');
      if (list.length > 5000) throw new Error('Máximo 5000 ubicaciones por vez.');
      const { error } = await createClient().from('locations').upsert(
        list.map((l) => ({ tenant_id: tenantId, warehouse_id: wh, ...l })),
        { onConflict: 'warehouse_id,aisle,rack,bin', ignoreDuplicates: true },
      );
      if (error) throw error;
      return `${list.length} ubicaciones listas (las que ya existían se han respetado).`;
    });
  }

  if (!warehouses.length) return <p className="muted" style={{ margin: 0 }}>Crea primero un almacén.</p>;
  const first = list[0], last = list[list.length - 1];

  return (
    <form onSubmit={submit}>
      <FormMsg msg={msg} />
      <div className="field">
        <label htmlFor="l-wh">Almacén</label>
        <select id="l-wh" className="select" value={wh} onChange={(e) => setWh(e.target.value)}>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="l-aisles">Pasillos (separados por comas)</label>
        <input id="l-aisles" className="input code" value={aisles} onChange={(e) => setAisles(e.target.value)} placeholder="P01, P02, P03" />
      </div>
      <div className="pair" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="l-racks">Estanterías por pasillo</label>
          <div className="inline-actions" style={{ flexWrap: 'nowrap' }}>
            <input className="input code" style={{ width: 56 }} aria-label="Prefijo estantería" value={rackPrefix} onChange={(e) => setRackPrefix(e.target.value)} />
            <input id="l-racks" className="input num" type="number" min={1} max={99} value={racks} onChange={(e) => setRacks(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="l-bins">Bins por estantería</label>
          <div className="inline-actions" style={{ flexWrap: 'nowrap' }}>
            <input className="input code" style={{ width: 56 }} aria-label="Prefijo bin" value={binPrefix} onChange={(e) => setBinPrefix(e.target.value)} />
            <input id="l-bins" className="input num" type="number" min={1} max={99} value={bins} onChange={(e) => setBins(e.target.value)} />
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 14, margin: '0 0 14px' }}>
        {list.length ? <>Se crearán <strong className="num">{list.length}</strong> ubicaciones, de <span className="code">{first.aisle}-{first.rack}-{first.bin}</span> a <span className="code">{last.aisle}-{last.rack}-{last.bin}</span>.</> : 'Completa los campos.'}
      </p>
      <button className="btn btn-primary" disabled={busy || !list.length}>Generar ubicaciones</button>
    </form>
  );
}
