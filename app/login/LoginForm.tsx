'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'reset';

const TEXT: Record<Mode, { title: string; lead: string; action: string }> = {
  signin: { title: 'Entrar', lead: 'Accede con el correo de tu empresa.', action: 'Entrar' },
  signup: { title: 'Crear cuenta', lead: 'Después, tu administrador te asignará a una empresa y un rol.', action: 'Crear cuenta' },
  reset: { title: 'Recuperar contraseña', lead: 'Te enviaremos un enlace para elegir una nueva.', action: 'Enviar enlace' },
};

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Confirma tu correo con el enlace que te enviamos antes de entrar.',
  'User already registered': 'Ya existe una cuenta con ese correo. Entra o recupera la contraseña.',
};

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    const supabase = createClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: fullName }, emailRedirectTo: callback },
        });
        if (error) throw error;
        if (data.session) { router.replace(next); router.refresh(); return; }
        setInfo('Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación para entrar.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback });
        if (error) throw error;
        setInfo('Si el correo existe, recibirás un enlace en unos minutos.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(ERRORS[msg] ?? msg);
    } finally {
      setBusy(false);
    }
  }

  const t = TEXT[mode];
  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1>{t.title}</h1>
      <p>{t.lead}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {info && <div className="form-ok" role="status">{info}</div>}

      {mode === 'signup' && (
        <div className="field">
          <label htmlFor="name">Nombre y apellidos</label>
          <input id="name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </div>
      )}
      <div className="field">
        <label htmlFor="email">Correo</label>
        <input id="email" className="input" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      {mode !== 'reset' && (
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" className="input" type="password" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
        </div>
      )}

      <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
        {busy ? 'Un momento…' : t.action}
      </button>

      <div className="auth-switch">
        {mode === 'signin' ? (
          <>
            <button type="button" onClick={() => setMode('reset')}>He olvidado la contraseña</button>
            <span> · </span>
            <button type="button" onClick={() => setMode('signup')}>Crear cuenta</button>
          </>
        ) : (
          <button type="button" onClick={() => setMode('signin')}>Ya tengo cuenta, entrar</button>
        )}
      </div>
    </form>
  );
}
