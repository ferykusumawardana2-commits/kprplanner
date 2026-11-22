# Panduan memasang KPR PINTAR (website jualan)

Paket ini adalah website statis: landing page, login email/password, pembayaran transfer manual dengan upload bukti, halaman admin, dan kalkulator yang hanya terbuka untuk pembeli yang aksesnya aktif. Databasenya memakai **Supabase** (gratis untuk skala kecil, tanpa kartu kredit) dan hostingnya bisa **Netlify**, **Cloudflare Pages**, atau **GitHub Pages**.

Waktu pemasangan sekitar 30–45 menit. Kamu tidak perlu menulis kode, cukup menyalin dan menempel.

## Isi paket

| File | Fungsi |
|---|---|
| `index.html` | Landing page, simulasi hitung cepat, paket harga, FAQ |
| `bayar.html` | Halaman pembayaran: rekening, nominal dengan kode unik, form konfirmasi + upload bukti |
| `akun.html` | Akun pembeli: status akses dan riwayat pesanan |
| `admin.html` | Panel admin: verifikasi bukti, pengguna, paket harga, rekening |
| `app.html` | Kalkulator KPR Pro (terkunci, hanya untuk yang aksesnya aktif): simulasi dua strategi, jadwal Arus Kas rinci, KPR Health Check, Pelunasan Dipercepat, Take Over KPR |
| `legal.html` | Syarat & Ketentuan, Kebijakan Privasi, Disclaimer (draf, lihat langkah 8) |
| `assets/config.js` | Pengaturan koneksi untuk versi HTML statis |
| `backend/*.php` | Halaman PHP dengan tautan antarhalaman dan aset yang sudah disesuaikan |
| `backend/koneksi.php` | Menyediakan konfigurasi Supabase dari environment server untuk halaman PHP |
| `supabase-setup.sql` | Skema database + aturan keamanan, dijalankan sekali |

## Coba dulu di komputermu (mode demo)

Selama `assets/config.js` masih kosong, website berjalan dalam **mode demo**: data hanya di browser dan login demo hanya simulasi (ada tombol "Masuk sebagai Pengguna Demo" dan "Admin Demo"). Cocok untuk melihat seluruh alurnya.

Cara tercepat: ekstrak zip, lalu klik dua kali `index.html` (mode demo berjalan tanpa server). Kalau ingin lewat server lokal:

```
cd rumah-cerdas-web
python3 -m http.server 8000
```

lalu buka `http://localhost:8000`. Jalur coba: pilih paket → masuk sebagai Pengguna Demo → kirim bukti → keluar → masuk sebagai Admin Demo di `/admin.html` → setujui → buka kalkulator.

Mode demo otomatis **ditolak di internet** (halaman menampilkan pesan "belum disambungkan") supaya pelanggan tidak pernah melihat data contoh.

## Jalankan versi PHP di Laragon

