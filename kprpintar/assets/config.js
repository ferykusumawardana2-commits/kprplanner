/*
  PENGATURAN WEBSITE — satu-satunya file yang perlu kamu isi.

  1. Buat proyek di supabase.com (gratis), lalu salin dua nilai dari
     Settings → API Keys:
        - Project URL            → SUPABASE_URL
        - anon / publishable key → SUPABASE_ANON_KEY (berawalan sb_publishable_)
     (Kunci "anon/publishable" memang aman ditaruh di sini. JANGAN PERNAH
      menaruh kunci "service_role" atau "secret" di file ini.)

  2. Selama dua nilai itu kosong, website berjalan dalam MODE DEMO:
     data hanya disimpan di browser dan login demo hanya simulasi.
     Cocok untuk mencoba tampilan, tidak untuk dipublikasikan.

  Panduan lengkap ada di PANDUAN-PASANG.md.
*/
window.RC_CONFIG = {
  SUPABASE_URL: "https://qqnxanqgqondbovppoay.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_G1jvKTdYfxrEpeZOFbgEiQ_qQMeN6pd",

  // Mode demo di internet biasanya tanda lupa mengisi pengaturan di atas,
  // jadi secara bawaan ditolak. Ubah ke true hanya jika sengaja ingin
  // memamerkan demo kepada orang lain.
  ALLOW_DEMO_ONLINE: false
};
