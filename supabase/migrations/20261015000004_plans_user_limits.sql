-- =====================================================================
--  Migración 004: planes contratados y límite de usuarios por empresa
--  El super admin fija plan y max_users; la base de datos impide superar
--  el límite aunque se intente desde la API o el SQL de un usuario.
-- =====================================================================

alter table public.tenants
  add column plan      text not null default 'basico',
  add column max_users int  check (max_users is null or max_users > 0);   -- null = ilimitado

comment on column public.tenants.max_users is 'Usuarios activos permitidos por el plan contratado (null = sin límite)';

-- Usuarios activos distintos de una empresa (un usuario con varios roles cuenta una vez)
create or replace function public.tenant_active_users(p_tenant uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct user_id)::int from tenant_members where tenant_id = p_tenant and active
$$;

create or replace function public.trg_enforce_user_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_used int;
begin
  if not new.active then return new; end if;
  -- Si el usuario ya está activo en la empresa (otro rol), no consume plaza nueva
  if exists (select 1 from tenant_members
              where tenant_id = new.tenant_id and user_id = new.user_id and active
                and (tg_op = 'INSERT' or role <> old.role)) then
    return new;
  end if;
  -- Bloquea la fila de la empresa: dos altas simultáneas no pueden superar el límite
  select max_users into v_max from tenants where id = new.tenant_id for update;
  if v_max is null then return new; end if;
  v_used := tenant_active_users(new.tenant_id);
  if v_used >= v_max then
    raise exception 'Límite de usuarios alcanzado: el plan permite % y ya hay %. Pide ampliar el plan.', v_max, v_used
      using errcode = 'P0001', hint = 'USER_LIMIT';
  end if;
  return new;
end $$;

create trigger tenant_members_user_limit
  before insert or update of active on public.tenant_members
  for each row execute function public.trg_enforce_user_limit();

-- Solo el super admin cambia plan y límite (el resto de columnas ya están protegidas por RLS)
create or replace function public.trg_protect_tenant_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.plan is distinct from old.plan or new.max_users is distinct from old.max_users)
     and auth.uid() is not null and not is_super_admin() then
    raise exception 'Solo el administrador de la plataforma puede cambiar el plan' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger tenants_protect_plan before update of plan, max_users on public.tenants
  for each row execute function public.trg_protect_tenant_plan();

grant execute on function public.tenant_active_users(uuid) to authenticated;
revoke execute on function public.tenant_active_users(uuid) from anon;
