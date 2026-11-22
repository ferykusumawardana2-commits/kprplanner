-- =====================================================================
--  KPR PINTAR — skema database untuk Supabase
--
--  Cara pakai: buka Supabase → SQL Editor → New query → tempel SELURUH
--  isi file ini → Run. Aman dijalankan ulang (idempotent).
--
--  Isinya: tabel (profil, paket, pengaturan, pesanan), aturan keamanan
--  (Row Level Security), fungsi pesanan & verifikasi admin, serta bucket
--  penyimpanan privat "bukti" untuk foto bukti transfer.
--
--  SETELAH dijalankan, jadikan dirimu admin (lihat bagian paling bawah).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABEL
-- ---------------------------------------------------------------------

create table if not exists public.plans (
  id           text primary key,                 -- contoh: 'bulanan', 'lifetime'
  nama         text not null,
  deskripsi    text,
  harga        bigint not null check (harga >= 0),
  durasi_hari  integer check (durasi_hari is null or durasi_hari > 0),  -- NULL = lifetime
  akses_grup   text not null default 'semua' check (akses_grup in ('semua', 'rencana', 'tools')),
  fitur        text[] not null default '{}',
  sorotan      text,                             -- label kecil di kartu, mis. 'Sekali bayar'
  aktif        boolean not null default true,
  urutan       integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  nama          text,
  avatar_url    text,
  is_admin      boolean not null default false,
  plan_id       text references public.plans(id) on delete set null,
  akses_sampai  timestamptz,                      -- batas akses berlangganan
  lifetime      boolean not null default false,   -- true = akses tanpa batas waktu
  akses_rencana_sampai timestamptz,
  akses_tools_sampai   timestamptz,
  rencana_lifetime      boolean not null default false,
  tools_lifetime        boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.settings (
  key     text primary key,
  value   jsonb not null default '{}'::jsonb,
  publik  boolean not null default false          -- true = bisa dibaca pengunjung yang belum masuk
);

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  plan_id        text references public.plans(id) on delete set null,
  plan_nama      text not null,                   -- salinan saat memesan
  durasi_hari    integer,                         -- salinan saat memesan (NULL = lifetime)
  akses_grup     text not null default 'semua' check (akses_grup in ('semua', 'rencana', 'tools')),
  harga_dasar    bigint not null,
  kode_unik      integer not null default 0,
  total          bigint not null,                 -- harga_dasar + kode_unik = nominal transfer
  status         text not null default 'menunggu_bayar'
                 check (status in ('menunggu_bayar','menunggu_verifikasi','disetujui','ditolak','dibatalkan')),
  bukti_path     text,
  nama_pengirim  text,
  bank_pengirim  text,
  nomor_telepon text,
  whatsapp_opt_in boolean not null default false,
  whatsapp_notified_at timestamptz,
  tgl_transfer   date,
  catatan        text,
  alasan_tolak   text,
  dikirim_at     timestamptz,
  diproses_at    timestamptz,
  diproses_oleh  uuid,
  created_at     timestamptz not null default now(),
  constraint orders_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

alter table public.plans
  add column if not exists akses_grup text not null default 'semua'
  check (akses_grup in ('semua', 'rencana', 'tools'));
alter table public.profiles
  add column if not exists akses_rencana_sampai timestamptz,
  add column if not exists akses_tools_sampai timestamptz,
  add column if not exists rencana_lifetime boolean not null default false,
  add column if not exists tools_lifetime boolean not null default false;
alter table public.orders
  add column if not exists akses_grup text not null default 'semua'
  check (akses_grup in ('semua', 'rencana', 'tools'));
alter table public.orders
  add column if not exists nomor_telepon text,
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_notified_at timestamptz;

create index if not exists orders_user_idx   on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);


-- ---------------------------------------------------------------------
-- 2. DATA AWAL  (harga & rekening hanya contoh — ubah dari halaman Admin)
-- ---------------------------------------------------------------------

