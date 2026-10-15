-- =====================================================================
-- Pruebas de extremo a extremo de la lógica de base de datos.
-- Ejecutar con: npm run db:test   (ver supabase/tests/run.sh)
-- Cada bloque actúa con un usuario distinto, igual que lo haría la API.
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

-- Usuarios (UUIDs fijos para legibilidad)
\set u_super    '00000000-0000-0000-0000-000000000001'
\set u_admin    '00000000-0000-0000-0000-00000000000a'
\set u_kc       '00000000-0000-0000-0000-00000000000c'
\set u_kf       '00000000-0000-0000-0000-00000000000f'
\set u_buyer    '00000000-0000-0000-0000-00000000000b'
\set u_auditor  '00000000-0000-0000-0000-0000000000ad'
\set u_otro     '00000000-0000-0000-0000-0000000000ee'
\set t_a        '10000000-0000-0000-0000-00000000000a'
\set t_b        '10000000-0000-0000-0000-00000000000b'
\set w_c        '20000000-0000-0000-0000-0000000000c0'
\set w_i        '20000000-0000-0000-0000-000000000010'
\set w_f        '20000000-0000-0000-0000-0000000000f0'
\set l_c1       '30000000-0000-0000-0000-0000000000c1'
\set l_i1       '30000000-0000-0000-0000-000000000011'
\set l_f1       '30000000-0000-0000-0000-0000000000f1'
\set i_guante   '40000000-0000-0000-0000-000000000001'
\set i_taladro  '40000000-0000-0000-0000-000000000002'
\set sup        '50000000-0000-0000-0000-000000000001'

insert into auth.users (id, email) values
  (:'u_super','super@saas.io'), (:'u_admin','admin@acme.es'), (:'u_kc','almacen.central@acme.es'),
  (:'u_kf','almacen.obra@acme.es'), (:'u_buyer','compras@acme.es'), (:'u_auditor','auditor@acme.es'),
  (:'u_otro','admin@otra.es');
update public.profiles set is_super_admin = true where id = :'u_super';

\echo '1. Super admin crea dos empresas'
select set_config('request.jwt.claims', json_build_object('sub', :'u_super')::text, false) as _jwt \gset
set role authenticated;
insert into public.tenants (id, name, slug) values (:'t_a','Acme Industrial','acme'), (:'t_b','Otra SA','otra');
insert into public.tenant_members (tenant_id, user_id, role) values
  (:'t_a', :'u_admin', 'company_admin'), (:'t_b', :'u_otro', 'company_admin');
reset role;

\echo '2. Admin de empresa monta almacenes, ubicaciones, roles, catálogo'
select set_config('request.jwt.claims', json_build_object('sub', :'u_admin')::text, false) as _jwt \gset
set role authenticated;
insert into public.tenant_members (tenant_id, user_id, role) values
  (:'t_a', :'u_kc', 'warehouse_keeper'), (:'t_a', :'u_kf', 'warehouse_keeper'),
  (:'t_a', :'u_buyer', 'buyer'), (:'t_a', :'u_auditor', 'auditor');
insert into public.warehouses (id, tenant_id, code, name, level, parent_id) values
  (:'w_c', :'t_a', 'CEN', 'Central Valencia', 'central', null),
  (:'w_i', :'t_a', 'INT-N', 'Intermedio Norte', 'intermediate', :'w_c'),
  (:'w_f', :'t_a', 'OBRA-1', 'Obra Sagunto', 'final', :'w_i');
insert into public.member_warehouses (tenant_id, user_id, warehouse_id) values
  (:'t_a', :'u_kc', :'w_c'), (:'t_a', :'u_kf', :'w_f');
insert into public.locations (id, tenant_id, warehouse_id, aisle, rack, bin) values
  (:'l_c1', :'t_a', :'w_c', 'P01', 'E03', 'B12'),
  (:'l_i1', :'t_a', :'w_i', 'P01', 'E01', 'B01'),
  (:'l_f1', :'t_a', :'w_f', 'A',   '1',   '1');
insert into public.items (id, tenant_id, sku, name, item_type, uom, unit_cost) values
  (:'i_guante', :'t_a', 'EPI-GNT-09', 'Guante nitrilo T9', 'consumable', 'PAR', 1.85),
  (:'i_taladro', :'t_a', 'HER-TAL-18V', 'Taladro percutor 18V', 'tool', 'UD', 189);
