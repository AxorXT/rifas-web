-- Ejecutar completo en Supabase > SQL Editor, una sola vez.
-- ADVERTENCIA: no vuelvas a ejecutar este archivo sobre un proyecto que ya tenga datos
-- sin revisar primero los efectos de cambios de esquema.
create extension if not exists pgcrypto;

create table if not exists public.raffles (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(title) between 2 and 100),
 description text not null default '',
 number_count integer not null default 50 check(number_count between 2 and 1000),
 ticket_price numeric(12,2) not null check(ticket_price > 0),
 status text not null default 'draft' check(status in ('draft','active','closed')),
 prize1 text not null check(length(prize1)>0),
 prize2 text not null default '',prize3 text not null default '',
 draw_at timestamptz,
 bank_name text not null,beneficiary text not null,
 clabe text not null check(clabe ~ '^[0-9]{18}$'),payment_note text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.bookings (
 id uuid primary key default gen_random_uuid(),
 raffle_id uuid not null references public.raffles(id) on delete cascade,
 number integer not null check(number>=1),
 customer_name text not null check(length(customer_name) between 2 and 90),
 phone text not null check(phone ~ '^[0-9]{10}$'),
 status text not null default 'pending' check(status in ('pending','paid')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(raffle_id,number)
);
create index if not exists bookings_raffle_status_idx on public.bookings(raffle_id,status);
create table if not exists public.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade
);
-- No se exponen las tablas al cliente; solo funciones RPC específicas.
alter table public.raffles enable row level security;
alter table public.bookings enable row level security;
alter table public.admin_users enable row level security;
revoke all on public.raffles,public.bookings,public.admin_users from anon,authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.admin_users where user_id=auth.uid());
$$;

create or replace function public.list_public_raffles() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(to_jsonb(r) - 'created_at' - 'updated_at' order by r.created_at desc),'[]'::jsonb)
 from public.raffles r where r.status='active';
$$;

create or replace function public.get_public_numbers(p_raffle uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('number',b.number,'status',b.status) order by b.number),'[]'::jsonb)
 from public.bookings b join public.raffles r on r.id=b.raffle_id
 where b.raffle_id=p_raffle and r.status='active';
$$;