Nyalakan Apache di Laragon lalu buka `http://localhost/rumah-cerdas-web-pro/backend/`. Halaman PHP menggunakan koneksi Supabase yang sama; atur `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sebagai environment variable Apache/PHP. Di Apache, keduanya bisa diatur dengan `SetEnv`, lalu restart Apache. Nilainya adalah Project URL dan publishable/anon key dari Supabase (jangan gunakan `service_role` atau `secret`). Endpoint `backend/koneksi.php` mengirim konfigurasi itu ke halaman sebagai JavaScript.

## Langkah 1 — Buat proyek Supabase

1. Daftar di [supabase.com](https://supabase.com) lalu klik **New project**. Pilih region terdekat (Singapore).
2. Simpan password database yang kamu buat (tidak dipakai di website, tapi simpan baik-baik).

## Langkah 2 — Pasang database

1. Di proyekmu buka **SQL Editor → New query**.
2. Buka file `supabase-setup.sql`, salin **seluruh isinya**, tempel, lalu klik **Run**.
3. Pastikan hasilnya "Success". File ini aman dijalankan ulang.

Ini membuat tabel, aturan keamanan (pembeli hanya bisa melihat data miliknya), fungsi pesanan, dan penyimpanan privat untuk foto bukti transfer. Paket lama **Bulanan**, **3 Bulan**, **Tahunan**, dan **Lifetime** kembali aktif untuk semua fitur; statusnya bisa diubah lagi dari Admin. Paket **Rencana Rumahku** dan **Financial Tools** tetap nonaktif karena harga dan masa aktifnya perlu kamu tentukan. Atur keduanya di **Admin → Paket harga**, lalu aktifkan setelah harga dan durasi diisi. Akses penuh pengguna lama tetap dipertahankan sampai masa aktifnya berakhir.

Jika sudah pernah memasang website ini, jalankan ulang seluruh `supabase-setup.sql` untuk menambahkan kolom akses paket. Script aman dijalankan ulang dan tidak menghapus data pesanan atau masa akses pengguna.

## Langkah 3 — Isi `assets/config.js`

Di Supabase buka **Settings → API Keys**. Salin:

- **Project URL** (juga ada di dialog **Connect**) ke `SUPABASE_URL`
- **Publishable key** (berawalan `sb_publishable_`) ke `SUPABASE_ANON_KEY`. Key `anon` versi lama juga masih bisa dipakai.

```js
window.RC_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_xxxxxxxx",
  ALLOW_DEMO_ONLINE: false
};
```

Key *publishable/anon* memang aman ditaruh di sini karena keamanan data dijaga oleh aturan di database. **Jangan pernah** menaruh key `secret` atau `service_role` di file mana pun di website ini.

## Langkah 4 — Aktifkan login Email & Password (tanpa Google Cloud)

Website ini menggunakan Supabase Auth dengan email dan password. **Tidak perlu membuat project Google Cloud, OAuth Client ID, atau Client Secret.**

Di Supabase:

1. Buka **Authentication → Providers → Email**.
2. Pastikan provider Email aktif.
3. Atur **Confirm email** sesuai kebutuhan. Jika aktif, pengguna harus membuka tautan verifikasi email sebelum login. Pastikan SMTP/email provider Supabase siap mengirim email.
4. Buka **Authentication → URL Configuration**:
   - **Site URL:** alamat website, misalnya `https://rumahcerdas.netlify.app`.
   - **Redirect URLs:** tambahkan `https://rumahcerdas.netlify.app/**` dan alamat lokal jika digunakan, misalnya `http://localhost:8000/**`.
5. Simpan pengaturan.

Di website tersedia form **Buat akun**, **Masuk**, dan **Lupa password**. Tautan reset password akan kembali ke `akun.html?recovery=1`, lalu pengguna dapat membuat password baru.

> Untuk produksi, gunakan SMTP yang terkonfigurasi dan domain email yang tepercaya agar email verifikasi/reset tidak mudah masuk spam. Jangan menaruh `service_role` atau `secret` key di website.

## Langkah 5 — Unggah website ke hosting

Pilih salah satu. Semuanya menerima folder `rumah-cerdas-web` apa adanya (tanpa build).