insert into public.plans (id, nama, deskripsi, harga, durasi_hari, fitur, sorotan, aktif, urutan) values
  ('bulanan',  'Bulanan',  'Akses semua fitur kalkulator selama 30 hari.', 39000,  30,
     array['Akses penuh kalkulator 30 hari'], null, true, 1),
  ('3-bulan',  '3 Bulan',  'Akses semua fitur kalkulator selama 90 hari.', 89000, 90,
     array['Akses penuh kalkulator 90 hari'], null, true, 2),
  ('tahunan',  'Tahunan',  'Akses semua fitur kalkulator selama 365 hari.', 179000, 365,
     array['Akses penuh kalkulator 365 hari'], 'Hemat dibanding bulanan', true, 3),
  ('lifetime', 'Lifetime', 'Akses semua fitur kalkulator tanpa batas waktu.', 299000, null,
     array['Akses tanpa batas waktu','Semua fitur kalkulator'], 'Sekali bayar', true, 4)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.settings where key = 'legacy_plans_reactivated_v1'
  ) then
    update public.plans
       set aktif = true, akses_grup = 'semua'
     where id in ('bulanan', '3-bulan', 'tahunan', 'lifetime');

    insert into public.settings (key, value, publik)
    values ('legacy_plans_reactivated_v1', 'true'::jsonb, false)
    on conflict (key) do nothing;
  end if;
end
$$;

insert into public.plans (id, nama, deskripsi, harga, durasi_hari, akses_grup, fitur, aktif, urutan) values
  ('rencana-rumahku', 'Rencana Rumahku', 'Akses fitur perencanaan rumah dan simulasi KPR.', 0, 30, 'rencana',
     array['Isian Data','Informasi Simulasi','Catatan Kas'], false, 1),
  ('financial-tools', 'Financial Tools', 'Akses alat bantu analisis keuangan KPR.', 0, 30, 'tools',
     array['Health Check','Pelunasan Dipercepat','Take Over KPR'], false, 2)
on conflict (id) do update set akses_grup = excluded.akses_grup;

insert into public.settings (key, value, publik) values
  ('bisnis',
   '{"nama":"KPR PINTAR","by":"AF Creative Media","whatsapp":"","email":""}'::jsonb, true),
  ('pembayaran',
   '{"rekening":[{"bank":"BCA","nomor":"0000000000","atas_nama":"GANTI DENGAN NAMA REKENINGMU"}],"kode_unik":true,"catatan":"Transfer sesuai nominal tepat sampai 3 digit terakhir agar pembayaranmu cepat dikenali."}'::jsonb, false)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------
-- 3. FUNGSI BANTU
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.has_access()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select (
                       p.lifetime
                       or coalesce(p.akses_sampai > now(), false)
                       or p.rencana_lifetime
                       or coalesce(p.akses_rencana_sampai > now(), false)
                       or p.tools_lifetime
                       or coalesce(p.akses_tools_sampai > now(), false)
                     )
                     from public.profiles p where p.id = auth.uid()), false);
$$;

-- Membuat baris profil otomatis saat seseorang pertama kali masuk dengan Google.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nama, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Jika sudah ada akun sebelum skema ini dipasang, buatkan profilnya.
insert into public.profiles (id, email, nama, avatar_url)
select u.id, u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)),
       coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 4. FUNGSI PESANAN (dipanggil dari website; semua hitungan di server)
-- ---------------------------------------------------------------------

-- Pembeli membuat pesanan. Harga dan kode unik ditentukan server, bukan browser.
create or replace function public.create_order(p_plan_id text)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_plan  public.plans%rowtype;
  v_open  public.orders%rowtype;
  v_order public.orders%rowtype;
  v_akses_grup text;
  v_kode  integer := 0;
  v_total bigint;
  v_pakai boolean;
  v_try   integer := 0;
