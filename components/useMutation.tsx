'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Msg = { ok: boolean; text: string } | null;

const FRIENDLY: [RegExp, string][] = [
  [/duplicate key|23505|already exists/i, 'Ya existe un registro con ese código.'],
  [/row-level security|42501|permission denied/i, 'Tu rol no tiene permiso para hacer esto.'],
  [/violates check constraint/i, 'Algún valor no es válido (revisa cantidades y niveles).'],
];

/** Ejecuta una acción, muestra el resultado y refresca los datos del servidor. */
export function useMutation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function run(fn: () => Promise<string | void>, okText?: string) {
    setBusy(true); setMsg(null);
    try {
      const text = await fn();
      setMsg({ ok: true, text: text || okText || 'Guardado.' });
      router.refresh();
      return true;
    } catch (e) {
      const raw = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
      const friendly = FRIENDLY.find(([re]) => re.test(raw))?.[1];
      setMsg({ ok: false, text: friendly ?? raw });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, msg, setMsg, run };
}

export function FormMsg({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <div className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</div>;
}