- **Netlify:** buka [app.netlify.com/drop](https://app.netlify.com/drop), seret folder `rumah-cerdas-web`. Kamu langsung mendapat alamat `*.netlify.app` yang bisa diganti namanya.
- **Cloudflare Pages:** *Workers & Pages → Create → Pages → Upload assets*, unggah folder.
- **GitHub Pages:** unggah isi folder ke sebuah repository, lalu aktifkan Pages.

Setelah punya alamatnya, kembali ke langkah 4 dan pastikan alamat itu sudah terdaftar di Supabase (Site URL dan Redirect URLs). Untuk domain sendiri, tinggal tambahkan di pengaturan hosting dan daftarkan domainnya di tempat yang sama.

## Langkah 6 — Jadikan dirimu admin

1. Buka websitemu dan buat akun atau masuk dengan email yang akan menjadi admin. Ini membuat baris profilnya.
2. Di Supabase **SQL Editor**, jalankan (ganti emailnya):

```sql
update public.profiles set is_admin = true where email = 'emailkamu@gmail.com';
```

3. Buka `/admin.html`. Admin juga otomatis boleh membuka kalkulator tanpa membeli paket.

## Langkah 7 — Isi rekening, paket, dan kontak

Semua lewat `/admin.html`, tidak perlu mengubah kode:

- **Pengaturan → Rekening tujuan transfer:** ganti rekening contoh dengan rekeningmu (boleh lebih dari satu bank atau e-wallet). Isi juga nomor WhatsApp admin bila mau memakai tombol WhatsApp.
- **Paket harga:** ubah nama, harga, durasi, fitur, label sorotan, dan urutan. Kosongkan durasi dengan mencentang **Lifetime**. Harga bawaan (Rp39.000, Rp89.000, Rp179.000, Rp299.000) hanyalah contoh.

### Aktifkan notifikasi WhatsApp otomatis

Notifikasi dikirim kepada pembeli setelah bukti pembayaran berhasil dikirim. Pembeli harus mengisi nomor WhatsApp dan menyetujui notifikasi. Pengiriman memakai **WhatsApp Cloud API** melalui Supabase Edge Function; token API tidak boleh ditaruh di `assets/config.js`.

1. Siapkan nomor WhatsApp Business di Meta dan buat template pesan yang sudah disetujui. Nama bawaan template adalah `payment_proof_received`, bahasanya `id`, dengan tiga variabel isi: `{{1}}` nama paket, `{{2}}` nomor pesanan, dan `{{3}}` total transfer. Contoh isi: `Bukti pembayaran untuk paket {{1}} (pesanan {{2}}) telah diterima. Total transfer: {{3}}. Admin sedang memeriksa.`
2. Pasang dan hubungkan Supabase CLI ke **proyek yang sama dengan `SUPABASE_URL` di `kprpintar/assets/config.js`**. Untuk konfigurasi saat ini, project ref-nya `qqnxanqgqondbovppoay`:

```powershell
supabase login
supabase link --project-ref qqnxanqgqondbovppoay
```

3. Jalankan ulang `supabase-setup.sql`, lalu atur rahasia dan deploy fungsi:

```powershell
supabase secrets set --project-ref qqnxanqgqondbovppoay `
  WHATSAPP_ACCESS_TOKEN=TOKEN_META `
  WHATSAPP_PHONE_NUMBER_ID=ID_NOMOR_META `
  WHATSAPP_TEMPLATE_NAME=payment_proof_received `
  WHATSAPP_TEMPLATE_LANGUAGE=id `
  WHATSAPP_GRAPH_API_VERSION=vVERSI_YANG_DIDUKUNG
supabase functions deploy send-payment-whatsapp --project-ref qqnxanqgqondbovppoay
```

Ganti nilai contoh dengan nilai dari Meta; jangan menaruh access token di repository, halaman HTML, atau konfigurasi browser. Pastikan template telah disetujui dan versi Graph API masih didukung Meta. Jika pengiriman gagal, konfirmasi bukti tetap tersimpan dan halaman menampilkan peringatan.

## Langkah 8 — Periksa halaman hukum

`legal.html` berisi draf umum Syarat & Ketentuan, Kebijakan Privasi, dan Disclaimer. Itu **bukan nasihat hukum**. Baca ulang dan sesuaikan, terutama:

- kebijakan pengembalian dana,
- arti paket Lifetime,
- kontak yang tercantum.

Jika perlu, minta konsultan hukum memeriksanya sebelum situs dibuka untuk umum. Tanggal "Terakhir diperbarui" bisa kamu ubah langsung di file.

## Cara kerja sehari-hari

1. Pembeli memilih paket, daftar/masuk dengan email dan password, transfer sesuai nominal (harga + kode unik 1–999), mengisi nomor WhatsApp, lalu mengunggah bukti.
2. Di admin, antrean **Perlu diverifikasi** muncul dengan lencana angka. Cocokkan nominal di bukti dengan mutasi rekeningmu, lalu klik **Setujui & aktifkan akses**. Akses pembeli langsung aktif.
   Setelah bukti dikirim, pembeli menerima notifikasi WhatsApp otomatis bila Cloud API dan template sudah dikonfigurasi.
3. Jika ada yang salah, klik **Tolak** dan tulis alasannya. Pembeli melihat alasannya dan bisa mengirim ulang.
4. Perpanjangan menambah sisa akses (sisa hari tidak hilang). Untuk hadiah atau kompensasi, pakai **Pengguna → Atur akses**.
5. **Pesanan → Ekspor CSV** untuk pembukuan.

## Hal yang perlu kamu tahu

**Kunci aksesnya "lunak".** Website ini statis, jadi file `app.html` pada dasarnya bisa diunduh siapa pun yang tahu alamatnya. Gerbang login dan kunci paket memblokir penggunaan normal, tetapi orang yang paham cara melihat kode sumber bisa melewatinya. Untuk proteksi sungguhan, kode fitur perlu disimpan di server dan hanya dikirim kepada pengguna yang berhak.

**Yang sudah diuji dan yang belum.** Seluruh alur diuji penuh di mode demo (beli, kirim bukti, tolak, kirim ulang, setujui, kalkulator terbuka, edit paket dan rekening, tampilan HP). Skema SQL beserta aturan keamanannya diuji pada Postgres sungguhan, dan kode penghubung ke database diuji terhadap skema yang sama. Yang belum bisa diuji dari sini adalah sambungan ke proyek Supabase dan login Google milikmu sendiri, karena butuh akunmu. Lakukan satu kali uji beli dari ujung ke ujung dengan akun Google kedua sebelum mengumumkan ke publik.

**Foto bukti transfer** disimpan di penyimpanan privat Supabase. Hanya pemiliknya dan admin yang bisa membukanya, dan setiap foto otomatis dikecilkan di browser sebelum diunggah.

**Sudah memasang versi sebelumnya?** Perbarui file website dan jalankan ulang `supabase-setup.sql` seperti langkah 2. File `assets/config.js` tidak perlu diubah. Data hitungan yang sudah tersimpan di browser pengguna tetap terbaca.

**Kalkulator diperbarui?** `app.html` adalah kalkulator ditambah tiga blok yang diapit komentar `GERBANG-AWAL` dan `GERBANG-AKHIR` (di `<head>`, awal `<body>`, dan akhir `<body>`). Bila kamu punya versi kalkulator yang baru, salin ketiga blok itu ke file baru agar kuncinya tetap terpasang.

## Masalah umum

| Gejala | Penyebab dan solusi |
|---|---|
| Halaman menampilkan "Website belum disambungkan ke database" | `assets/config.js` belum diisi, atau ini mode demo di internet. Isi dua nilainya dan unggah ulang. |
| Setelah login Google kembali ke halaman yang salah atau error | Alamat websitemu belum masuk **Redirect URLs** di Supabase, atau **Authorized redirect URI** di Google belum berisi callback Supabase. |
| "Access blocked: app has not completed verification" | Aplikasi Google masih berstatus Testing. Tambahkan akunmu sebagai test user, atau ubah ke In production. |
| Setelah dijadikan admin masih "Akun ini bukan admin" | Keluar dan masuk lagi, pastikan emailnya persis sama dengan yang dipakai login. |
| Membeli Rencana Rumahku ikut membuka Financial Tools (atau sebaliknya) | Perbarui file website dan jalankan ulang seluruh `supabase-setup.sql` di proyek Supabase. Pastikan paket Rencana Rumahku memakai ID `rencana-rumahku` dan Financial Tools memakai ID `financial-tools`, lalu coba pesanan baru. |
| Unggah bukti gagal | File bukan gambar atau terlalu besar. Pakai JPG/PNG/WebP. |
| "Rekening tujuan belum diatur" di halaman bayar | Isi rekening di **Admin → Pengaturan**. |
