'use client';
import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FormMsg, useMutation } from '@/components/useMutation';

export function SupplierForm({ tenantId }: { tenantId: string }) {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const { busy, msg, run } = useMutation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(async () => {
      const { error } = await createClient().from('suppliers').insert({
        tenant_id: tenantId, name: name.trim(), tax_id: taxId.trim() || null, email: email.trim() || null, phone: phone.trim() || null,
      });
      if (error) throw error;
      return `${name} dado de alta.`;
    });
    if (ok) { setName(''); setTaxId(''); setEmail(''); setPhone(''); }
  }

  return (
    <form onSubmit={submit}>
      <FormMsg msg={msg} />
      <div className="field"><label htmlFor="s-name">Razón social</label><input id="s-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="s-tax">CIF / RIF</label><input id="s-tax" className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} /></div>
      <div className="pair" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="s-mail">Correo de pedidos</label><input id="s-mail" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="s-phone">Teléfono</label><input id="s-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <button className="btn btn-primary" disabled={busy}>Dar de alta</button>
    </form>
  );
}
