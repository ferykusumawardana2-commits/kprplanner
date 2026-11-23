/* KPR Planner — komponen tampilan bersama: navbar akun, dialog masuk, toast, konfirmasi. */
(function () {
  'use strict';
  var A = window.RCApi;
  var IC = {
    house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>'
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function mk(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  /* ---------- toast ---------- */
  var toastBox;
  function toast(msg, tone) {
    if (!toastBox) { toastBox = mk('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(toastBox); }
    var t = mk('<div class="toast ' + (tone || '') + '">' + esc(msg) + '</div>');
    toastBox.appendChild(t);
    setTimeout(function () { t.remove(); }, tone === 'bad' ? 6000 : 3600);
  }

  /* ---------- konfirmasi ---------- */
  function confirmBox(msg, o) {
    o = o || {};
    return new Promise(function (res) {
      var d = mk('<dialog><div class="dlg"><h3>' + esc(o.title || 'Yakin?') + '</h3><p class="sub" style="margin:0">' + esc(msg) + '</p><div class="dlg-actions"><button class="btn btn-ghost" data-v="0">' + esc(o.cancel || 'Batal') + '</button><button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-v="1">' + esc(o.ok || 'Lanjut') + '</button></div></div></dialog>');
      document.body.appendChild(d);
      var val = false;
      d.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-v]'); if (b) { val = b.dataset.v === '1'; d.close(); } });
      d.addEventListener('close', function () { d.remove(); res(val); });
      d.showModal();
    });
  }

  function copyText(text, label) {
    function done() { toast((label || 'Teks') + ' disalin', 'ok'); }
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (_) { toast('Tidak bisa menyalin. Salin manual ya.', 'bad'); } t.remove();
    }
  }

  function avatar(u) {
    var ini = esc(((u && (u.nama || u.email)) || '?').trim().charAt(0).toUpperCase());
    if (u && u.avatar_url) return '<span class="avatar"><img src="' + esc(u.avatar_url) + '" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=\'' + ini + '\'"></span>';
    return '<span class="avatar">' + ini + '</span>';
  }
  function badge(status) { var s = A.STATUS[status] || { label: status, tone: 'gray' }; return '<span class="badge" data-tone="' + s.tone + '">' + esc(s.label) + '</span>'; }

  /* ---------- dialog masuk ---------- */
  var loginDlg;
  function ensureLogin() {
    if (loginDlg) return loginDlg;
    var demo = A.mode === 'demo';
    var recovery = /type=recovery/.test(location.hash || '') || new URLSearchParams(location.search).get('recovery') === '1';
    loginDlg = mk('<dialog id="loginDlg" aria-labelledby="loginTitle"><div class="dlg" style="position:relative">' +
      '<button class="dlg-x" type="button" aria-label="Tutup" data-close>&times;</button>' +
      '<h3 id="loginTitle">' + (recovery ? 'Buat password baru' : 'Masuk ke KPR Planner') + '</h3>' +
      '<p class="sub" id="authIntro">' + (demo ? 'Ini mode demo: pilih peran untuk mencoba alurnya.' : 'Gunakan email dan password untuk mengakses akun Rumah Cerdas.') + '</p>' +
      (demo
        ? '<div style="display:grid;gap:10px"><button class="btn btn-primary btn-lg btn-block" data-demo="user">Masuk sebagai Pengguna Demo</button><button class="btn btn-ghost btn-lg btn-block" data-demo="admin">Masuk sebagai Admin Demo</button></div>'
        : '<form id="authForm" style="display:grid;gap:12px">' +
          '<label id="nameWrap" hidden style="display:grid;gap:6px;font-size:13px;font-weight:600">Nama lengkap<input id="authName" style="width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:10px;font:inherit" type="text" autocomplete="name" placeholder="Nama lengkap"></label>' +
          '<label id="emailWrap" style="display:grid;gap:6px;font-size:13px;font-weight:600">Email<input id="authEmail" style="width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:10px;font:inherit" type="email" autocomplete="email" required placeholder="nama@email.com"></label>' +
          '<label id="passwordWrap" style="display:grid;gap:6px;font-size:13px;font-weight:600">Password<input id="authPassword" style="width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:10px;font:inherit" type="password" autocomplete="current-password" minlength="6" required placeholder="Minimal 6 karakter"></label>' +
          '<label id="confirmWrap" hidden style="display:grid;gap:6px;font-size:13px;font-weight:600">Ulangi password<input id="authConfirm" style="width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:10px;font:inherit" type="password" autocomplete="new-password" minlength="6" placeholder="Ulangi password"></label>' +
          '<button class="btn btn-primary btn-lg btn-block" id="authSubmit" type="submit">' + (recovery ? 'Simpan password baru' : 'Masuk') + '</button>' +
          '</form>' +
          '<div id="authLinks" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:13px">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-auth-mode="register">Buat akun</button><button class="btn btn-ghost btn-sm" type="button" data-auth-mode="forgot">Lupa password?</button></div>') +
      '<p id="loginErr" class="errmsg" style="color:var(--red);font-size:13.5px;font-weight:600;margin-top:12px" hidden></p>' +
      '<p style="font-size:12.5px;color:var(--muted);margin-top:16px;line-height:1.55">Dengan masuk, kamu menyetujui <a href="legal.html#syarat">Syarat &amp; Ketentuan</a> dan <a href="legal.html#privasi">Kebijakan Privasi</a>.</p>' +
      '</div></dialog>');
    document.body.appendChild(loginDlg);
    function setMode(mode) {
      var form = $('#authForm', loginDlg), name = $('#nameWrap', loginDlg), pass = $('#passwordWrap', loginDlg), confirm = $('#confirmWrap', loginDlg);
      var title = $('#loginTitle', loginDlg), intro = $('#authIntro', loginDlg), submit = $('#authSubmit', loginDlg), links = $('#authLinks', loginDlg);
      var err = $('#loginErr', loginDlg); if (err) { err.hidden = true; err.textContent = ''; }
      if (!form) return;
      form.dataset.mode = mode;
      var emailWrap = $('#emailWrap', loginDlg); emailWrap.hidden = mode === 'recovery'; emailWrap.style.display = mode === 'recovery' ? 'none' : 'grid';
      name.hidden = mode !== 'register'; name.style.display = mode === 'register' ? 'grid' : 'none'; pass.hidden = mode === 'forgot'; pass.style.display = mode === 'forgot' ? 'none' : 'grid'; confirm.hidden = mode !== 'register'; confirm.style.display = mode === 'register' ? 'grid' : 'none';
      $('#authEmail', loginDlg).required = mode !== 'recovery';
      $('#authPassword', loginDlg).required = mode !== 'forgot';
      $('#authConfirm', loginDlg).required = mode === 'register';
      title.textContent = mode === 'register' ? 'Buat akun Rumah Cerdas' : mode === 'forgot' ? 'Reset password' : mode === 'recovery' ? 'Buat password baru' : 'Masuk ke KPR Planner';
      intro.textContent = mode === 'register' ? 'Daftar menggunakan email aktif. Kami akan mengirim tautan verifikasi jika konfirmasi email diaktifkan.' : mode === 'forgot' ? 'Masukkan email akunmu untuk menerima tautan reset password.' : mode === 'recovery' ? 'Masukkan password baru untuk akunmu.' : 'Gunakan email dan password untuk mengakses akun Rumah Cerdas.';
      submit.textContent = mode === 'register' ? 'Daftar' : mode === 'forgot' ? 'Kirim tautan reset' : mode === 'recovery' ? 'Simpan password baru' : 'Masuk';
      links.innerHTML = mode === 'login' ? '<button class="btn btn-ghost btn-sm" type="button" data-auth-mode="register">Buat akun</button><button class="btn btn-ghost btn-sm" type="button" data-auth-mode="forgot">Lupa password?</button>' :
        '<button class="btn btn-ghost btn-sm" type="button" data-auth-mode="login">Kembali ke login</button>';
    }
    if (!demo) setMode(recovery ? 'recovery' : 'login');
    loginDlg.addEventListener('click', function (e) {
      if (e.target === loginDlg || (e.target.closest && e.target.closest('[data-close]'))) loginDlg.close();
      var d = e.target.closest && e.target.closest('[data-demo]');
      if (d) { A.demoSignIn(d.dataset.demo).then(function () { var n = loginDlg.dataset.next; if (!n || n === location.href) location.reload(); else location.assign(n); }); }
      var mode = e.target.closest && e.target.closest('[data-auth-mode]');
      if (mode) setMode(mode.dataset.authMode);
    });
    var form = $('#authForm', loginDlg);
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var mode = form.dataset.mode, email = $('#authEmail', loginDlg).value.trim(), password = $('#authPassword', loginDlg).value, name = $('#authName', loginDlg).value.trim();
      var err = $('#loginErr', loginDlg), submit = $('#authSubmit', loginDlg);
      err.hidden = true;
      if (mode === 'register' && !name) { err.textContent = 'Nama lengkap wajib diisi.'; err.hidden = false; return; }
      if (mode === 'register' && password !== $('#authConfirm', loginDlg).value) { err.textContent = 'Konfirmasi password tidak sama.'; err.hidden = false; return; }
      submit.disabled = true;
      var old = submit.textContent; submit.textContent = 'Memproses…';
      var action = mode === 'register' ? A.signUp(email, password, name) :
        mode === 'forgot' ? A.resetPassword(email) :
        mode === 'recovery' ? A.updatePassword(password) : A.signIn(email, password);
      action.then(function (data) {
        if (mode === 'register' && data && !data.session) {
          err.style.color = 'var(--green)'; err.textContent = 'Pendaftaran berhasil. Periksa email untuk verifikasi sebelum login.'; err.hidden = false; setMode('login');
          err.style.color = 'var(--green)'; err.textContent = 'Pendaftaran berhasil. Periksa email untuk verifikasi sebelum login.'; err.hidden = false;
          return;
        }
        if (mode === 'forgot') {
          err.style.color = 'var(--green)'; err.textContent = 'Jika email terdaftar, tautan reset password akan dikirim. Periksa kotak masuk dan spam.'; err.hidden = false; return;
        }
        if (mode === 'recovery') {
          try { history.replaceState(null, '', location.pathname); } catch (_) {}
          err.style.color = 'var(--green)'; err.textContent = 'Password berhasil diperbarui. Silakan login kembali.'; err.hidden = false; setMode('login'); return;
        }
        var n = loginDlg.dataset.next;
        if (!n || n === location.href) location.reload(); else location.assign(n);
      }).catch(function (ex) {
        err.style.color = 'var(--red)'; err.textContent = ex.message || 'Terjadi kesalahan.'; err.hidden = false;
      }).finally(function () { submit.disabled = false; submit.textContent = old; });
    });
    return loginDlg;
  }
  function login(next) { var d = ensureLogin(); d.dataset.next = next || ''; var p = $('#loginErr', d); if (p) p.hidden = true; if (!d.open) d.showModal(); }
  function logout() { return A.signOut().then(function () { if (document.body.dataset.protect) location.href = 'index.html'; else location.reload(); }); }

  /* ---------- navbar ---------- */
  function renderAuth() {
    var box = $('#navAuth'); if (!box) return;
    var u = A.user;
    if (!u) {
      box.innerHTML = '<button class="btn btn-ghost btn-sm" type="button" data-act="login">Masuk</button><a class="btn btn-primary btn-sm" href="index.html?paket=semua">Beli paket</a>';
      return;
    }
    var first = esc((u.nama || u.email || '').split(' ')[0]);
    box.innerHTML = '<div class="user-wrap"><button class="user-chip" type="button" aria-haspopup="menu" aria-expanded="false" id="userBtn">' + avatar(u) + '<span class="nm">' + first + '</span></button>' +
      '<div class="menu" role="menu" id="userMenu" hidden><div class="who"><b>' + esc(u.nama || 'Pengguna') + '</b>' + esc(u.email || '') + '</div>' +
      '<a role="menuitem" href="akun.html">Akun saya</a><a role="menuitem" href="app.html">Buka kalkulator</a>' +
      (u.is_admin ? '<a role="menuitem" href="admin.html">Panel admin</a>' : '') +
      '<button role="menuitem" type="button" data-act="logout">Keluar</button></div></div>';
    var btn = $('#userBtn'), menu = $('#userMenu');
    btn.addEventListener('click', function (e) { e.stopPropagation(); var open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  }
  function wireGlobal() {
    document.addEventListener('click', function (e) {
      var menu = $('#userMenu'); if (menu && !menu.hidden && !e.target.closest('.user-wrap')) { menu.hidden = true; var b = $('#userBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
      var act = e.target.closest && e.target.closest('[data-act]'); if (!act) return;
      if (act.dataset.act === 'login') { e.preventDefault(); login(act.dataset.next ? new URL(act.dataset.next, location.href).href : undefined); }
      if (act.dataset.act === 'logout') { e.preventDefault(); logout(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var m = $('#userMenu'); if (m && !m.hidden) { m.hidden = true; var b = $('#userBtn'); if (b) b.focus(); } } });
    var nav = $('.nav'), tg = $('.nav-toggle');
    if (nav && tg) {
      tg.addEventListener('click', function () { var o = nav.classList.toggle('open'); tg.setAttribute('aria-expanded', String(o)); });
      nav.addEventListener('click', function (e) { if (e.target.closest('.nav-links a')) { nav.classList.remove('open'); tg.setAttribute('aria-expanded', 'false'); } });
    }
  }

  function demoBar() {
    if (A.mode !== 'demo') return;
    var bar = mk('<div class="demo-bar"><div class="container"><span><b>Mode demo.</b> Data hanya tersimpan di browser ini dan login demo hanya simulasi. Isi <code>assets/config.js</code> untuk menyambungkan Supabase.</span><button type="button" id="demoReset">Reset data demo</button></div></div>');
    document.body.insertBefore(bar, document.body.firstChild);
    $('#demoReset', bar).addEventListener('click', function () { confirmBox('Semua pesanan dan akun demo di browser ini akan dihapus.', { title: 'Reset data demo?', ok: 'Reset', danger: true }).then(function (y) { if (y) { A.demoReset(); location.href = 'index.html'; } }); });
  }

  function blockedScreen() {
    document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f8fa"><div class="card" style="max-width:560px"><h1 style="font-size:26px;margin-bottom:10px">Website belum disambungkan ke database</h1><p style="margin-bottom:12px">Halaman ini berjalan dalam mode demo di internet, biasanya karena <code>assets/config.js</code> belum diisi. Supaya pelangganmu tidak melihat data contoh, halaman ditutup.</p><p>Isi <code>SUPABASE_URL</code> dan <code>SUPABASE_ANON_KEY</code> di <code>assets/config.js</code> lalu unggah ulang. Langkah lengkapnya ada di <b>PANDUAN-PASANG.md</b>.</p></div></main>';
  }
  function fatalScreen(msg) {
    document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f8fa"><div class="card" style="max-width:520px"><h1 style="font-size:24px;margin-bottom:10px">Halaman belum bisa dimuat</h1><p style="margin-bottom:16px">' + esc(msg) + '</p><button class="btn btn-primary" onclick="location.reload()">Muat ulang</button></div></main>';
  }

  /* ---------- mulai halaman ---------- */
  function start(opts) {
    opts = opts || {};
    return A.init().then(function () {
      if (A.blocked) { blockedScreen(); return null; }
      if (opts.protect) document.body.dataset.protect = opts.protect;
      demoBar(); renderAuth(); wireGlobal();
      if (/type=recovery/.test(location.hash || '') || new URLSearchParams(location.search).get('recovery') === '1') login(location.href);
      A.onAuth(function () { renderAuth(); if (opts.protect && !A.user) location.href = 'index.html'; });
      return A.user;
    }, function (e) { fatalScreen(e.message || 'Terjadi masalah saat memuat. Muat ulang halaman.'); return null; });
  }

  window.RCUI = { start: start, esc: esc, toast: toast, confirm: confirmBox, copy: copyText, avatar: avatar, badge: badge, login: login, logout: logout, icon: IC, mk: mk, $: $ };
})();
