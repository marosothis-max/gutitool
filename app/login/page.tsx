import Link from 'next/link';
import { BrandMark } from '@/components/Icon';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Entrar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link href="/" className="brand"><BrandMark />Gutitool</Link>
        <div>
          <h2>Tu stock, ubicado al bin en todos tus almacenes.</h2>
          <p>Central, intermedios y obras conectados, con alertas de mínimo y trazabilidad de cada movimiento.</p>
        </div>
        <span style={{ color: '#6f8296', fontSize: 13 }}>Inventario industrial multialmacén</span>
      </aside>
      <main className="auth-main">
        <LoginForm next={next?.startsWith('/') ? next : '/app'} />
      </main>
    </div>
  );
}