insert into public.suppliers (id, tenant_id, name, email) values (:'sup', :'t_a', 'Suministros Levante SL', 'pedidos@levante.es');
insert into public.item_thresholds (tenant_id, item_id, warehouse_id, min_qty, reorder_qty, max_qty) values
  (:'t_a', :'i_guante', :'w_c', 100, 500, 1000),
  (:'t_a', :'i_guante', :'w_f', 20, 50, 80);
reset role;

\echo '3. Umbral recién creado con stock 0 => alertas abiertas y notificaciones'
do $$ begin
  assert (select count(*) from public.stock_alerts where status = 'open') = 2, 'deberían existir 2 alertas';
  assert (select count(*) from public.notifications where kind = 'stock_alert') >= 2, 'faltan notificaciones';
end $$;

\echo '4. Jerarquía inválida rechazada (intermedio colgando de intermedio)'
do $$ begin
  insert into public.warehouses (tenant_id, code, name, level, parent_id)
  values ('10000000-0000-0000-0000-00000000000a', 'X', 'X', 'intermediate', '20000000-0000-0000-0000-000000000010');
  raise exception 'NO debería permitirse';
exception when others then
  if sqlerrm like 'NO debería%' then raise; end if;
  raise notice '   OK rechazado: %', sqlerrm;
end $$;

\echo '5. Comprador crea OC y la envía; la recepción sin OC ni factura falla'
select set_config('request.jwt.claims', json_build_object('sub', :'u_buyer')::text, false) as _jwt \gset
set role authenticated;
select public.create_purchase_order(:'t_a', :'sup', :'w_c',
  jsonb_build_array(jsonb_build_object('item_id', :'i_guante', 'quantity', 600)),
  current_date + 2, current_date + 5) ->> 'number' as oc \gset
\echo '   OC creada: ' :oc
update public.purchase_orders set status = 'sent' where number = :'oc';
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'u_kc')::text, false) as _jwt \gset
set role authenticated;
do $$ begin
  perform public.receive_goods('20000000-0000-0000-0000-0000000000c0',
    '[{"item_id":"40000000-0000-0000-0000-000000000001","location_id":"30000000-0000-0000-0000-0000000000c1","quantity":10}]');
  raise exception 'NO debería permitirse';
exception when others then
  if sqlerrm like 'NO debería%' then raise; end if;
  raise notice '   OK rechazado: %', sqlerrm;
end $$;

\echo '6. Almacenista central recibe 400 de la OC (parcial) + entrada con factura de taladros'
select id as po_id from public.purchase_orders where number = :'oc' \gset
select public.receive_goods(:'w_c',
  jsonb_build_array(jsonb_build_object('item_id', :'i_guante', 'location_id', :'l_c1', 'quantity', 400)),
  :'po_id') ->> 'number' as rec1 \gset
select public.receive_goods(:'w_c',
  jsonb_build_array(jsonb_build_object('item_id', :'i_taladro', 'location_id', :'l_c1', 'quantity', 3)),
  null, 'FV-2026/0042', :'sup') ->> 'number' as rec2 \gset
\echo '   Recepciones: ' :rec1 ' ' :rec2
reset role;
do $$ begin
  assert (select status from public.purchase_orders where number = 'OC-2026-000001') = 'partially_received', 'OC debería quedar parcial';
  assert (select qty_on_hand from public.stock_levels where item_id = '40000000-0000-0000-0000-000000000001'
          and location_id = '30000000-0000-0000-0000-0000000000c1') = 400, 'stock central guantes = 400';
  assert (select status from public.stock_alerts where warehouse_id = '20000000-0000-0000-0000-0000000000c0') = 'resolved',
         'la alerta del central debe resolverse (400 > 100)';
end $$;

\echo '7. Almacenista de obra NO puede operar el central'
select set_config('request.jwt.claims', json_build_object('sub', :'u_kf')::text, false) as _jwt \gset
set role authenticated;
do $$ begin
  perform public.issue_consumable('30000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-000000000001', 5, 'robo');
  raise exception 'NO debería permitirse';
exception when others then
  if sqlerrm like 'NO debería%' then raise; end if;
  raise notice '   OK rechazado: %', sqlerrm;
