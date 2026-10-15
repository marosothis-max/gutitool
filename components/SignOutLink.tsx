'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutLink() {
  const router = useRouter();
  return (
    <button className="btn btn-ghost" onClick={async () => {
      await createClient().auth.signOut();
      router.replace('/login');
      router.refresh();
    }}>
      Cerrar sesión
    </button>
  );
}