begin
  if v_uid is null then
    raise exception 'Silakan masuk dulu.';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and aktif;
  if not found then
    raise exception 'Paket tidak tersedia.';
  end if;
  v_akses_grup := case v_plan.id
    when 'rencana-rumahku' then 'rencana'
    when 'financial-tools' then 'tools'
    else v_plan.akses_grup
  end;
  if v_plan.harga <= 0 then
    raise exception 'Harga paket belum ditentukan oleh admin.';
  end if;
  -- Satu pembeli hanya punya satu pesanan terbuka.
  select * into v_open from public.orders
   where user_id = v_uid and status in ('menunggu_bayar','menunggu_verifikasi')
   order by created_at desc limit 1;
  if found then
    if v_open.plan_id = p_plan_id then
      return v_open;
    end if;
    if v_open.status = 'menunggu_verifikasi' then
      raise exception 'Pembayaranmu masih diverifikasi admin. Tunggu sampai selesai sebelum memesan paket lain.';
    end if;
    update public.orders set status = 'dibatalkan' where id = v_open.id;
  end if;

  select coalesce((value ->> 'kode_unik')::boolean, true) into v_pakai
    from public.settings where key = 'pembayaran';
  v_pakai := coalesce(v_pakai, true);

  v_total := v_plan.harga;
  if v_pakai and v_plan.harga > 0 then
    loop
      v_kode  := 1 + floor(random() * 999)::integer;
      v_total := v_plan.harga + v_kode;
      exit when not exists (
        select 1 from public.orders
         where total = v_total and status in ('menunggu_bayar','menunggu_verifikasi'));
      v_try := v_try + 1;
      exit when v_try > 60;
    end loop;
  else
    v_kode := 0;
  end if;

  insert into public.orders (user_id, plan_id, plan_nama, durasi_hari, akses_grup, harga_dasar, kode_unik, total)
  values (v_uid, v_plan.id, v_plan.nama, v_plan.durasi_hari, v_akses_grup, v_plan.harga, v_kode, v_total)
  returning * into v_order;

  return v_order;
end;
$$;

