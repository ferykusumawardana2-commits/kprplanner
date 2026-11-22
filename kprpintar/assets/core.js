/* KPR PINTAR — lapisan data.
   Satu antarmuka (window.RCApi), dua penyedia data:
     • Supabase  (SUPABASE_URL + SUPABASE_ANON_KEY terisi di config.js)
     • Demo      (data di localStorage browser, untuk mencoba tampilan)
   Semua halaman hanya memanggil RCApi, jadi tampilan tidak peduli penyedia mana yang aktif. */
(function () {
  "use strict";
  var CFG = window.RC_CONFIG || {};
  var LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  var BASE = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      return s ? s.replace(/[^\/]*$/, "") : "assets/";
    } catch (_) {
      return "assets/";
    }
  })();

  /* ---------- Util ---------- */
  var STATUS = {
    menunggu_bayar: { label: "Menunggu pembayaran", tone: "amber" },
    menunggu_verifikasi: { label: "Menunggu verifikasi", tone: "blue" },
    disetujui: { label: "Disetujui", tone: "green" },
    ditolak: { label: "Ditolak", tone: "red" },
    dibatalkan: { label: "Dibatalkan", tone: "gray" },
  };
  function rp(n) {
    n = Math.round(Number(n) || 0);
    return "Rp" + n.toLocaleString("id-ID");
  }
  function tgl(d) {
    if (!d) return "–";
    var x = new Date(d);
    if (isNaN(x)) return "–";
    return x.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  function tglJam(d) {
    if (!d) return "–";
    var x = new Date(d);
    if (isNaN(x)) return "–";
    return (
      tgl(x) +
      ", " +
      x
        .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
        .replace(".", ":")
    );
  }
  function packageGroupForId(id) {
    if (id === "rencana-rumahku") return "rencana";
    if (id === "financial-tools") return "tools";
    return null;
  }
  function hasLegacyAccess(p) {
    if (p && packageGroupForId(p.plan_id)) return false;
    return !!(
      p &&
      (p.lifetime ||
        (p.akses_sampai && new Date(p.akses_sampai).getTime() > Date.now()))
    );
  }
  function hasScopedPlanAccess(p, group) {
    if (!p) return false;
    if (group === "rencana")
        return !!(
          p.rencana_lifetime ||
          (p.akses_rencana_sampai &&
            new Date(p.akses_rencana_sampai).getTime() > Date.now())
        );
    if (group === "tools")
        return !!(
          p.tools_lifetime ||
          (p.akses_tools_sampai &&
            new Date(p.akses_tools_sampai).getTime() > Date.now())
        );
    return false;
  }
  function legacyPlanName(p) {
    var labels = {
        bulanan: "Bulanan",
        "3-bulan": "3 Bulan",
        tahunan: "Tahunan",
        lifetime: "Lifetime",
    };
    return (p && labels[p.plan_id]) || "Paket semua fitur";
  }
  function hasPlanAccess(p, group) {
    if (!p) return false;
    if (p.is_admin) return true;
    var packageGroup = packageGroupForId(p.plan_id);
    if (packageGroup) {
      if (
        packageGroup === group &&
        (p.lifetime ||
          (p.akses_sampai &&
            new Date(p.akses_sampai).getTime() > Date.now()))
      )
        return true;
    } else if (hasLegacyAccess(p)) return true;
    return hasScopedPlanAccess(p, group);
  }
  function hasLifetimeAccess(p, group) {
    if (!p) return false;
    var packageGroup = packageGroupForId(p.plan_id);
    if (p.lifetime) return !packageGroup || packageGroup === group;
    if (group === "rencana") return !!p.rencana_lifetime;
    if (group === "tools") return !!p.tools_lifetime;
    return false;
  }
  function planGroup(p) {
    if (!p) return "semua";
    return packageGroupForId(p.id) || p.akses_grup || "semua";
  }
  function hasAccess(p) {
    return hasPlanAccess(p, "rencana") || hasPlanAccess(p, "tools");
  }
  function sisaHari(p) {
    if (!p || p.lifetime || !p.akses_sampai) return null;
    return Math.ceil((new Date(p.akses_sampai) - Date.now()) / 86400000);
  }
  function durasiLabel(h) {
    if (h == null) return "Seumur hidup";
    if (h % 365 === 0) return h / 365 + " tahun";
    if (h % 30 === 0) return h / 30 + " bulan";
    return h + " hari";
  }
  function slug(s) {
    return (
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "paket-" + Date.now().toString(36)
    );
  }
  function nice(e) {
    var m = e && e.message ? e.message : String(e);
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m))
      return new Error(
        "Tidak bisa terhubung ke server. Periksa koneksi internetmu lalu coba lagi.",
      );
    if (/JWT|expired/i.test(m))
      return new Error(
        "Sesi masukmu habis. Muat ulang halaman lalu masuk lagi.",
      );
    return new Error(m);
  }
  function edgeFunctionError(e) {
    var response = e && e.context;
    if (!response || typeof response.clone !== "function")
      return Promise.resolve(nice(e));
    return response
      .clone()
      .json()
      .then(
        function (body) {
          if (response.status === 404 && body && body.code === "NOT_FOUND")
            return new Error(
              "Fungsi WhatsApp belum di-deploy ke proyek Supabase ini.",
            );
          var message =
            body && typeof body.message === "string"
              ? body.message
              : body && typeof body.error === "string"
                ? body.error
                : "";
          return new Error(message || nice(e).message);
        },
        function () {
          return nice(e);
        },
      );
  }
  function must(res) {
    if (res && res.error) throw nice(res.error);
    return res ? res.data : null;
  }
  function isLocalHost() {
    var h = location.hostname;
    return (
      location.protocol === "file:" ||
      h === "" ||
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "[::1]" ||
      /\.local$/.test(h)
    );
  }

  function normSettings(raw) {
    raw = raw || {};
    var b = raw.bisnis || {},
      p = raw.pembayaran || {};
    return {
      bisnis: {
        nama: b.nama || "KPR PINTAR",
        by: b.by || "AF Creative Media",
        whatsapp: (b.whatsapp || "").replace(/[^0-9]/g, ""),
        email: b.email || "",
      },
      pembayaran: {
        rekening: Array.isArray(p.rekening) ? p.rekening : [],
        kode_unik: p.kode_unik !== false,
        catatan: p.catatan || "",
      },
    };
  }

  /* Gambar bukti transfer dikecilkan di browser (maks 1600px, JPEG) supaya cepat diunggah. */
  function compressImage(file, max, q) {
    max = max || 1600;
    q = q || 0.82;
    if (!file || !/^image\//.test(file.type || ""))
      return Promise.reject(
        new Error("File harus berupa gambar (JPG, PNG, atau WebP)."),
      );
    if (file.size > 20 * 1024 * 1024)
      return Promise.reject(
        new Error(
          "Ukuran file terlalu besar. Pakai foto atau screenshot di bawah 20 MB.",
        ),
      );
    var url = URL.createObjectURL(file);
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        res(img);
      };
      img.onerror = function () {
        rej(
          new Error(
            "Gambar tidak bisa dibaca. Coba pakai screenshot dalam format JPG atau PNG.",
          ),
        );
      };
      img.src = url;
    })
      .then(function (img) {
        var w = img.naturalWidth,
          h = img.naturalHeight,
          s = Math.min(1, max / Math.max(w, h));
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
        var c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        var x = c.getContext("2d");
        x.fillStyle = "#fff";
        x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, w, h);
        return new Promise(function (res, rej) {
          c.toBlob(
            function (b) {
              b ? res(b) : rej(new Error("Gambar gagal diproses."));
            },
            "image/jpeg",
            q,
          );
        });
      })
      .then(
        function (b) {
          URL.revokeObjectURL(url);
          return b;
        },
        function (e) {
          URL.revokeObjectURL(url);
          throw e;
        },
      );
  }

  /* ---------- Keadaan bersama ---------- */
  var listeners = [];
  var A = {
    live: LIVE,
    mode: LIVE ? "supabase" : "demo",
    config: CFG,
    blocked: !LIVE && !CFG.ALLOW_DEMO_ONLINE && !isLocalHost(),
    user: null,
    STATUS: STATUS,
    rp: rp,
    tgl: tgl,
    tglJam: tglJam,
    hasAccess: hasAccess,
    hasLegacyAccess: hasLegacyAccess,
    hasScopedPlanAccess: hasScopedPlanAccess,
    legacyPlanName: legacyPlanName,
    hasPlanAccess: hasPlanAccess,
    hasLifetimeAccess: hasLifetimeAccess,
    planGroup: planGroup,
    sisaHari: sisaHari,
    durasiLabel: durasiLabel,
    slug: slug,
    compressImage: compressImage,
    normSettings: normSettings,
    onAuth: function (cb) {
      listeners.push(cb);
    },
    _emit: function () {
      listeners.forEach(function (cb) {
        try {
          cb(A.user);
        } catch (e) {
          console.error(e);
        }
      });
    },
  };
  var impl = null,
    readyPromise = null;
  A.init = function () {
    if (!readyPromise)
      readyPromise = (LIVE ? initSupabase() : initDemo()).then(function () {
        return A.user;
      });
    return readyPromise;
  };

  /* =====================================================================
     PENYEDIA 1 — SUPABASE
     ===================================================================== */
  function loadSdk() {
    if (window.supabase && window.supabase.createClient)
      return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = BASE + "vendor/supabase.js";
      s.onload = res;
      s.onerror = function () {
        rej(new Error("Pustaka Supabase gagal dimuat."));
      };
      document.head.appendChild(s);
    });
  }
  function initSupabase() {
    return loadSdk().then(function () {
      var sb = window.supabase.createClient(
        CFG.SUPABASE_URL,
        CFG.SUPABASE_ANON_KEY,
        {
          auth: {
            flowType: "pkce",
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
          },
        },
      );
      A._sb = sb;
      function loadProfile(session) {
        if (!session || !session.user) {
          A.user = null;
          return Promise.resolve(null);
        }
        var au = session.user,
          meta = au.user_metadata || {};
        function fetchOnce() {
          return sb.from("profiles").select("*").eq("id", au.id).maybeSingle();
        }
        return fetchOnce()
          .then(function (r) {
            if (r.data) return r.data;
            return new Promise(function (ok) {
              setTimeout(ok, 700);
            })
              .then(fetchOnce)
              .then(function (r2) {
                return r2.data;
              });
          })
          .then(function (p) {
            return sb.rpc("is_admin").then(function (r) {
              if (p) p.is_admin = !!(r.data || p.is_admin);
              return p;
            }).catch(function () {
              return p;
            });
          })
          .then(
            function (p) {
              A.user = p || {
                id: au.id,
                email: au.email,
                nama: meta.full_name || meta.name || au.email,
                avatar_url: meta.avatar_url || meta.picture || null,
                is_admin: false,
                lifetime: false,
                akses_sampai: null,
              };
              return A.user;
            },
            function () {
              A.user = {
                id: au.id,
                email: au.email,
                nama: meta.full_name || meta.name || au.email,
                avatar_url: meta.avatar_url || null,
                is_admin: false,
                lifetime: false,
                akses_sampai: null,
              };
              return A.user;
            },
          );
      }
      return sb.auth
        .getSession()
        .then(function (r) {
          return loadProfile(r.data && r.data.session);
        })
        .then(function () {
          sb.auth.onAuthStateChange(function (ev, session) {
            // Jangan memanggil Supabase langsung di dalam callback ini (bisa buntu) — tunda satu tick.
            setTimeout(function () {
              var before = A.user && A.user.id;
              loadProfile(session).then(function () {
                if ((A.user && A.user.id) !== before || ev === "SIGNED_OUT")
                  A._emit();
              });
            }, 0);
          });
        });
    });
  }

  var SB = {
    signUp: function (email, password, nama) {
      return A._sb.auth.signUp({
        email: String(email || "").trim(),
        password: password,
        options: {
          data: { full_name: String(nama || "").trim(), name: String(nama || "").trim() },
          emailRedirectTo: location.origin + "/akun.html"
        }
      }).then(function (r) {
        if (r.error) throw nice(r.error);
        return r.data;
      });
    },
    signIn: function (email, password) {
      return A._sb.auth.signInWithPassword({
        email: String(email || "").trim(),
        password: password
      }).then(function (r) {
        if (r.error) throw nice(r.error);
        return r.data;
      });
    },
    resetPassword: function (email) {
      return A._sb.auth.resetPasswordForEmail(String(email || "").trim(), {
        redirectTo: location.origin + "/akun.html?recovery=1"
      }).then(function (r) {
        if (r.error) throw nice(r.error);
        return true;
      });
    },
    updatePassword: function (password) {
      return A._sb.auth.updateUser({ password: password }).then(function (r) {
        if (r.error) throw nice(r.error);
        return r.data;
      });
    },
    signOut: function () {
      return A._sb.auth.signOut().then(function () {
        A.user = null;
        A._emit();
      });
    },
    refreshUser: function () {
      return A._sb.auth.getSession().then(function (r) {
        var s = r.data && r.data.session;
        if (!s) {
          A.user = null;
          return null;
        }
        return A._sb
          .from("profiles")
          .select("*")
          .eq("id", s.user.id)
          .maybeSingle()
          .then(function (x) {
            if (x.data) A.user = x.data;
            return A.user;
          })
          .then(function (u) {
            if (!u) return u;
            return A._sb.rpc("is_admin").then(function (r) {
              u.is_admin = !!(r.data || u.is_admin);
              A.user = u;
              return u;
            }).catch(function () {
              return u;
            });
          });
      });
    },
    getPlans: function () {
      return A._sb
        .from("plans")
        .select("*")
        .eq("aktif", true)
        .order("urutan")
        .then(must);
    },
    getSettings: function () {
      return A._sb
        .from("settings")
        .select("key,value")
        .then(must)
        .then(function (rows) {
          var o = {};
          (rows || []).forEach(function (r) {
            o[r.key] = r.value;
          });
          return normSettings(o);
        });
    },
    createOrder: function (planId) {
      return A._sb.rpc("create_order", { p_plan_id: planId }).then(must);
    },
    getMyOrders: function () {
      return A._sb
        .from("orders")
        .select("*")
        .eq("user_id", A.user.id)
        .order("created_at", { ascending: false })
        .then(must);
    },
    getOrder: function (id) {
      return A._sb
        .from("orders")
        .select("*")
        .eq("id", id)
        .eq("user_id", A.user.id)
        .maybeSingle()
        .then(must);
    },
    uploadProof: function (file, orderId) {
      return compressImage(file).then(function (blob) {
        var path = A.user.id + "/" + orderId + "-" + Date.now() + ".jpg";
        return A._sb.storage
          .from("bukti")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false })
          .then(function (r) {
            if (r.error) throw nice(r.error);
            return path;
          });
      });
    },
    submitProof: function (orderId, f) {
      return A._sb
        .rpc("submit_proof", {
          p_order_id: orderId,
          p_bukti_path: f.bukti_path,
          p_nama_pengirim: f.nama_pengirim,
          p_bank_pengirim: f.bank_pengirim,
          p_tgl_transfer: f.tgl_transfer || null,
          p_catatan: f.catatan || null,
          p_nomor_telepon: f.nomor_telepon,
          p_whatsapp_opt_in: !!f.whatsapp_opt_in,
        })
        .then(must);
    },
    sendPaymentNotification: function (orderId) {
      return A._sb.functions
        .invoke("send-payment-whatsapp", { body: { order_id: orderId } })
        .then(function (res) {
          if (res.error)
            return edgeFunctionError(res.error).then(function (error) {
              throw error;
            });
          return res.data;
        });
    },
    cancelOrder: function (id) {
      return A._sb.rpc("cancel_order", { p_order_id: id }).then(must);
    },
    proofUrl: function (path) {
      return A._sb.storage
        .from("bukti")
        .createSignedUrl(path, 600)
        .then(function (r) {
          if (r.error) throw nice(r.error);
          return r.data.signedUrl;
        });
    },
    /* admin */
    adminStats: function () {
      return A._sb.rpc("admin_stats").then(must);
    },
    adminOrders: function (o) {
      o = o || {};
      var q = A._sb
        .from("orders")
        .select(
          "*, pengguna:profiles!orders_user_id_fkey(nama,email,avatar_url)",
        )
        .order("created_at", { ascending: false })
        .limit(o.limit || 300);
      if (o.status && o.status !== "semua") q = q.eq("status", o.status);
      return q.then(must);
    },
    adminApprove: function (id) {
      return A._sb.rpc("admin_approve_order", { p_order_id: id }).then(must);
    },
    adminReject: function (id, alasan) {
      return A._sb
        .rpc("admin_reject_order", { p_order_id: id, p_alasan: alasan })
        .then(must);
    },
    adminUsers: function (qs) {
      var q = A._sb
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      qs = String(qs || "")
        .replace(/[%,()*]/g, " ")
        .trim();
      if (qs) q = q.or("email.ilike.%" + qs + "%,nama.ilike.%" + qs + "%");
      return q.then(must);
    },
    adminSetAccess: function (userId, o) {
      return A._sb
        .rpc("admin_set_access", {
          p_user_id: userId,
          p_akses_sampai: o.akses_sampai || null,
          p_lifetime: !!o.lifetime,
        })
        .then(must);
    },
    adminPlans: function () {
      return A._sb.from("plans").select("*").order("urutan").then(must);
    },
    adminSavePlan: function (p) {
      return A._sb.from("plans").upsert(p).select().then(must);
    },
    adminDeletePlan: function (id) {
      return A._sb.from("plans").delete().eq("id", id).then(must);
    },
    adminSaveSettings: function (key, value, publik) {
      return A._sb
        .from("settings")
        .upsert({ key: key, value: value, publik: !!publik })
        .then(must);
    },
  };

  /* =====================================================================
     PENYEDIA 2 — DEMO (localStorage)
     ===================================================================== */
  var DB_KEY = "rc_demo_db_v1",
    SES_KEY = "rc_demo_session_v1",
    db = null;
  function demoAccessPlans() {
    return [
      {
        id: "rencana-rumahku",
        nama: "Rencana Rumahku",
        deskripsi: "Akses fitur perencanaan rumah dan simulasi KPR.",
        harga: 0,
        durasi_hari: 30,
        akses_grup: "rencana",
        fitur: ["Isian Data", "Informasi Simulasi", "Catatan Kas"],
        aktif: false,
        urutan: 1,
      },
      {
        id: "financial-tools",
        nama: "Financial Tools",
        deskripsi: "Akses alat bantu analisis keuangan KPR.",
        harga: 0,
        durasi_hari: 30,
        akses_grup: "tools",
        fitur: ["Health Check", "Pelunasan Dipercepat", "Take Over KPR"],
        aktif: false,
        urutan: 2,
      },
    ];
  }
  function seed() {
    var f = [
      "Akses penuh kalkulator",
      "KPR Subsidi & Premium",
      "Bunga tetap & bertahap (floating)",
      "Arus kas per tahun",
      "Ekspor CSV & cetak PDF",
    ];
    return {
      users: [
        {
          id: "demo-user",
          email: "pengguna.demo@example.com",
          nama: "Pengguna Demo",
          avatar_url: null,
          is_admin: false,
          plan_id: null,
          akses_sampai: null,
          lifetime: false,
          akses_rencana_sampai: null,
          akses_tools_sampai: null,
          rencana_lifetime: false,
          tools_lifetime: false,
          created_at: new Date().toISOString(),
        },
        {
          id: "demo-admin",
          email: "admin.demo@example.com",
          nama: "Admin Demo",
          avatar_url: null,
          is_admin: true,
          plan_id: null,
          akses_sampai: null,
          lifetime: true,
          akses_rencana_sampai: null,
          akses_tools_sampai: null,
          rencana_lifetime: false,
          tools_lifetime: false,
          created_at: new Date().toISOString(),
        },
      ],
      plans: [
        {
          id: "bulanan",
          nama: "Bulanan",
          deskripsi: "Cocok untuk mencoba dan menghitung satu rencana rumah.",
          harga: 39000,
          durasi_hari: 30,
          fitur: ["Akses penuh kalkulator 30 hari"].concat(f.slice(1)),
          sorotan: null,
          akses_grup: "semua",
          aktif: true,
          urutan: 1,
        },
        {
          id: "3-bulan",
          nama: "3 Bulan",
          deskripsi:
            "Waktu yang cukup untuk survei rumah dan membandingkan developer.",
          harga: 89000,
          durasi_hari: 90,
          fitur: ["Akses penuh kalkulator 90 hari"].concat(f.slice(1)),
          sorotan: null,
          akses_grup: "semua",
          aktif: true,
          urutan: 2,
        },
        {
          id: "tahunan",
          nama: "Tahunan",
          deskripsi:
            "Untuk yang merencanakan lebih panjang dan sering mengubah skenario.",
          harga: 179000,
          durasi_hari: 365,
          fitur: ["Akses penuh kalkulator 365 hari"].concat(f.slice(1)),
          sorotan: "Hemat dibanding bulanan",
          akses_grup: "semua",
          aktif: true,
          urutan: 3,
        },
        {
          id: "lifetime",
          nama: "Lifetime",
          deskripsi: "Bayar sekali, pakai tanpa batas waktu.",
          harga: 299000,
          durasi_hari: null,
          fitur: [
            "Akses tanpa batas waktu",
            "Semua fitur kalkulator",
            "Pembaruan fitur ikut didapat",
            "Tanpa biaya perpanjangan",
          ],
          sorotan: "Sekali bayar",
          akses_grup: "semua",
          aktif: true,
          urutan: 4,
        },
      ].concat(demoAccessPlans()),
      settings: {
        bisnis: {
          nama: "KPR PINTAR",
          by: "AF Creative Media",
          whatsapp: "",
          email: "",
        },
        pembayaran: {
          rekening: [
            {
              bank: "BCA",
              nomor: "0000000000",
              atas_nama: "GANTI DENGAN NAMA REKENINGMU",
            },
          ],
          kode_unik: true,
          catatan:
            "Transfer sesuai nominal tepat sampai 3 digit terakhir agar pembayaranmu cepat dikenali.",
        },
      },
      orders: [],
      files: {},
    };
  }
  function dbLoad() {
    try {
      var r = localStorage.getItem(DB_KEY);
      db = r ? JSON.parse(r) : null;
    } catch (_) {
      db = null;
    }
    if (!db || !db.users) {
      db = seed();
      dbSave();
      return;
    }
    var changed = false;
    db.plans = Array.isArray(db.plans) ? db.plans : [];
    db.plans.forEach(function (p) {
      if (!p.akses_grup) {
        p.akses_grup = "semua";
        p.aktif = false;
        changed = true;
      }
    });
    demoAccessPlans().forEach(function (defaults) {
      if (
        !db.plans.some(function (p) {
          return p.id === defaults.id;
        })
      ) {
        db.plans.push(defaults);
        changed = true;
      }
    });
    (db.users || []).forEach(function (u) {
      ["akses_rencana_sampai", "akses_tools_sampai"].forEach(function (k) {
        if (!(k in u)) {
          u[k] = null;
          changed = true;
        }
      });
      ["rencana_lifetime", "tools_lifetime"].forEach(function (k) {
        if (!(k in u)) {
          u[k] = false;
          changed = true;
        }
      });
    });
    (db.orders || []).forEach(function (o) {
      if (!o.akses_grup) {
        var plan = db.plans.filter(function (p) {
          return p.id === o.plan_id;
        })[0];
        o.akses_grup = plan ? planGroup(plan) : "semua";
        changed = true;
      }
    });
    if (changed) dbSave();
  }
  function dbSave() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      throw new Error(
        "Penyimpanan browser penuh. Hapus data demo lalu coba lagi.",
      );
    }
  }
  function me() {
    var id = null;
    try {
      id = localStorage.getItem(SES_KEY);
    } catch (_) {}
    return (
      db.users.filter(function (u) {
        return u.id === id;
      })[0] || null
    );
  }
  function uuid() {
    return (
      "o-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    );
  }
  function need() {
    var u = me();
    if (!u) throw new Error("Silakan masuk dulu.");
    return u;
  }
  function needAdmin() {
    var u = need();
    if (!u.is_admin) throw new Error("Khusus admin.");
    return u;
  }
  function find(id) {
    var o = db.orders.filter(function (x) {
      return x.id === id;
    })[0];
    if (!o) throw new Error("Pesanan tidak ditemukan.");
    return o;
  }
  function userOf(id) {
    return db.users.filter(function (u) {
      return u.id === id;
    })[0];
  }
  function copy(x) {
    return JSON.parse(JSON.stringify(x));
  }
  function pending(o) {
    return o.status === "menunggu_bayar" || o.status === "menunggu_verifikasi";
  }
  function initDemo() {
    dbLoad();
    A.user = me();
    return Promise.resolve();
  }
  function later(fn) {
    return new Promise(function (res, rej) {
      setTimeout(function () {
        try {
          dbLoad();
          res(fn());
        } catch (e) {
          rej(e);
        }
      }, 120);
    });
  }

  var DEMO = {
    demoSignIn: function (kind) {
      dbLoad();
      var u = db.users.filter(function (x) {
        return x.id === (kind === "admin" ? "demo-admin" : "demo-user");
      })[0];
      try {
        localStorage.setItem(SES_KEY, u.id);
      } catch (_) {}
      A.user = u;
      A._emit();
      return Promise.resolve(u);
    },
    demoReset: function () {
      try {
        localStorage.removeItem(DB_KEY);
        localStorage.removeItem(SES_KEY);
      } catch (_) {}
      db = null;
      dbLoad();
      A.user = null;
      A._emit();
    },
    signOut: function () {
      try {
        localStorage.removeItem(SES_KEY);
      } catch (_) {}
      A.user = null;
      A._emit();
      return Promise.resolve();
    },
    refreshUser: function () {
      return later(function () {
        A.user = me();
        return A.user;
      });
    },
    getPlans: function () {
      return later(function () {
        return copy(
          db.plans
            .filter(function (p) {
              return p.aktif;
            })
            .sort(function (a, b) {
              return a.urutan - b.urutan;
            }),
        );
      });
    },
    getSettings: function () {
      return later(function () {
        var s = copy(db.settings);
        if (!me()) s.pembayaran = {};
        return normSettings(s);
      });
    },
    createOrder: function (planId) {
      return later(function () {
        var u = need(),
          pl = db.plans.filter(function (p) {
            return p.id === planId && p.aktif;
          })[0];
        if (!pl) throw new Error("Paket tidak tersedia.");
          if (!(pl.harga > 0))
            throw new Error("Harga paket belum ditentukan oleh admin.");
          var group = planGroup(pl);
        var open = db.orders
          .filter(function (o) {
            return o.user_id === u.id && pending(o);
          })
          .sort(function (a, b) {
            return b.created_at.localeCompare(a.created_at);
          })[0];
        if (open) {
          if (open.plan_id === planId) return copy(open);
          if (open.status === "menunggu_verifikasi")
            throw new Error(
              "Pembayaranmu masih diverifikasi admin. Tunggu sampai selesai sebelum memesan paket lain.",
            );
          open.status = "dibatalkan";
        }
        var pakai = db.settings.pembayaran.kode_unik !== false,
          kode = 0,
          total = pl.harga;
        if (pakai && pl.harga > 0) {
          for (var i = 0; i < 60; i++) {
            kode = 1 + Math.floor(Math.random() * 999);
            total = pl.harga + kode;
            if (
              !db.orders.some(function (o) {
                return o.total === total && pending(o);
              })
            )
              break;
          }
        }
        var o = {
          id: uuid(),
          user_id: u.id,
          plan_id: pl.id,
          plan_nama: pl.nama,
          durasi_hari: pl.durasi_hari,
          akses_grup: group,
          harga_dasar: pl.harga,
          kode_unik: kode,
          total: total,
          status: "menunggu_bayar",
          bukti_path: null,
          nama_pengirim: null,
          bank_pengirim: null,
          tgl_transfer: null,
          catatan: null,
          alasan_tolak: null,
          dikirim_at: null,
          diproses_at: null,
          diproses_oleh: null,
          created_at: new Date().toISOString(),
        };
        db.orders.push(o);
        dbSave();
        return copy(o);
      });
    },
    getMyOrders: function () {
      return later(function () {
        var u = need();
        return copy(
          db.orders
            .filter(function (o) {
              return o.user_id === u.id;
            })
            .sort(function (a, b) {
              return b.created_at.localeCompare(a.created_at);
            }),
        );
      });
    },
    getOrder: function (id) {
      return later(function () {
        var u = need(),
          o = db.orders.filter(function (x) {
            return x.id === id && x.user_id === u.id;
          })[0];
        return o ? copy(o) : null;
      });
    },
    uploadProof: function (file, orderId) {
      return compressImage(file, 1000, 0.7)
        .then(function (blob) {
          return new Promise(function (res, rej) {
            var r = new FileReader();
            r.onload = function () {
              res(r.result);
            };
            r.onerror = function () {
              rej(new Error("Gambar gagal dibaca."));
            };
            r.readAsDataURL(blob);
          });
        })
        .then(function (data) {
          dbLoad();
          var u = need(),
            path = u.id + "/" + orderId + "-" + Date.now() + ".jpg";
          db.files[path] = data;
          dbSave();
          return path;
        });
    },
    submitProof: function (orderId, f) {
      return later(function () {
        var u = need(),
          o = find(orderId);
        if (o.user_id !== u.id) throw new Error("Pesanan tidak ditemukan.");
        if (o.status !== "menunggu_bayar" && o.status !== "ditolak")
          throw new Error("Pesanan ini sudah tidak bisa diubah.");
        if (!f.bukti_path || f.bukti_path.indexOf(u.id + "/") !== 0)
          throw new Error("Bukti transfer tidak valid. Unggah ulang fotonya.");
        if (!String(f.nama_pengirim || "").trim())
          throw new Error("Isi nama pemilik rekening pengirim.");
        if (!String(f.bank_pengirim || "").trim())
          throw new Error("Isi bank atau e-wallet pengirim.");
        if (!/^62[1-9]\d{7,12}$/.test(f.nomor_telepon || ""))
          throw new Error("Masukkan nomor WhatsApp Indonesia yang valid.");
        if (!f.whatsapp_opt_in)
          throw new Error("Setujui notifikasi WhatsApp untuk melanjutkan.");
        o.status = "menunggu_verifikasi";
        o.bukti_path = f.bukti_path;
        o.nama_pengirim = f.nama_pengirim.trim();
        o.bank_pengirim = f.bank_pengirim.trim();
        o.tgl_transfer = f.tgl_transfer || null;
        o.nomor_telepon = f.nomor_telepon;
        o.whatsapp_opt_in = true;
        o.whatsapp_notified_at = null;
        o.catatan = (f.catatan || "").trim() || null;
        o.alasan_tolak = null;
        o.dikirim_at = new Date().toISOString();
        dbSave();
        return copy(o);
      });
    },
    cancelOrder: function (id) {
      return later(function () {
        var u = need(),
          o = find(id);
        if (
          o.user_id !== u.id ||
          (o.status !== "menunggu_bayar" && o.status !== "ditolak")
        )
          throw new Error("Pesanan tidak bisa dibatalkan.");
        o.status = "dibatalkan";
        dbSave();
        return copy(o);
      });
    },
    proofUrl: function (path) {
      return later(function () {
        var d = db.files[path];
        if (!d) throw new Error("File bukti tidak ditemukan.");
        return d;
      });
    },
    /* admin */
    adminStats: function () {
      return later(function () {
        needAdmin();
        var now = new Date(),
          awal = new Date(now.getFullYear(), now.getMonth(), 1);
        var ok = db.orders.filter(function (o) {
          return o.status === "disetujui";
        });
        function sum(a) {
          return a.reduce(function (s, o) {
            return s + o.total;
          }, 0);
        }
        return {
          menunggu_verifikasi: db.orders.filter(function (o) {
            return o.status === "menunggu_verifikasi";
          }).length,
          menunggu_bayar: db.orders.filter(function (o) {
            return o.status === "menunggu_bayar";
          }).length,
          pendapatan_bulan_ini: sum(
            ok.filter(function (o) {
              return new Date(o.diproses_at) >= awal;
            }),
          ),
          pendapatan_total: sum(ok),
          pesanan_disetujui: ok.length,
          pengguna: db.users.length,
          akses_aktif: db.users.filter(hasAccess).length,
          lifetime: db.users.filter(function (u) {
            return u.lifetime;
          }).length,
        };
      });
    },
    adminOrders: function (o) {
      o = o || {};
      return later(function () {
        needAdmin();
        var rows = db.orders
          .filter(function (x) {
            return !o.status || o.status === "semua" || x.status === o.status;
          })
          .sort(function (a, b) {
            return b.created_at.localeCompare(a.created_at);
          });
        return copy(
          rows.map(function (x) {
            var u = userOf(x.user_id) || {};
            var c = copy(x);
            c.pengguna = {
              nama: u.nama,
              email: u.email,
              avatar_url: u.avatar_url,
            };
            return c;
          }),
        );
      });
    },
    adminApprove: function (id) {
      return later(function () {
        var adm = needAdmin(),
          o = find(id);
        if (o.status === "disetujui")
          throw new Error("Pesanan ini sudah disetujui sebelumnya.");
        if (o.status === "dibatalkan")
          throw new Error("Pesanan ini sudah dibatalkan pembeli.");
        var u = userOf(o.user_id);
        var group =
          o.plan_id === "rencana-rumahku"
            ? "rencana"
            : o.plan_id === "financial-tools"
              ? "tools"
              : o.akses_grup || "semua";
        if (group === "rencana") {
          if (o.durasi_hari == null) {
            u.rencana_lifetime = true;
            u.akses_rencana_sampai = null;
          } else if (!u.rencana_lifetime) {
            var rencanaFrom = Math.max(
              Date.now(),
              u.akses_rencana_sampai
                ? new Date(u.akses_rencana_sampai).getTime()
                : 0,
            );
            u.akses_rencana_sampai = new Date(
              rencanaFrom + o.durasi_hari * 86400000,
            ).toISOString();
          }
        } else if (group === "tools") {
          if (o.durasi_hari == null) {
            u.tools_lifetime = true;
            u.akses_tools_sampai = null;
          } else if (!u.tools_lifetime) {
            var toolsFrom = Math.max(
              Date.now(),
              u.akses_tools_sampai
                ? new Date(u.akses_tools_sampai).getTime()
                : 0,
            );
            u.akses_tools_sampai = new Date(
              toolsFrom + o.durasi_hari * 86400000,
            ).toISOString();
          }
        } else if (o.durasi_hari == null) {
          u.lifetime = true;
          u.plan_id = o.plan_id;
        } else {
          var from = Math.max(
            Date.now(),
            u.akses_sampai ? new Date(u.akses_sampai).getTime() : 0,
          );
          u.akses_sampai = new Date(
            from + o.durasi_hari * 86400000,
          ).toISOString();
          if (!u.lifetime) u.plan_id = o.plan_id;
        }
        o.status = "disetujui";
        o.diproses_at = new Date().toISOString();
        o.diproses_oleh = adm.id;
        o.alasan_tolak = null;
        dbSave();
        return copy(o);
      });
    },
    adminReject: function (id, alasan) {
      return later(function () {
        var adm = needAdmin(),
          o = find(id);
        if (!String(alasan || "").trim())
          throw new Error(
            "Tulis alasan penolakan agar pembeli tahu apa yang perlu diperbaiki.",
          );
        if (!pending(o))
          throw new Error(
            "Pesanan ini tidak bisa ditolak (sudah diproses atau dibatalkan).",
          );
        o.status = "ditolak";
        o.alasan_tolak = alasan.trim();
        o.diproses_at = new Date().toISOString();
        o.diproses_oleh = adm.id;
        dbSave();
        return copy(o);
      });
    },
    adminUsers: function (qs) {
      return later(function () {
        needAdmin();
        qs = String(qs || "")
          .toLowerCase()
          .trim();
        return copy(
          db.users
            .filter(function (u) {
              return (
                !qs ||
                (u.email || "").toLowerCase().indexOf(qs) > -1 ||
                (u.nama || "").toLowerCase().indexOf(qs) > -1
              );
            })
            .sort(function (a, b) {
              return b.created_at.localeCompare(a.created_at);
            }),
        );
      });
    },
    adminSetAccess: function (userId, o) {
      return later(function () {
        needAdmin();
        var u = userOf(userId);
        if (!u) throw new Error("Pengguna tidak ditemukan.");
        u.lifetime = !!o.lifetime;
        u.akses_sampai = o.lifetime ? null : o.akses_sampai || null;
        if (!u.lifetime && !u.akses_sampai) {
          u.rencana_lifetime = false;
          u.tools_lifetime = false;
          u.akses_rencana_sampai = null;
          u.akses_tools_sampai = null;
        }
        dbSave();
        return copy(u);
      });
    },
    adminPlans: function () {
      return later(function () {
        needAdmin();
        return copy(
          db.plans.slice().sort(function (a, b) {
            return a.urutan - b.urutan;
          }),
        );
      });
    },
    adminSavePlan: function (p) {
      return later(function () {
        needAdmin();
        p.akses_grup = p.akses_grup || "semua";
        var i = db.plans
          .map(function (x) {
            return x.id;
          })
          .indexOf(p.id);
        if (i > -1) db.plans[i] = Object.assign({}, db.plans[i], p);
        else db.plans.push(p);
        dbSave();
        return [copy(p)];
      });
    },
    adminDeletePlan: function (id) {
      return later(function () {
        needAdmin();
        db.plans = db.plans.filter(function (p) {
          return p.id !== id;
        });
        dbSave();
        return null;
      });
    },
    adminSaveSettings: function (key, value) {
      return later(function () {
        needAdmin();
        db.settings[key] = value;
        dbSave();
        return null;
      });
    },
  };

  /* ---------- Rakit antarmuka publik ---------- */
  impl = LIVE ? SB : DEMO;
  Object.keys(impl).forEach(function (k) {
    A[k] = function () {
      var args = arguments;
      return A.init().then(function () {
        return impl[k].apply(null, args);
      });
    };
  });
  // refreshUser tidak boleh menunggu init yang sama dua kali; tidak masalah karena init sudah ter-resolve.
  A.getUser = function () {
    return A.user;
  };
  window.RCApi = A;
})();
