#!/usr/bin/env node
// Crea (o promueve) la cuenta de Super Administrador de la plataforma.
//
//   npm run superadmin -- correo@dominio.com "ContraseñaSegura123" "Nombre Apellido"
//
// Usa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY de .env.local.
// Si el usuario ya existe, solo le actualiza la contraseña y lo marca como super admin.
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv('.env.local');
loadEnv('.env');

const [email, password, fullName = 'Super Administrador'] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!email || !password) {
  console.error('Uso: npm run superadmin -- correo@dominio.com "Contraseña" "Nombre"');
  process.exit(1);
}
if (password.length < 8) { console.error('La contraseña debe tener al menos 8 caracteres.'); process.exit(1); }
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local'); process.exit(1); }

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(mail) {
  const { data } = await supabase.from('profiles').select('id').ilike('email', mail).maybeSingle();
  return data?.id ?? null;
}

let userId = await findUserId(email);
if (userId) {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) { console.error('No se pudo actualizar la contraseña:', error.message); process.exit(1); }
  console.log(`Usuario existente: ${email} (contraseña actualizada)`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error) { console.error('No se pudo crear el usuario:', error.message); process.exit(1); }
  userId = data.user.id;
  console.log(`Usuario creado: ${email}`);
}

// El trigger handle_new_user crea el perfil; por si acaso se asegura aquí.
const { error: upErr } = await supabase.from('profiles')
  .upsert({ id: userId, email, full_name: fullName, is_super_admin: true }, { onConflict: 'id' });
if (upErr) {
  console.error('No se pudo marcar como super admin:', upErr.message);
  console.error('¿Has aplicado las migraciones de supabase/migrations en tu proyecto?');
  process.exit(1);
}
console.log('Listo: ya puedes entrar en /login como Super Administrador.');