-- Pembeli mengirim konfirmasi + bukti transfer (file sudah diunggah ke bucket "bukti").
drop function if exists public.submit_proof(uuid, text, text, text, date, text);
create or replace function public.submit_proof(
  p_order_id      uuid,
  p_bukti_path    text,
  p_nama_pengirim text,
  p_bank_pengirim text,
  p_tgl_transfer  date,
  p_catatan       text,
  p_nomor_telepon text,
  p_whatsapp_opt_in boolean
)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Silakan masuk dulu.';
  end if;

  select * into v_order from public.orders where id = p_order_id and user_id = v_uid for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.';
  end if;
  if v_order.status not in ('menunggu_bayar','ditolak') then
    raise exception 'Pesanan ini sudah tidak bisa diubah.';
  end if;
  if p_bukti_path is null or position(v_uid::text || '/' in p_bukti_path) <> 1 then
    raise exception 'Bukti transfer tidak valid. Unggah ulang fotonya.';
  end if;
  if coalesce(btrim(p_nama_pengirim), '') = '' then
    raise exception 'Isi nama pemilik rekening pengirim.';
  end if;
  if coalesce(btrim(p_bank_pengirim), '') = '' then
    raise exception 'Isi bank atau e-wallet pengirim.';
  end if;
  if coalesce(p_nomor_telepon, '') !~ '^62[1-9][0-9]{7,12}$' then
    raise exception 'Masukkan nomor WhatsApp Indonesia yang valid.';
  end if;
  if not coalesce(p_whatsapp_opt_in, false) then
    raise exception 'Persetujuan notifikasi WhatsApp diperlukan.';
  end if;

  update public.orders
     set status        = 'menunggu_verifikasi',
         bukti_path    = p_bukti_path,
         nama_pengirim = btrim(p_nama_pengirim),
         bank_pengirim = btrim(p_bank_pengirim),
         nomor_telepon = p_nomor_telepon,
         whatsapp_opt_in = true,
         whatsapp_notified_at = null,
         tgl_transfer  = p_tgl_transfer,
         catatan       = nullif(btrim(coalesce(p_catatan, '')), ''),
         alasan_tolak  = null,
         dikirim_at    = now()
   where id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.claim_payment_whatsapp_notification(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  update public.orders
     set whatsapp_notified_at = now()
   where id = p_order_id
     and status = 'menunggu_verifikasi'
     and whatsapp_opt_in
     and nomor_telepon ~ '^62[1-9][0-9]{7,12}$'
     and whatsapp_notified_at is null
   returning * into v_order;

  if not found then
    raise exception 'Notifikasi WhatsApp tidak tersedia atau sudah pernah dikirim.';
  end if;
  return v_order;
end;
$$;

create or replace function public.release_payment_whatsapp_notification(
  p_order_id uuid,
  p_claimed_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.orders
     set whatsapp_notified_at = null
   where id = p_order_id
     and status = 'menunggu_verifikasi'
     and whatsapp_notified_at = p_claimed_at;
  return found;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  update public.orders set status = 'dibatalkan'
   where id = p_order_id and user_id = auth.uid() and status in ('menunggu_bayar','ditolak')
   returning * into v_order;
  if not found then
    raise exception 'Pesanan tidak bisa dibatalkan.';
  end if;
  return v_order;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. FUNGSI ADMIN
-- ---------------------------------------------------------------------

create or replace function public.admin_approve_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_akses_grup text;
begin
  if not public.is_admin() then
    raise exception 'Khusus admin.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.';
  end if;
  if v_order.status = 'disetujui' then
    raise exception 'Pesanan ini sudah disetujui sebelumnya.';
  end if;
  if v_order.status = 'dibatalkan' then
    raise exception 'Pesanan ini sudah dibatalkan pembeli.';
  end if;

  v_akses_grup := case v_order.plan_id
    when 'rencana-rumahku' then 'rencana'
    when 'financial-tools' then 'tools'
    else v_order.akses_grup
  end;

  if v_akses_grup = 'rencana' then
    if v_order.durasi_hari is null then
      update public.profiles
         set rencana_lifetime = true, akses_rencana_sampai = null
       where id = v_order.user_id;
    else
      update public.profiles
         set akses_rencana_sampai = greatest(now(), coalesce(akses_rencana_sampai, now()))
                                   + make_interval(days => v_order.durasi_hari)
       where id = v_order.user_id and not rencana_lifetime;
    end if;
  elsif v_akses_grup = 'tools' then
    if v_order.durasi_hari is null then
      update public.profiles
         set tools_lifetime = true, akses_tools_sampai = null
       where id = v_order.user_id;
    else
      update public.profiles
         set akses_tools_sampai = greatest(now(), coalesce(akses_tools_sampai, now()))
                                  + make_interval(days => v_order.durasi_hari)
       where id = v_order.user_id and not tools_lifetime;
    end if;
  elsif v_order.durasi_hari is null then
    update public.profiles set lifetime = true, plan_id = v_order.plan_id
     where id = v_order.user_id;
  else
    -- Perpanjangan dihitung dari sisa akses, bukan dari hari ini.
    update public.profiles
       set akses_sampai = greatest(now(), coalesce(akses_sampai, now())) + make_interval(days => v_order.durasi_hari),
           plan_id      = case when lifetime then plan_id else v_order.plan_id end
     where id = v_order.user_id;
  end if;

  update public.orders
     set status = 'disetujui', diproses_at = now(), diproses_oleh = auth.uid(), alasan_tolak = null
   where id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.admin_reject_order(p_order_id uuid, p_alasan text)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Khusus admin.';
  end if;
  if coalesce(btrim(p_alasan), '') = '' then
    raise exception 'Tulis alasan penolakan agar pembeli tahu apa yang perlu diperbaiki.';
  end if;

  update public.orders
     set status = 'ditolak', alasan_tolak = btrim(p_alasan), diproses_at = now(), diproses_oleh = auth.uid()
   where id = p_order_id and status in ('menunggu_verifikasi','menunggu_bayar')
   returning * into v_order;
  if not found then
    raise exception 'Pesanan ini tidak bisa ditolak (sudah diproses atau dibatalkan).';
  end if;
  return v_order;
end;
$$;

-- Atur akses pengguna secara manual (hadiah, kompensasi, cabut akses).
create or replace function public.admin_set_access(p_user_id uuid, p_akses_sampai timestamptz, p_lifetime boolean)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Khusus admin.';
  end if;
  update public.profiles
     set akses_sampai = case when p_lifetime then null else p_akses_sampai end,
         lifetime     = coalesce(p_lifetime, false),
         akses_rencana_sampai = case when not coalesce(p_lifetime, false) and p_akses_sampai is null
                                     then null else akses_rencana_sampai end,
         akses_tools_sampai   = case when not coalesce(p_lifetime, false) and p_akses_sampai is null
                                     then null else akses_tools_sampai end,
         rencana_lifetime = case when not coalesce(p_lifetime, false) and p_akses_sampai is null
                                 then false else rencana_lifetime end,
         tools_lifetime   = case when not coalesce(p_lifetime, false) and p_akses_sampai is null
                                 then false else tools_lifetime end
   where id = p_user_id
   returning * into v_profile;
  if not found then
    raise exception 'Pengguna tidak ditemukan.';
  end if;
  return v_profile;
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_awal_bulan timestamptz := date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
begin
  if not public.is_admin() then
    raise exception 'Khusus admin.';
  end if;
  return jsonb_build_object(
    'menunggu_verifikasi', (select count(*) from public.orders where status = 'menunggu_verifikasi'),
    'menunggu_bayar',      (select count(*) from public.orders where status = 'menunggu_bayar'),
    'pendapatan_bulan_ini',(select coalesce(sum(total), 0) from public.orders where status = 'disetujui' and diproses_at >= v_awal_bulan),
    'pendapatan_total',    (select coalesce(sum(total), 0) from public.orders where status = 'disetujui'),
    'pesanan_disetujui',   (select count(*) from public.orders where status = 'disetujui'),
    'pengguna',            (select count(*) from public.profiles),
    'akses_aktif',         (select count(*) from public.profiles where
                              lifetime or coalesce(akses_sampai > now(), false)
                              or rencana_lifetime or coalesce(akses_rencana_sampai > now(), false)
                              or tools_lifetime or coalesce(akses_tools_sampai > now(), false)),
    'lifetime',            (select count(*) from public.profiles where lifetime)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 6. KEAMANAN BARIS (Row Level Security)
--    Browser TIDAK boleh mengubah profil/pesanan langsung — hanya lewat
--    fungsi di atas. Pembeli hanya melihat data miliknya sendiri.
-- ---------------------------------------------------------------------

alter table public.plans    enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.orders   enable row level security;

drop policy if exists "paket: semua boleh lihat yang aktif" on public.plans;
create policy "paket: semua boleh lihat yang aktif" on public.plans
  for select to anon, authenticated
  using (aktif or public.is_admin());

drop policy if exists "paket: admin kelola" on public.plans;
create policy "paket: admin kelola" on public.plans
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pengaturan: publik atau sudah masuk" on public.settings;
create policy "pengaturan: publik atau sudah masuk" on public.settings
  for select to anon, authenticated
  using (publik or auth.uid() is not null);

drop policy if exists "pengaturan: admin kelola" on public.settings;
create policy "pengaturan: admin kelola" on public.settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profil: milik sendiri atau admin" on public.profiles;
create policy "profil: milik sendiri atau admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "pesanan: milik sendiri atau admin" on public.orders;
create policy "pesanan: milik sendiri atau admin" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());


-- ---------------------------------------------------------------------
-- 7. HAK AKSES TABEL & FUNGSI
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

revoke all on public.plans, public.profiles, public.settings, public.orders from anon, authenticated;
grant select on public.plans, public.settings to anon, authenticated;
grant select on public.profiles, public.orders to authenticated;
grant insert, update, delete on public.plans, public.settings to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin()                                  to anon, authenticated;
grant execute on function public.has_access()                                to authenticated;
grant execute on function public.create_order(text)                          to authenticated;
grant execute on function public.submit_proof(uuid, text, text, text, date, text, text, boolean) to authenticated;
revoke execute on function public.claim_payment_whatsapp_notification(uuid) from public, anon, authenticated;
revoke execute on function public.release_payment_whatsapp_notification(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_payment_whatsapp_notification(uuid) to service_role;
grant execute on function public.release_payment_whatsapp_notification(uuid, timestamptz) to service_role;
grant execute on function public.cancel_order(uuid)                          to authenticated;
grant execute on function public.admin_approve_order(uuid)                   to authenticated;
grant execute on function public.admin_reject_order(uuid, text)              to authenticated;
grant execute on function public.admin_set_access(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.admin_stats()                               to authenticated;


-- ---------------------------------------------------------------------
-- 8. PENYIMPANAN FOTO BUKTI TRANSFER (bucket privat)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bukti', 'bukti', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bukti: unggah ke folder sendiri" on storage.objects;
create policy "bukti: unggah ke folder sendiri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bukti' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "bukti: lihat milik sendiri atau admin" on storage.objects;
create policy "bukti: lihat milik sendiri atau admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'bukti'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));


-- ---------------------------------------------------------------------
-- 9. JADIKAN DIRIMU ADMIN  (langkah manual, sekali saja)
--
--  a) Masuk ke websitemu dengan akun Google yang akan jadi admin
--     (ini membuat baris profilnya).
--  b) Kembali ke SQL Editor, ganti email di bawah, lalu jalankan:
--
--     update public.profiles set is_admin = true where email = 'emailkamu@gmail.com';
-- ---------------------------------------------------------------------
