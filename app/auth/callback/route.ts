import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Destino de los enlaces de invitación / magic link de Supabase Auth.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(url.searchParams.get('next') ?? '/', url.origin));
}
