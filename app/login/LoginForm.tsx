'use client';
import { useState, type FormEvent } from 'react';
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
    // Si algo no responde en 20 s, se informa en lugar de dejar el botón colgado
    const timer = setTimeout(() => {
      setBusy(false);
      setError('El servidor no responde. Revisa tu conexión o la configuración de Supabase (URL y clave pública en Vercel).');
    }, 20000);
    try {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
        throw new Error('Falta configurar NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en Vercel (y volver a desplegar).');
      }
      const supabase = createClient();
      const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        clearTimeout(timer);
        setInfo('Sesión iniciada, entrando…');
        window.location.assign(next); // navegación completa: el servidor ya ve la cookie de sesión
        return;
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { full_name: fullName }, emailRedirectTo: callback },
        });
        if (error) throw error;
        if (data.session) { clearTimeout(timer); window.location.assign(next); return; }
        setInfo('Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación para entrar.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: callback });
        if (error) throw error;
        setInfo('Si el correo existe, recibirás un enlace en unos minutos.');
      }
      setBusy(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[login]', err);
      setError(ERRORS[msg] ?? msg);
      setBusy(false);
    } finally {
      clearTimeout(timer);
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