end $$;

\echo '8. Obra pide reposición desde su alerta => traslado desde el intermedio'
select public.create_replenishment_from_alert(id) as rep from public.stock_alerts
 where warehouse_id = :'w_f' and status = 'open' \gset
\echo '   ' :rep
reset role;

\echo '9. El intermedio no tiene stock: primero el central le traslada 200'
select set_config('request.jwt.claims', json_build_object('sub', :'u_admin')::text, false) as _jwt \gset
set role authenticated;
select (public.create_transfer(:'w_c', :'w_i',
  jsonb_build_array(jsonb_build_object('item_id', :'i_guante', 'quantity', 200, 'from_location_id', :'l_c1')),
  current_date, current_date + 1) ->> 'id') as trf1 \gset
select public.dispatch_transfer(:'trf1');
select public.receive_transfer(:'trf1', (select jsonb_agg(jsonb_build_object('line_id', id, 'to_location_id',
  '30000000-0000-0000-0000-000000000011')) from public.transfer_order_lines where transfer_id = :'trf1'));
\echo '   Despachar el traslado de la obra (80 uds) desde el intermedio'
select transfer_order_id as trf2 from public.stock_alerts where warehouse_id = :'w_f' and status = 'in_replenishment' \gset
select public.dispatch_transfer(:'trf2');
reset role;

\echo '10. Almacenista de obra recibe 78 de 80 (discrepancia)'
select set_config('request.jwt.claims', json_build_object('sub', :'u_kf')::text, false) as _jwt \gset
set role authenticated;
select public.receive_transfer(:'trf2', (select jsonb_agg(jsonb_build_object('line_id', id, 'to_location_id',
  '30000000-0000-0000-0000-0000000000f1', 'quantity', 78)) from public.transfer_order_lines where transfer_id = :'trf2'));
select public.issue_consumable(:'l_f1', :'i_guante', 60, 'OT-1187 montaje') as _mov \gset
\echo '   Consumir más de lo disponible falla'
do $$ begin
  perform public.issue_consumable('30000000-0000-0000-0000-0000000000f1', '40000000-0000-0000-0000-000000000001', 1000);
  raise exception 'NO debería permitirse';
exception when others then
  if sqlerrm like 'NO debería%' then raise; end if;
  raise notice '   OK rechazado: %', sqlerrm;
end $$;
\echo '11. Devolución al almacén superior (correlativo DEV) y a proveedor'
select public.create_return(:'w_f', 'to_upstream_warehouse', 'Sobrante de obra',
  jsonb_build_array(jsonb_build_object('item_id', :'i_guante', 'location_id', :'l_f1', 'quantity', 5)),
  null, null, true) ->> 'number' as dev1 \gset
\echo '   ' :dev1
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'u_kc')::text, false) as _jwt \gset
set role authenticated;
select public.create_return(:'w_c', 'to_supplier', 'Lote defectuoso',
  jsonb_build_array(jsonb_build_object('item_id', :'i_guante', 'location_id', :'l_c1', 'quantity', 20)),
  :'sup', null, true) ->> 'number' as dev2 \gset
\echo '   ' :dev2

\echo '12. Herramienta: alta de unidad, entrega y devolución'
reset role;
insert into public.tool_assets (tenant_id, item_id, serial_number, warehouse_id, location_id)
values (:'t_a', :'i_taladro', 'TAL-0001', :'w_c', :'l_c1');
set role authenticated;
select public.checkout_tool((select id from public.tool_assets where serial_number = 'TAL-0001'),
  'Juan Pérez - Cuadrilla 3', null, now() + interval '7 days') as asg \gset
do $$ begin
  perform public.checkout_tool((select id from public.tool_assets where serial_number = 'TAL-0001'), 'Otro');
  raise exception 'NO debería permitirse';
exception when others then
  if sqlerrm like 'NO debería%' then raise; end if;
  raise notice '   OK rechazado: %', sqlerrm;
end $$;
select public.checkin_tool(:'asg', :'l_c1', 'OK');
reset role;

\echo '13. Ledger inmutable'
do $$ begin
  update public.stock_movements set quantity = 1 where id = 1;
  raise exception 'NO debería permitirse';