create or replace function public.request_number(p_raffle uuid,p_number integer,p_name text,p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.raffles%rowtype;
begin
 if p_name is null or length(btrim(p_name)) not between 2 and 90
    or p_phone is null or p_phone !~ '^[0-9]{10}$' then
   raise exception 'Nombre o teléfono inválidos.';
 end if;
 -- Bloquear la fila de la rifa serializa las solicitudes concurrentes.
 select * into r from public.raffles where id=p_raffle for update;
 if not found or r.status<>'active' then raise exception 'La rifa no está disponible.'; end if;
 if p_number is null or p_number<1 or p_number>r.number_count then
   raise exception 'Número fuera del rango de la rifa.';
 end if;
 insert into public.bookings(raffle_id,number,customer_name,phone,status)
 values(p_raffle,p_number,btrim(p_name),p_phone,'pending')
 on conflict(raffle_id,number) do update
 set customer_name=excluded.customer_name, phone=excluded.phone,
     created_at=now(),updated_at=now()
 where public.bookings.status='pending';
 if not found then raise exception 'Este número ya tiene pago confirmado.'; end if;
 return jsonb_build_object('ok',true,'number',p_number);
end;
$$;

create or replace function public.admin_list_raffles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'No autorizado.';end if;
 return (select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]'::jsonb) from public.raffles r);
end;
$$;

create or replace function public.admin_list_bookings(p_raffle uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'No autorizado.';end if;
 return (select coalesce(jsonb_agg(to_jsonb(b) order by b.number),'[]'::jsonb) from public.bookings b where b.raffle_id=p_raffle);
end;
$$;

create or replace function public.admin_save_raffle(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare rid uuid;cnt integer;price numeric;cl text;st text;d timestamptz;
begin
 if not public.is_admin() then raise exception 'No autorizado.';end if;
 cnt=(p_data->>'number_count')::integer;
 price=(p_data->>'ticket_price')::numeric;
 cl=p_data->>'clabe'; st=p_data->>'status';
 if cnt not between 2 and 1000 or price<=0 or price>1000000 or cl !~ '^[0-9]{18}$'
    or st not in ('active','draft','closed') or length(btrim(coalesce(p_data->>'title',''))) not between 2 and 100
    or length(btrim(coalesce(p_data->>'prize1','')))=0
    or length(btrim(coalesce(p_data->>'bank_name','')))=0
    or length(btrim(coalesce(p_data->>'beneficiary','')))=0 then
    raise exception 'Revisa título, cantidad, precio, premios y datos bancarios.';
 end if;
 if length(coalesce(p_data->>'description',''))>500 or length(coalesce(p_data->>'payment_note',''))>200
    or length(coalesce(p_data->>'prize1',''))>120 or length(coalesce(p_data->>'prize2',''))>120
    or length(coalesce(p_data->>'prize3',''))>120 or length(coalesce(p_data->>'bank_name',''))>70
    or length(coalesce(p_data->>'beneficiary',''))>120 then
    raise exception 'Algún texto supera el límite permitido.';
 end if;
 d=nullif(p_data->>'draw_at','')::timestamptz;
 if p_id is null then
   insert into public.raffles(title,description,number_count,ticket_price,status,prize1,prize2,prize3,draw_at,bank_name,beneficiary,clabe,payment_note)
   values(p_data->>'title',coalesce(p_data->>'description',''),cnt,price,st,p_data->>'prize1',coalesce(p_data->>'prize2',''),coalesce(p_data->>'prize3',''),d,p_data->>'bank_name',p_data->>'beneficiary',cl,coalesce(p_data->>'payment_note','')) returning id into rid;
 else
   -- Evitar reducir el rango dejando reservas fuera de él.
   perform 1 from public.raffles where id=p_id for update;
   if not found then raise exception 'Rifa inexistente.'; end if;
   if exists(select 1 from public.bookings where raffle_id=p_id and number>cnt) then
     raise exception 'No puedes reducir números: existen solicitudes fuera del rango. Libéralas primero.';
   end if;
   update public.raffles set title=p_data->>'title',description=coalesce(p_data->>'description',''),number_count=cnt,
     ticket_price=price,status=st,prize1=p_data->>'prize1',prize2=coalesce(p_data->>'prize2',''),
     prize3=coalesce(p_data->>'prize3',''),draw_at=d,bank_name=p_data->>'bank_name',beneficiary=p_data->>'beneficiary',
     clabe=cl,payment_note=coalesce(p_data->>'payment_note',''),updated_at=now() where id=p_id;
   rid=p_id;
 end if;
 return rid;
end;
$$;

create or replace function public.admin_set_booking_status(p_booking uuid,p_status text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'No autorizado.';end if;
 if p_status not in ('paid','pending') then raise exception 'Estado inválido.';end if;
 update public.bookings set status=p_status,updated_at=now() where id=p_booking;
 if not found then raise exception 'Solicitud inexistente.';end if;
 return true;
end;
$$;

create or replace function public.admin_delete_booking(p_booking uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'No autorizado.';end if;
 delete from public.bookings where id=p_booking;
 if not found then raise exception 'Solicitud inexistente.';end if;
 return true;
end;
$$;

-- El permiso EXECUTE es imprescindible para llamar RPC; no hay permisos directos a las tablas.
revoke all on function public.is_admin() from public;
revoke all on function public.list_public_raffles() from public;
revoke all on function public.get_public_numbers(uuid) from public;
revoke all on function public.request_number(uuid,integer,text,text) from public;
revoke all on function public.admin_list_raffles() from public;
revoke all on function public.admin_list_bookings(uuid) from public;
revoke all on function public.admin_save_raffle(uuid,jsonb) from public;
revoke all on function public.admin_set_booking_status(uuid,text) from public;
revoke all on function public.admin_delete_booking(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.list_public_raffles() to anon,authenticated;
grant execute on function public.get_public_numbers(uuid) to anon,authenticated;
grant execute on function public.request_number(uuid,integer,text,text) to anon,authenticated;
grant execute on function public.admin_list_raffles() to authenticated;
grant execute on function public.admin_list_bookings(uuid) to authenticated;
grant execute on function public.admin_save_raffle(uuid,jsonb) to authenticated;
grant execute on function public.admin_set_booking_status(uuid,text) to authenticated;
grant execute on function public.admin_delete_booking(uuid) to authenticated;

-- DESPUÉS de crear tu usuario en Authentication > Users, ejecutar POR SEPARADO:
-- insert into public.admin_users(user_id)
-- select id from auth.users where email='TU_CORREO@EJEMPLO.COM';