exception when others then
  if sqlerrm like 'NO debería%' then raise; end if;
  raise notice '   OK rechazado: %', sqlerrm;
end $$;

\echo '14. Aislamiento multitenant y auditor de solo lectura'
select set_config('request.jwt.claims', json_build_object('sub', :'u_otro')::text, false) as _jwt \gset
set role authenticated;
do $$ begin
  assert (select count(*) from public.items) = 0, 'Otra SA no debe ver artículos de Acme';
  assert (select count(*) from public.v_stock_network) = 0, 'Otra SA no debe ver stock de Acme';
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'u_auditor')::text, false) as _jwt \gset
set role authenticated;
do $$ begin
  assert (select count(*) from public.stock_movements) > 0, 'el auditor debe ver movimientos';
  update public.items set unit_cost = 0;   -- RLS: no afecta a filas
  assert (select min(unit_cost) from public.items) > 0, 'el auditor no debe poder modificar';
end $$;
do $$ begin
  update public.profiles set is_super_admin = true where id = auth.uid();
  raise exception 'NO debería permitirse';
exception when others then
  if sqlerrm like 'NO debería%' then raise; end if;
  raise notice '   OK rechazado: %', sqlerrm;
end $$;
reset role;

\echo '15. Empresa suspendida pierde el acceso'
update public.tenants set status = 'suspended' where id = :'t_a';
select set_config('request.jwt.claims', json_build_object('sub', :'u_admin')::text, false) as _jwt \gset
set role authenticated;
do $$ begin assert (select count(*) from public.items) = 0, 'empresa suspendida no debe ver datos'; end $$;
reset role;
update public.tenants set status = 'active' where id = :'t_a';


\echo '16. Límite de usuarios por plan'
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000016','u16@acme.es'), ('00000000-0000-0000-0000-000000000017','u17@acme.es');
select set_config('request.jwt.claims', json_build_object('sub', :'u_super')::text, false) as _jwt \gset
set role authenticated;
update public.tenants set plan = 'profesional', max_users = 6 where id = :'t_a';   -- Acme tiene 5 usuarios
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'u_admin')::text, false) as _jwt \gset
set role authenticated;
update public.tenants set max_users = 999 where id = :'t_a';   -- RLS: no afecta a ninguna fila
do $$ begin
  assert (select max_users from public.tenants where id = '10000000-0000-0000-0000-00000000000a') = 6,
         'el admin de empresa no debe poder ampliar su plan';
  raise notice '   OK: el admin de empresa no puede ampliar su propio plan';
end $$;
insert into public.tenant_members (tenant_id, user_id, role) values (:'t_a', '00000000-0000-0000-0000-000000000016', 'supervisor');
\echo '   Usuario 6 de 6 dado de alta'
insert into public.tenant_members (tenant_id, user_id, role) values (:'t_a', '00000000-0000-0000-0000-000000000016', 'carrier');
\echo '   Segundo rol para el mismo usuario: no consume plaza'
do $$ begin
  insert into public.tenant_members (tenant_id, user_id, role)
  values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000017', 'buyer');
  raise exception 'NO debería permitirse';
exception when others then
  if sqlerrm like 'NO debería%' then raise; end if;
  raise notice '   OK rechazado (usuario 7): %', sqlerrm;
end $$;
do $$ begin assert public.tenant_active_users('10000000-0000-0000-0000-00000000000a') = 6, 'deben quedar 6 usuarios'; end $$;
reset role;
\echo ''
\echo '=== Visión del Central sobre la red ==='
\pset format aligned
\unset QUIET
select warehouse_level as nivel, warehouse_code as almacen, sku, qty_on_hand as stock, qty_in_transit as transito,
       qty_on_order as pedido, min_qty as minimo, below_min as bajo_min
  from public.v_stock_network order by warehouse_level, sku;
select number, kind, status, sku, qty, qty_done, est_dispatch_date, est_delivery_date from public.v_order_tracking order by number;
select movement_type, warehouse_code, location_code, sku, quantity, doc_number from public.v_movements_detail order by id;
select warehouse_id = '20000000-0000-0000-0000-0000000000f0' as obra, status, qty_at_trigger, min_qty from public.stock_alerts order by created_at;
select number, has_discrepancy from public.transfer_orders order by number;
\echo 'TODAS LAS PRUEBAS PASARON'
