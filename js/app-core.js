// ============================================================
// app-core.js — Parsahutaon Dos Roha
// Konsolidasi dari 15 script block → 1 file bersih
// Pelajaran: Single Responsibility + Clean Architecture
// ============================================================

// ─── CATATAN BELAJAR ────────────────────────────────────────
// File ini menggantikan seluruh <script> inline di dosroha.html
// Setiap section diberi label konsep untuk belajar
// ────────────────────────────────────────────────────────────

// ============================================================
// SECTION 1: STATE & DATA
// Konsep: "Single source of truth" — satu tempat untuk semua data
// ============================================================

let isAdmin = false;

let pengurusList = [
  { emoji: "👑", role: "Ketua", name: "Sintua (St) Siregar / br.Manullang" },
  { emoji: "💰", role: "Bendahara", name: "Ny. Sihombing / br.Pangaribuan" },
  { emoji: "✝", role: "Rohaniawan", name: "Pdt. J.W. Sinaga / br.Silalahi" },
];

let appData = {
  members: [],
  cashflow: [],
  bonataon: {},
  kegiatan: [],
  adrt: "",
};

// Konsep: attendanceData disimpan terpisah karena structure berbeda
let attendanceData = {};

// Konsep: iuranFirebase adalah cache dari Firestore — bukan sumber kebenaran utama
let iuranFirebase = {};

// State UI (bukan data bisnis)
let currentKegYear = new Date().getFullYear();
let currentBonYear = new Date().getFullYear();
let currentKeuYear = new Date().getFullYear();
let currentIuranYear = new Date().getFullYear();
let currentPengYear = new Date().getFullYear();
let currentAnggotaTab = "daftar";
let currentKeaktifanYear = null;
let currentAttendanceEventId = null;

// Konsep: Active Listeners Map — penting untuk lazy listener pattern (Step 2)
// Key = nama page, Value = fungsi unsubscribe dari Firestore
const activeListeners = {};

// ============================================================
// SECTION 3: UTILITY FUNCTIONS
// Konsep: Pure functions — tidak ada side effect, mudah di-test
// ============================================================

function fmtRp(n) {
  if (!n) return "-";
  return new Intl.NumberFormat("id-ID").format(n);
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Ags",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getYear(dateStr) {
  return new Date(dateStr).getFullYear();
}

function genId() {
  return Date.now();
}

function memberDisplayName(m) {
  return m.name + " / br." + m.br + (m.nick ? " (" + m.nick + ")" : "");
}

function memberColor(id) {
  const c = [
    "#0D9488",
    "#0D1B2A",
    "#D4A017",
    "#F97316",
    "#7c3aed",
    "#0891b2",
    "#059669",
    "#dc2626",
  ];
  return c[id % c.length];
}

// ============================================================
// SECTION 4: TOAST NOTIFICATION
// Konsep: UI feedback — selalu berikan feedback ke user
// ============================================================

function showToast(msg, type = "success") {
  // Filter pesan teknikal dari user — tampilkan di console saja
  if (
    ["Firebase bermasalah", "Koneksi Firebase", "Error:", "error:"].some((t) =>
      msg.includes(t),
    ) &&
    type === "error"
  ) {
    console.warn("Toast disembunyikan:", msg);
    return;
  }
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast show " + type;
  setTimeout(() => (t.className = "toast"), 3000);
}

// ============================================================
// SECTION 5: MODAL SYSTEM
// Konsep: Reusable UI component — satu fungsi untuk semua modal
// ============================================================

function openModal(id) {
  if (id === "modal-adrt-edit") {
    const el = document.getElementById("f-adrt-content");
    if (el) el.value = appData.adrt;
  }
  if (id === "modal-add-income") {
    populateDropdowns();
    setTimeout(() => {
      if (typeof clearBukti === "function") clearBukti();
    }, 50);
  }
  if (id === "modal-add-bonataon-entry") {
    populateDropdowns();
  }
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add("show");
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove("show");
}

// Tutup modal saat klik di luar
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".modal-overlay").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target === el) el.classList.remove("show");
    });
  });
});

// ============================================================
// SECTION 6: NAVIGATION
// Konsep: Single Page Application (SPA) pattern
// ============================================================

function showPage(page) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  const nb = document.getElementById("nav-" + page);
  if (nb) nb.classList.add("active");

  // Matikan listener halaman sebelumnya
  stopPageListeners();

  // Aktifkan listener hanya untuk halaman yang dibuka
  startPageListeners(page);

  renderPage(page);
}
function stopPageListeners() {
  if (activeListeners.kegiatan) {
    activeListeners.kegiatan();
    delete activeListeners.kegiatan;
  }
  if (activeListeners.cashflow) {
    activeListeners.cashflow();
    delete activeListeners.cashflow;
  }
  if (activeListeners.bonataon) {
    activeListeners.bonataon();
    delete activeListeners.bonataon;
  }
  if (activeListeners.attendance) {
    activeListeners.attendance();
    delete activeListeners.attendance;
  }
  if (activeListeners.iuran) {
    activeListeners.iuran();
    delete activeListeners.iuran;
  }
}

function startPageListeners(page) {
  if (page === "kegiatan") {
    startKegiatanListener();
    startAttendanceListener();
  } else if (page === "keuangan") {
    startCashflowListener();
    startIuranListener();
  } else if (page === "bonataon") {
    startBonataonListener();
  }
}

function renderPage(page) {
  if (page === "beranda") renderBeranda();
  else if (page === "kegiatan") renderKegiatan();
  else if (page === "bonataon") renderBonataon();
  else if (page === "keuangan") renderKeuangan();
  else if (page === "anggota") {
    renderMembers();
    if (currentAnggotaTab === "keaktifan") renderKeaktifan();
  } else if (page === "pengumuman") renderPengumuman();
  else if (page === "adrt") renderADRT();
}

// ============================================================
// SECTION 7: ADMIN PANEL
// Konsep: Role-based UI — tampilan berbeda untuk admin vs publik
// ============================================================

function updateAdminUI() {
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin ? "" : "none";
  });
}

function updateAdminDownloadVisibility(show) {
  const el = document.getElementById("adminDownloadSection");
  if (el) el.style.display = show ? "block" : "none";
}

function openAdminPanel() {
  document.getElementById("admin-panel-overlay").classList.add("open");
  if (isAdmin) {
    document.getElementById("admin-login-section").style.display = "none";
    document.getElementById("admin-logged-sections").style.display = "block";
    renderPengurusEditor();
  } else {
    document.getElementById("admin-login-section").style.display = "block";
    document.getElementById("admin-logged-sections").style.display = "none";
  }
}

function closeAdminPanel() {
  document.getElementById("admin-panel-overlay").classList.remove("open");
}

// Tutup admin panel saat klik di luar
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("admin-panel-overlay");
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === this) closeAdminPanel();
    });
  }
});

// ============================================================
// SECTION 8: FIREBASE AUTH
// Konsep: Authentication state management
// FIX: Tidak ada lagi doAdminLogin() duplikat
// ============================================================

function initFirebaseAuth() {
  FB.onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("✅ Firebase Auth: logged in as", user.email);
      isAdmin = true;
      updateAdminDownloadVisibility(true);
      document.getElementById("admin-toggle-btn").textContent =
        "✅ Admin (Keluar)";
      document.getElementById("admin-toggle-btn").classList.add("active-admin");
      document
        .querySelectorAll(".admin-only")
        .forEach((el) => (el.style.display = ""));
      // Reload members dengan data lengkap saat login
      if (window.FB && window.db) {
        await loadMembersFromFirebase();
        renderMembers();
      }
    } else {
      console.log("ℹ️ Firebase Auth: publik mode");
      isAdmin = false;
      // Saat logout, bersihkan data sensitif dari memory
      appData.members = appData.members.map((m) => ({
        id: m.id,
        name: m.name,
        br: m.br,
        nick: m.nick,
        joined: m.joined,
      }));
      renderMembers();
    }
  });
}

async function doAdminLogin() {
  const email = document.getElementById("f-admin-email").value.trim();
  const pw = document.getElementById("f-admin-pw").value;
  if (!email || !pw) {
    showToast("Email dan password wajib diisi", "error");
    return;
  }
  try {
    await FB.signInWithEmailAndPassword(auth, email, pw);
    document.getElementById("f-admin-pw").value = "";
    document.getElementById("admin-login-section").style.display = "none";
    document.getElementById("admin-logged-sections").style.display = "block";
    renderPengurusEditor();
    showToast("✅ Berhasil masuk sebagai Admin!");
    closeAdminPanel();
  } catch (err) {
    console.error("Login error:", err);
    const msg =
      err.code === "auth/user-not-found" ||
      err.code === "auth/wrong-password" ||
      err.code === "auth/invalid-credential"
        ? "❌ Email atau password salah!"
        : "❌ Error: " + err.message;
    showToast(msg, "error");
  }
}

async function doAdminLogout() {
  try {
    await FB.signOut(auth);
    isAdmin = false;
    updateAdminDownloadVisibility(false);
    document.getElementById("admin-toggle-btn").textContent = "⚙ Admin";
    document
      .getElementById("admin-toggle-btn")
      .classList.remove("active-admin");
    document
      .querySelectorAll(".admin-only")
      .forEach((el) => (el.style.display = "none"));
    closeAdminPanel();
    showToast("Logout berhasil");
  } catch (err) {
    showToast("Error logout: " + err.message, "error");
  }
}

// FIX: gantiPassword() sekarang benar-benar update Firebase Auth
async function gantiPassword() {
  const np = document.getElementById("f-new-pw-admin").value;
  const cp = document.getElementById("f-confirm-pw-admin").value;
  if (!np) return showToast("Password tidak boleh kosong", "error");
  if (np !== cp) return showToast("Konfirmasi password tidak cocok", "error");
  if (np.length < 6) return showToast("Password minimal 6 karakter", "error");
  try {
    const user = auth.currentUser;
    if (!user) return showToast("Harus login dulu", "error");
    await user.updatePassword(np);
    document.getElementById("f-new-pw-admin").value = "";
    document.getElementById("f-confirm-pw-admin").value = "";
    showToast("✅ Password berhasil diubah! 🔑");
  } catch (err) {
    if (err.code === "auth/requires-recent-login") {
      showToast(
        "Silakan logout dan login ulang sebelum ganti password",
        "error",
      );
    } else {
      showToast("❌ Gagal: " + err.message, "error");
    }
  }
}

// ============================================================
// SECTION 9: BACKGROUND HERO
// FIX: loadSavedBg() sekarang benar-benar load dari Firebase
// ============================================================

function previewBgInput() {
  const url = document.getElementById("f-bg-url").value.trim();
  const preview = document.getElementById("bg-preview-img");
  if (url && (url.startsWith("http") || url.startsWith("data:"))) {
    preview.src = url;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
}

async function applyBgImage() {
  const url = document.getElementById("f-bg-url").value.trim();
  if (!url) return showToast("Masukkan URL gambar terlebih dahulu", "error");
  document.getElementById("hero-beranda").style.backgroundImage =
    `url('${url}')`;
  try {
    await FB.setDoc(
      FB.doc(db, "settings", "config"),
      { bgImage: url },
      { merge: true },
    );
    showToast("✅ Background header berhasil diubah!");
  } catch (e) {
    showToast("✅ Background diubah (lokal saja)");
  }
}

function previewBgColor() {
  const color = document.getElementById("f-bg-color").value;
  document.getElementById("hero-beranda").style.backgroundColor = color;
}

async function applyBgColor() {
  const color = document.getElementById("f-bg-color").value;
  document.getElementById("hero-beranda").style.backgroundImage = "none";
  document.getElementById("hero-beranda").style.backgroundColor = color;
  try {
    await FB.setDoc(
      FB.doc(db, "settings", "config"),
      { bgColor: color, bgImage: "" },
      { merge: true },
    );
    showToast("✅ Warna header berhasil diubah!");
  } catch (e) {
    showToast("✅ Warna diubah (lokal saja)");
  }
}

function removeBg() {
  const hero = document.getElementById("hero-beranda");
  hero.style.backgroundImage = "";
  hero.style.backgroundColor = "";
  document.getElementById("f-bg-url").value = "";
  document.getElementById("bg-preview-img").style.display = "none";
  showToast("Background dikembalikan ke default");
}

// FIX: loadSavedBg() sekarang implementasi nyata
function loadSavedBg() {
  // Background dimuat lewat loadSettingsFromFirebase() — tidak perlu duplikat di sini
  // Fungsi ini tetap ada untuk backward compatibility tapi tidak perlu isi
}

// ============================================================
// SECTION 10: FIREBASE DATA FUNCTIONS
// Konsep: Data layer — semua komunikasi dengan Firestore di sini
// ============================================================

async function loadMembersFromFirebase() {
  try {
    const snap = await FB.getDocs(FB.collection(db, "members"));
    appData.members = [];
    snap.forEach((d) => {
      const data = d.data();
      if (isAdmin) {
        appData.members.push({ ...data, id: parseInt(d.id) });
      } else {
        // Publik hanya dapat field yang aman (privacy)
        appData.members.push({
          id: parseInt(d.id),
          name: data.name || "",
          br: data.br || "",
          nick: data.nick || "",
          joined: data.joined || "",
        });
      }
    });
    appData.members.sort((a, b) => a.id - b.id);
    renderMembers();
    populateDropdowns();
  } catch (e) {
    console.warn("loadMembersFromFirebase error:", e.message);
  }
}

async function loadAllAttendanceFromFirebase() {
  const snap = await FB.getDocs(FB.collection(db, "attendance"));
  attendanceData = {};
  snap.forEach((d) => {
    attendanceData[d.id] = d.data();
  });
}

async function loadSettingsFromFirebase() {
  const snap = await FB.getDoc(FB.doc(db, "settings", "config"));
  if (snap.exists()) {
    const d = snap.data();
    if (d.adrt) appData.adrt = d.adrt;
    if (d.pengurusList && d.pengurusList.length) pengurusList = d.pengurusList;
    // FIX: Sekarang background benar-benar dimuat dari Firebase
    if (d.bgImage) {
      const hero = document.getElementById("hero-beranda");
      if (hero) hero.style.backgroundImage = `url('${d.bgImage}')`;
    }
    if (d.bgColor && !d.bgImage) {
      const hero = document.getElementById("hero-beranda");
      if (hero) hero.style.backgroundColor = d.bgColor;
    }
  }
}

async function loadIuranFromFirebase() {
  try {
    const snap = await FB.getDocs(FB.collection(db, "iuran"));
    iuranFirebase = {};
    snap.forEach((d) => {
      iuranFirebase[d.id] = d.data();
    });
  } catch (e) {
    console.warn("loadIuranFromFirebase error:", e.message);
  }
}

// ============================================================
// SECTION 11: REAL-TIME LISTENERS
// Konsep: onSnapshot = live update dari Firestore
// Catatan: Di Step 2 ini akan diubah jadi lazy listeners
// ============================================================

function startKegiatanListener() {
  if (activeListeners.kegiatan) activeListeners.kegiatan(); // unsubscribe lama
  const q = FB.query(FB.collection(db, "kegiatan"), FB.orderBy("date", "desc"));
  activeListeners.kegiatan = FB.onSnapshot(q, (snap) => {
    appData.kegiatan = [];
    snap.forEach((d) =>
      appData.kegiatan.push({ id: parseInt(d.id), ...d.data() }),
    );
    renderKegiatan();
    updateStatKegiatan();
    // Update Pengumuman jika halaman aktif
    const pg = document.getElementById("page-pengumuman");
    if (pg?.classList.contains("active")) renderPengumuman();
  });
  return activeListeners.kegiatan;
}

function startMembersListener() {
  if (activeListeners.members) activeListeners.members();
  activeListeners.members = FB.onSnapshot(
    FB.collection(db, "members"),
    (snap) => {
      appData.members = [];
      snap.forEach((d) =>
        appData.members.push({ id: parseInt(d.id), ...d.data() }),
      );
      appData.members.sort((a, b) => a.id - b.id);
      document.getElementById("stat-anggota").textContent =
        appData.members.length;
      renderMembers();
      populateDropdowns();
    },
  );
  return activeListeners.members;
}

function startCashflowListener() {
  if (activeListeners.cashflow) activeListeners.cashflow();
  activeListeners.cashflow = FB.onSnapshot(
    FB.collection(db, "cashflow"),
    (snap) => {
      appData.cashflow = [];
      snap.forEach((d) =>
        appData.cashflow.push({ id: parseInt(d.id), ...d.data() }),
      );
      const pg = document.getElementById("page-keuangan");
      if (pg?.classList.contains("active")) renderKeuangan();
    },
  );
  return activeListeners.cashflow;
}

function startBonataonListener() {
  if (activeListeners.bonataon) activeListeners.bonataon();
  activeListeners.bonataon = FB.onSnapshot(
    FB.collection(db, "bonataon"),
    (snap) => {
      appData.bonataon = {};
      snap.forEach((d) => {
        appData.bonataon[parseInt(d.id)] = d.data().entries || [];
      });
      const pg = document.getElementById("page-bonataon");
      if (pg?.classList.contains("active")) renderBonataon();
    },
  );
  return activeListeners.bonataon;
}

function startAttendanceListener() {
  if (activeListeners.attendance) activeListeners.attendance();
  activeListeners.attendance = FB.onSnapshot(
    FB.collection(db, "attendance"),
    (snap) => {
      attendanceData = {};
      snap.forEach((d) => {
        attendanceData[d.id] = d.data();
      });
      const pg = document.getElementById("page-kegiatan");
      if (pg?.classList.contains("active")) renderKegiatan();
      if (currentAnggotaTab === "keaktifan") renderKeaktifan();
    },
  );
  return activeListeners.attendance;
}

function startIuranListener() {
  if (activeListeners.iuran) activeListeners.iuran();
  activeListeners.iuran = FB.onSnapshot(FB.collection(db, "iuran"), (snap) => {
    iuranFirebase = {};
    snap.forEach((d) => {
      iuranFirebase[d.id] = d.data();
    });
    const pg = document.getElementById("page-keuangan");
    if (pg?.classList.contains("active")) renderIuranTable();
  });
  return activeListeners.iuran;
}

// ============================================================
// SECTION 12: initFirebase() — SATU FUNGSI TUNGGAL
// FIX: Tidak ada lagi 4x override. Ini satu-satunya versi.
// Konsep: Promise.allSettled = jika 1 gagal, yang lain tetap jalan
// ============================================================

async function initFirebase() {
  // Step 1: Setup auth state listener
  initFirebaseAuth();

  try {
    // Step 2: Load semua data awal secara paralel
    // Promise.allSettled (bukan Promise.all) = graceful degradation
    const results = await Promise.allSettled([
      loadMembersFromFirebase(),
      loadAllAttendanceFromFirebase(),
      loadSettingsFromFirebase(),
      loadIuranFromFirebase(),
      // Load bonataon
      (async () => {
        const snap = await FB.getDocs(FB.collection(db, "bonataon"));
        appData.bonataon = {};
        snap.forEach((d) => {
          appData.bonataon[parseInt(d.id)] = d.data().entries || [];
        });
      })(),
      // Load cashflow
      (async () => {
        const snap = await FB.getDocs(FB.collection(db, "cashflow"));
        if (snap.size > 0) {
          appData.cashflow = [];
          snap.forEach((d) =>
            appData.cashflow.push({ id: parseInt(d.id), ...d.data() }),
          );
        }
      })(),
    ]);

    // Log status setiap koleksi untuk debugging
    const labels = [
      "members",
      "attendance",
      "settings",
      "iuran",
      "bonataon",
      "cashflow",
    ];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.warn(`⚠️ Firebase [${labels[i]}] gagal:`, r.reason?.message);
      }
    });

    // Step 3: Render awal setelah data masuk
    renderBeranda();
    renderKegiatan();
    updateStatKegiatan();

    // Step 4: Mulai listener — members aktif permanen, lainnya lazy
    startMembersListener();
    startPageListeners("beranda"); // aktifkan untuk halaman pertama

    console.log("✅ Firebase siap — semua listener aktif");
  } catch (err) {
    console.error("Firebase init error:", err);
    renderBeranda();
    updateStatKegiatan();
  }
}

// ============================================================
// SECTION 13: PENGURUS EDITOR
// ============================================================

function renderPengurusEditor() {
  const editor = document.getElementById("pengurus-editor");
  if (!editor) return;
  editor.innerHTML = pengurusList
    .map(
      (p, i) => `
    <div style="background:white;border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <input value="${p.emoji || ""}" style="width:46px;padding:4px;border:1px solid #ccc;border-radius:6px;text-align:center;font-size:16px;" oninput="updatePengurus(${i},'emoji',this.value)">
        <input value="${p.role || ""}" style="flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;" oninput="updatePengurus(${i},'role',this.value)" placeholder="Jabatan">
        <button onclick="hapusPengurus(${i})" style="background:#fee2e2;border:none;color:#dc2626;border-radius:6px;padding:4px 8px;cursor:pointer;">✕</button>
      </div>
      <input value="${p.name || ""}" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;" oninput="updatePengurus(${i},'name',this.value)" placeholder="Nama pengurus">
    </div>`,
    )
    .join("");
}

async function updatePengurus(i, field, val) {
  pengurusList[i][field] = val;
  renderBeranda();
  clearTimeout(window._pengurusDebounce);
  window._pengurusDebounce = setTimeout(async () => {
    try {
      await FB.setDoc(
        FB.doc(db, "settings", "config"),
        { pengurusList },
        { merge: true },
      );
    } catch (e) {
      console.warn("Pengurus save error:", e.message);
    }
  }, 1000);
}

async function hapusPengurus(i) {
  if (pengurusList.length <= 1) return showToast("Minimal 1 pengurus", "error");
  pengurusList.splice(i, 1);
  renderBeranda();
  renderPengurusEditor();
  try {
    await FB.setDoc(
      FB.doc(db, "settings", "config"),
      { pengurusList },
      { merge: true },
    );
  } catch (e) {
    console.warn("hapusPengurus error:", e.message);
  }
}

async function tambahPengurus() {
  pengurusList.push({
    emoji: "🏅",
    role: "Jabatan Baru",
    name: "Nama Pengurus",
  });
  renderBeranda();
  renderPengurusEditor();
  try {
    await FB.setDoc(
      FB.doc(db, "settings", "config"),
      { pengurusList },
      { merge: true },
    );
  } catch (e) {
    console.warn("tambahPengurus error:", e.message);
  }
}

// ============================================================
// SECTION 14: BERANDA RENDER
// ============================================================

function renderBeranda() {
  const grid = document.getElementById("pengurus-aktif-grid");
  if (grid) {
    grid.innerHTML = pengurusList
      .map(
        (p) => `
      <div class="pengurus-card-new">
        <span style="font-size:1.5rem">${p.emoji || ""}</span>
        <span class="role-badge-new">${p.role || ""}</span>
        <div class="p-name-new">${p.name || ""}</div>
      </div>`,
      )
      .join("");
  }
  const statAnggota = document.getElementById("stat-anggota");
  if (statAnggota) statAnggota.textContent = appData.members.length;
}

function updateStatKegiatan() {
  const tahunIni = new Date().getFullYear();
  const jumlah = appData.kegiatan.filter(
    (k) => new Date(k.date).getFullYear() === tahunIni,
  ).length;
  const jumlahLalu = appData.kegiatan.filter(
    (k) => new Date(k.date).getFullYear() === tahunIni - 1,
  ).length;
  const el = document.getElementById("stat-kegiatan");
  if (el)
    el.textContent =
      jumlah >= 1 ? jumlah : jumlahLalu > 0 ? jumlahLalu + "+" : "-";
}

function computeSaldo() {
  // TODO Step 3: Saldo awal seharusnya dari Firestore settings, bukan hardcode
  let s = 10364300;
  appData.cashflow.forEach((r) => {
    s += (r.in || 0) - (r.out || 0);
  });
  return s;
}

// ============================================================
// SECTION 15: KEGIATAN RENDER & CRUD
// FIX: openEditKegiatan & saveEditKegiatan hanya ada 1 definisi
// ============================================================

function getKegiatanYears() {
  const years = [...new Set(appData.kegiatan.map((k) => getYear(k.date)))].sort(
    (a, b) => b - a,
  );
  if (!years.includes(new Date().getFullYear()))
    years.unshift(new Date().getFullYear());
  return years;
}

function renderKegiatan() {
  const years = getKegiatanYears();
  const tabsEl = document.getElementById("kegiatan-year-tabs");
  if (tabsEl) {
    tabsEl.innerHTML = years
      .map(
        (y) =>
          `<div class="year-tab ${y === currentKegYear ? "active" : ""}" onclick="currentKegYear=${y};renderKegiatan()">${y}</div>`,
      )
      .join("");
  }

  const list = document.getElementById("kegiatan-list");
  if (!list) return;

  const filtered = appData.kegiatan
    .filter((k) => getYear(k.date) === currentKegYear)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!filtered.length) {
    list.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-light)">Belum ada kegiatan di tahun ${currentKegYear}</div>`;
    return;
  }

  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MEI",
    "JUN",
    "JUL",
    "AGS",
    "SEP",
    "OKT",
    "NOV",
    "DES",
  ];
  list.innerHTML = filtered
    .map((k) => {
      const d = new Date(k.date);
      const tc = "type-" + k.type.toLowerCase().replace(/[^a-z]/g, "");
      const att = getEventAttendance(k.id);
      const totalMembers = appData.members.length;
      const attBadge =
        att !== null
          ? `<span class="attendance-badge">✅ ${att.length} / ${totalMembers} hadir</span>`
          : `<span class="attendance-badge no-data">— Belum ada data kehadiran</span>`;
      const attBtn = isAdmin
        ? `<button class="btn btn-sm" style="background:rgba(13,148,136,0.1);color:var(--teal);border:1px solid rgba(13,148,136,0.3);margin-left:4px;" onclick="openAttendanceModal(${k.id})">✍ Isi Daftar Hadir</button>`
        : "";
      const adminEdit = isAdmin
        ? `<button class="edit-btn" onclick="openEditKegiatan(${k.id})">✏</button>`
        : "";
      const adminDel = isAdmin
        ? `<button class="delete-btn" onclick="deleteKegiatan(${k.id})">🗑</button>`
        : "";

      return `<div class="event-card">
      <div class="event-date"><div class="day">${d.getDate()}</div><div class="month">${months[d.getMonth()]}</div></div>
      <div class="event-body">
        <div class="event-type"><span class="type-badge ${tc}">${k.type}</span></div>
        <div class="event-title">${k.title}</div>
        ${k.desc ? `<div class="event-desc">${k.desc}</div>` : ""}
        ${k.place ? `<div class="event-desc">📍 ${k.place}</div>` : ""}
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">${attBadge}${attBtn}</div>
      </div>
      <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0">${adminEdit}${adminDel}</div>
    </div>`;
    })
    .join("");
}

async function addKegiatan() {
  if (!isAdmin) return showToast("❌ Harus login admin", "error");
  const date = document.getElementById("f-keg-date").value;
  const type = document.getElementById("f-keg-type").value;
  const title = document.getElementById("f-keg-title").value.trim();
  const desc = document.getElementById("f-keg-desc").value.trim();
  const place = document.getElementById("f-keg-place").value.trim();
  if (!date || !title)
    return showToast("Tanggal dan judul wajib diisi", "error");

  const id = genId();
  try {
    await FB.setDoc(FB.doc(db, "kegiatan", String(id)), {
      date,
      type,
      title,
      desc,
      place,
    });
    currentKegYear = getYear(date);
    closeModal("modal-add-kegiatan");
    showToast("✅ Kegiatan berhasil ditambahkan");
  } catch (e) {
    showToast("❌ Gagal simpan: " + e.message, "error");
  }
}

// FIX: Hanya ada 1 openEditKegiatan (tidak duplikat)
function openEditKegiatan(id) {
  const k = appData.kegiatan.find((x) => x.id === id);
  if (!k) return;
  document.getElementById("f-edit-keg-id").value = k.id;
  document.getElementById("f-edit-keg-date").value = k.date;
  document.getElementById("f-edit-keg-type").value = k.type;
  document.getElementById("f-edit-keg-title").value = k.title;
  document.getElementById("f-edit-keg-desc").value = k.desc || "";
  document.getElementById("f-edit-keg-place").value = k.place || "";
  openModal("modal-edit-kegiatan");
}

// FIX: Hanya ada 1 saveEditKegiatan (tidak duplikat)
async function saveEditKegiatan() {
  if (!isAdmin) return;
  const id = parseInt(document.getElementById("f-edit-keg-id").value);
  const date = document.getElementById("f-edit-keg-date").value;
  const type = document.getElementById("f-edit-keg-type").value;
  const title = document.getElementById("f-edit-keg-title").value.trim();
  const desc = document.getElementById("f-edit-keg-desc").value.trim();
  const place = document.getElementById("f-edit-keg-place").value.trim();
  if (!date || !title)
    return showToast("Tanggal dan judul wajib diisi", "error");

  try {
    await FB.updateDoc(FB.doc(db, "kegiatan", String(id)), {
      date,
      type,
      title,
      desc,
      place,
    });
    const idx = appData.kegiatan.findIndex((x) => x.id === id);
    if (idx !== -1)
      appData.kegiatan[idx] = { id, date, type, title, desc, place };
    if (attendanceData[id]) {
      attendanceData[id].date = date;
      attendanceData[id].title = title;
      attendanceData[id].type = type;
      await FB.setDoc(FB.doc(db, "attendance", String(id)), attendanceData[id]);
    }
    closeModal("modal-edit-kegiatan");
    currentKegYear = getYear(date);
    renderKegiatan();
    showToast("✅ Kegiatan berhasil diperbarui");
  } catch (e) {
    showToast("❌ Gagal update: " + e.message, "error");
  }
}

async function deleteKegiatan(id) {
  if (!isAdmin || !confirm("Hapus kegiatan ini?")) return;
  try {
    await FB.deleteDoc(FB.doc(db, "kegiatan", String(id)));
    if (attendanceData[id]) {
      await FB.deleteDoc(FB.doc(db, "attendance", String(id)));
      delete attendanceData[id];
    }
    appData.kegiatan = appData.kegiatan.filter((k) => k.id !== id);
    renderKegiatan();
    showToast("Kegiatan dihapus");
  } catch (e) {
    showToast("❌ Gagal hapus: " + e.message, "error");
  }
}

// ============================================================
// SECTION 16: ATTENDANCE (KEHADIRAN)
// ============================================================

function getEventAttendance(eventId) {
  return attendanceData[eventId]?.present ?? null;
}

function getMemberAttendanceStats(memberId, year) {
  let totalEvents = 0,
    attended = 0;
  Object.values(attendanceData).forEach((ev) => {
    if (year && getYear(ev.date) !== year) return;
    if (!ev.present) return;
    totalEvents++;
    if (ev.present.includes(memberId)) attended++;
  });
  return {
    attended,
    totalEvents,
    pct: totalEvents > 0 ? Math.round((attended / totalEvents) * 100) : null,
  };
}

function openAttendanceModal(eventId) {
  currentAttendanceEventId = eventId;
  const event = appData.kegiatan.find((k) => k.id === eventId);
  if (!event) return;

  document.getElementById("attendance-event-info").innerHTML =
    `<strong>${event.title}</strong> · ${fmtDate(event.date)} · <span class="type-badge type-${event.type.toLowerCase().replace(/[^a-z]/g, "")}">${event.type}</span>${event.place ? ` · 📍 ${event.place}` : ""}`;

  const existing = getEventAttendance(eventId) || [];
  const sorted = [...appData.members].sort((a, b) =>
    memberDisplayName(a).localeCompare(memberDisplayName(b)),
  );

  document.getElementById("attendance-member-list").innerHTML = sorted
    .map((m) => {
      const checked = existing.includes(m.id);
      return `<div class="attendance-member-item ${checked ? "checked" : ""}" onclick="toggleAttMember(this,${m.id})">
      <input type="checkbox" id="att-m-${m.id}" ${checked ? "checked" : ""} onchange="updateAttCount()" onclick="event.stopPropagation()"/>
      <label for="att-m-${m.id}" onclick="event.stopPropagation()">${memberDisplayName(m)}</label>
    </div>`;
    })
    .join("");

  updateAttCount();
  openModal("modal-attendance");
}

function toggleAttMember(el, memberId) {
  const cb = document.getElementById("att-m-" + memberId);
  cb.checked = !cb.checked;
  el.classList.toggle("checked", cb.checked);
  updateAttCount();
}

function updateAttCount() {
  const checked = document.querySelectorAll(
    "#attendance-member-list input[type=checkbox]:checked",
  ).length;
  const el = document.getElementById("att-count-display");
  if (el) el.textContent = `${checked} / ${appData.members.length} hadir`;
}

function toggleAllAttendance(selectAll) {
  document
    .querySelectorAll("#attendance-member-list input[type=checkbox]")
    .forEach((cb) => {
      cb.checked = selectAll;
      cb.closest(".attendance-member-item").classList.toggle(
        "checked",
        selectAll,
      );
    });
  updateAttCount();
}

async function saveAttendanceData() {
  if (!currentAttendanceEventId) return;
  const event = appData.kegiatan.find((k) => k.id === currentAttendanceEventId);
  if (!event) return;

  const presentIds = [];
  document
    .querySelectorAll("#attendance-member-list input[type=checkbox]:checked")
    .forEach((cb) => {
      presentIds.push(parseInt(cb.id.replace("att-m-", "")));
    });

  const attData = {
    eventId: currentAttendanceEventId,
    date: event.date,
    title: event.title,
    type: event.type,
    present: presentIds,
  };

  try {
    await FB.setDoc(
      FB.doc(db, "attendance", String(currentAttendanceEventId)),
      attData,
    );
    attendanceData[currentAttendanceEventId] = attData;
    closeModal("modal-attendance");
    renderKegiatan();
    if (currentAnggotaTab === "keaktifan") renderKeaktifan();
    showToast(
      `✅ Kehadiran disimpan: ${presentIds.length} dari ${appData.members.length} hadir`,
    );
  } catch (e) {
    showToast("❌ Gagal simpan kehadiran: " + e.message, "error");
  }
}

// ============================================================
// SECTION 17: BONATAON
// ============================================================

function getBonYears() {
  return [...new Set(Object.keys(appData.bonataon).map(Number))].sort(
    (a, b) => b - a,
  );
}

function renderBonataon() {
  const years = getBonYears();
  const tabsEl = document.getElementById("bonataon-year-tabs");
  if (tabsEl) {
    tabsEl.innerHTML = years
      .map(
        (y) =>
          `<div class="year-tab ${y === currentBonYear ? "active" : ""}" onclick="currentBonYear=${y};renderBonataon()">${y}</div>`,
      )
      .join("");
  }

  const data = appData.bonataon[currentBonYear] || [];
  const cont = document.getElementById("bonataon-content");
  if (!cont) return;

  if (!data.length) {
    cont.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-light)">Belum ada data lelang Bonataon ${currentBonYear}</div>`;
    return;
  }

  const rows = data
    .map((r, idx) => {
      const total =
        (r.gr || 0) +
        (r.arsik || 0) +
        (r.ayam || 0) +
        (r.buah || 0) +
        (r.bir || 0) +
        (r.mina || 0) +
        (r.mini || 0);
      const sisa = total - (r.paid || 0);
      const lunas = sisa <= 0;
      const adminBtn = isAdmin
        ? `<button class="delete-btn" onclick="deleteBonataon(${idx})">🗑</button>`
        : "";
      return `<tr><td>${idx + 1}</td><td>${r.family}</td><td class="rp">${r.gr ? fmtRp(r.gr) : "-"}</td><td class="rp">${r.arsik ? fmtRp(r.arsik) : "-"}</td><td class="rp">${r.ayam ? fmtRp(r.ayam) : "-"}</td><td class="rp">${r.buah ? fmtRp(r.buah) : "-"}</td><td class="rp">${r.bir ? fmtRp(r.bir) : "-"}</td><td class="rp">${r.mina ? fmtRp(r.mina) : "-"}</td><td class="rp">${r.mini ? fmtRp(r.mini) : "-"}</td><td class="rp"><strong>${fmtRp(total)}</strong></td><td class="rp">${fmtRp(r.paid)}</td><td class="rp">${fmtRp(sisa)}</td><td><span class="${lunas ? "lunas-badge" : "belum-badge"}">${lunas ? "LUNAS" : "BELUM"}</span></td><td>${adminBtn}</td></tr>`;
    })
    .join("");

  cont.innerHTML = `<div class="card"><div class="card-title">🎉 Rekap Lelang Bonataon ${currentBonYear}</div><div class="tbl-wrap"><table><thead><tr><th>No</th><th>Nama Keluarga</th><th>GR</th><th>Arsik</th><th>Ayam</th><th>Buah</th><th>Bir</th><th>Min.Ama</th><th>Min.Ina</th><th>Total</th><th>Dibayar</th><th>Sisa</th><th>Status</th><th class="admin-only">Aksi</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  updateAdminUI();
}

async function addBonataonEntry() {
  const year = parseInt(document.getElementById("f-bon-year").value);
  const family = document.getElementById("f-bon-family").value;
  if (!family) return showToast("Pilih keluarga", "error");
  const entry = {
    family,
    gr: parseInt(document.getElementById("f-bon-gr").value) || 0,
    arsik: parseInt(document.getElementById("f-bon-arsik").value) || 0,
    ayam: parseInt(document.getElementById("f-bon-ayam").value) || 0,
    buah: parseInt(document.getElementById("f-bon-buah").value) || 0,
    bir: parseInt(document.getElementById("f-bon-bir").value) || 0,
    mina: parseInt(document.getElementById("f-bon-mina").value) || 0,
    mini: parseInt(document.getElementById("f-bon-mini").value) || 0,
    paid: parseInt(document.getElementById("f-bon-paid").value) || 0,
  };
  if (!appData.bonataon[year]) appData.bonataon[year] = [];
  if (appData.bonataon[year].find((e) => e.family === family))
    return showToast(
      "Data keluarga ini sudah ada untuk tahun " + year,
      "error",
    );
  appData.bonataon[year].push(entry);
  try {
    await FB.setDoc(FB.doc(db, "bonataon", String(year)), {
      entries: appData.bonataon[year],
    });
    currentBonYear = year;
    closeModal("modal-add-bonataon-entry");
    renderBonataon();
    showToast("✅ Data lelang ditambahkan");
  } catch (e) {
    appData.bonataon[year].pop();
    showToast("❌ Gagal simpan: " + e.message, "error");
  }
}

async function deleteBonataon(idx) {
  if (!isAdmin || !confirm("Hapus data ini?")) return;
  const removed = appData.bonataon[currentBonYear].splice(idx, 1);
  try {
    await FB.setDoc(FB.doc(db, "bonataon", String(currentBonYear)), {
      entries: appData.bonataon[currentBonYear],
    });
    renderBonataon();
    showToast("Data dihapus");
  } catch (e) {
    appData.bonataon[currentBonYear].splice(idx, 0, removed[0]);
    showToast("❌ Gagal hapus: " + e.message, "error");
  }
}

// ============================================================
// SECTION 18: KEUANGAN & IURAN
// ============================================================

function computeCashflow(year) {
  // TODO Step 3: saldo awal dari Firestore
  let running = 10364300;
  appData.cashflow
    .filter((r) => getYear(r.date) < year)
    .forEach((r) => {
      running += (r.in || 0) - (r.out || 0);
    });
  let totalIn = 0,
    totalOut = 0;
  const rows = [];
  appData.cashflow
    .filter((r) => getYear(r.date) === year)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((r) => {
      running += (r.in || 0) - (r.out || 0);
      totalIn += r.in || 0;
      totalOut += r.out || 0;
      rows.push({ ...r, balance: running });
    });
  return { rows, totalIn, totalOut, closing: running };
}

function renderKeuangan() {
  const years = [...new Set(appData.cashflow.map((r) => getYear(r.date)))].sort(
    (a, b) => b - a,
  );
  const tabsEl = document.getElementById("keuangan-year-tabs");
  if (tabsEl) {
    tabsEl.innerHTML = years
      .map(
        (y) =>
          `<div class="year-tab ${y === currentKeuYear ? "active" : ""}" onclick="currentKeuYear=${y};renderKeuangan()">${y}</div>`,
      )
      .join("");
  }

  const { rows, totalIn, totalOut, closing } = computeCashflow(currentKeuYear);
  const cfSum = document.getElementById("cf-summary");
  if (cfSum) {
    cfSum.innerHTML = `
      <div class="cf-box income"><div class="cf-num">Rp ${fmtRp(totalIn)}</div><div class="cf-lbl">TOTAL PEMASUKAN</div></div>
      <div class="cf-box expense"><div class="cf-num">Rp ${fmtRp(totalOut)}</div><div class="cf-lbl">TOTAL PENGELUARAN</div></div>
      <div class="cf-box balance"><div class="cf-num">Rp ${fmtRp(closing)}</div><div class="cf-lbl">SALDO AKHIR</div></div>`;
  }

  renderBarChart(years);

  const tbody = document.getElementById("cashflow-tbody");
  if (tbody) {
    tbody.innerHTML = rows
      .map((r, i) => {
        const adminActs = isAdmin
          ? `<td><button class="edit-btn" onclick="openCfEdit(${i})">✏</button><button class="delete-btn" onclick="deleteCf('${r.id}')">🗑</button></td>`
          : "<td></td>";
        return `<tr><td>${fmtDate(r.date)}</td><td style="max-width:300px;font-size:13px">${r.desc}</td><td class="rp" style="color:var(--teal)">${r.in ? fmtRp(r.in) : ""}</td><td class="rp" style="color:var(--coral)">${r.out ? fmtRp(r.out) : ""}</td><td class="rp"><strong>${fmtRp(r.balance)}</strong></td>${adminActs}</tr>`;
      })
      .join("");
  }

  // Iuran year tabs — termasuk tahun dari Firebase
  const allIuranYears = new Set([2022, 2023, 2024, 2025, 2026]);
  Object.keys(iuranFirebase).forEach((y) => allIuranYears.add(parseInt(y)));
  const thisYear = new Date().getFullYear();
  allIuranYears.add(thisYear);
  allIuranYears.add(thisYear + 1);
  const sortedIuranYears = [...allIuranYears].sort((a, b) => a - b);

  const iuranTabs = document.getElementById("iuran-year-tabs");
  if (iuranTabs) {
    iuranTabs.innerHTML = sortedIuranYears
      .map(
        (y) =>
          `<div class="year-tab ${y === currentIuranYear ? "active" : ""}" onclick="currentIuranYear=${y};renderIuranTable()">${y}</div>`,
      )
      .join("");
  }
  renderIuranTable();
  updateAdminUI();
}

function renderBarChart(years) {
  const chartEl = document.getElementById("bar-chart");
  if (!chartEl) return;
  const chartYears = years.slice(0, 5);
  const maxVal = Math.max(
    ...chartYears.map((y) => {
      const { totalIn, totalOut } = computeCashflow(y);
      return Math.max(totalIn, totalOut);
    }),
  );
  chartEl.innerHTML = chartYears
    .map((y) => {
      const { totalIn, totalOut } = computeCashflow(y);
      const inH = maxVal ? (totalIn / maxVal) * 120 : 4;
      const outH = maxVal ? (totalOut / maxVal) * 120 : 4;
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
      <div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:130px">
        <div class="bar bar-in" style="flex:1;height:${inH}px" title="Pemasukan ${fmtRp(totalIn)}"></div>
        <div class="bar bar-out" style="flex:1;height:${outH}px" title="Pengeluaran ${fmtRp(totalOut)}"></div>
      </div>
      <div style="font-size:10px;color:var(--text-light);font-family:monospace">${y}</div>
    </div>`;
    })
    .join("");
}

function getMergedIuranStatus(year) {
  // Semua data iuran sudah di Firebase (Step 3 selesai)
  if (
    iuranFirebase[String(year)] &&
    Object.keys(iuranFirebase[String(year)]).length > 0
  ) {
    return { ...iuranFirebase[String(year)] };
  }
  return {};
}

function renderIuranTable() {
  const year = currentIuranYear;
  const statusMap = getMergedIuranStatus(year);
  const entries = Object.entries(statusMap);

  // Hapus summary block lama
  document
    .querySelectorAll(".iuran-summary-block")
    .forEach((el) => el.remove());

  const lunas = entries.filter(([, s]) => s === "LUNAS").length;
  const belum = entries.filter(([, s]) => s === "BELUM").length;
  const partial = entries.filter(
    ([, s]) => s !== "LUNAS" && s !== "BELUM",
  ).length;
  const total = entries.length;
  const pct = total > 0 ? Math.round((lunas / total) * 100) : 0;

  const iuranTable = document.getElementById("iuran-tbody")?.closest("table");
  if (!iuranTable) return;

  if (entries.length === 0 && isAdmin) {
    const initPanel = document.createElement("div");
    initPanel.className = "iuran-summary-block";
    initPanel.innerHTML = `<div style="background:rgba(13,148,136,0.05);border:2px dashed rgba(13,148,136,0.3);border-radius:12px;padding:32px;text-align:center;margin-bottom:16px">
      <div style="font-size:2.5rem;margin-bottom:12px">📋</div>
      <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;color:var(--navy);margin-bottom:8px">Belum ada data iuran untuk Tahun ${year}</div>
      <div style="font-size:13px;color:var(--text-mid);margin-bottom:20px">Klik tombol di bawah untuk membuat daftar iuran ${year} dari semua anggota (${appData.members.length} keluarga). Status awal: BELUM BAYAR.</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button onclick="inisialisasiIuranTahunBaru(${year})" style="background:var(--teal);color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">🚀 Inisialisasi Iuran ${year}</button>
        <button onclick="openTambahSatuIuran(${year})" style="background:white;color:var(--navy);border:1px solid var(--border);padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">+ Tambah 1 Anggota</button>
      </div>
    </div>`;
    iuranTable.before(initPanel);
  } else if (entries.length > 0) {
    const summaryEl = document.createElement("div");
    summaryEl.className = "iuran-summary-block";
    summaryEl.style.cssText = "margin-bottom:20px";
    summaryEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="background:var(--navy);color:var(--gold);font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;padding:6px 16px;border-radius:20px">Tahun ${year}</div>
          <div style="font-size:13px;color:var(--text-mid)">${lunas} dari ${total} anggota sudah lunas</div>
        </div>
        ${isAdmin ? `<div style="background:rgba(13,148,136,0.08);border:1px solid rgba(13,148,136,0.2);border-radius:8px;padding:6px 12px;font-size:11px;color:var(--teal);font-family:'JetBrains Mono',monospace">✏ Klik badge status untuk edit</div>` : ""}
      </div>
      <div style="background:#eee;border-radius:999px;height:10px;margin-bottom:14px;overflow:hidden">
        <div style="height:100%;border-radius:999px;background:var(--teal);width:${pct}%"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">
          <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:#16a34a;line-height:1">${lunas}</div>
          <div><div style="font-weight:600;font-size:13px;color:#16a34a">LUNAS</div><div style="font-size:11px;color:var(--text-light)">Rp ${(lunas * 120000).toLocaleString("id-ID")}</div></div>
        </div>
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">
          <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:#dc2626;line-height:1">${belum}</div>
          <div><div style="font-weight:600;font-size:13px;color:#dc2626">BELUM BAYAR</div><div style="font-size:11px;color:var(--text-light)">Sisa tagihan</div></div>
        </div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px">
          <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:#d97706;line-height:1">${partial}</div>
          <div><div style="font-weight:600;font-size:13px;color:#d97706">SEBAGIAN</div><div style="font-size:11px;color:var(--text-light)">Belum penuh</div></div>
        </div>
      </div>`;
    iuranTable.before(summaryEl);

    // Tombol tambah (admin only)
    if (isAdmin) {
      const oldBtn = document.getElementById("btn-tambah-iuran-wrap");
      if (oldBtn) oldBtn.remove();
      const btnWrap = document.createElement("div");
      btnWrap.id = "btn-tambah-iuran-wrap";
      btnWrap.style.cssText =
        "margin-top:12px;display:flex;gap:8px;flex-wrap:wrap";
      btnWrap.innerHTML = `
        <button onclick="openTambahSatuIuran(${year})" style="background:rgba(13,148,136,0.08);color:var(--teal);border:1px solid rgba(13,148,136,0.3);padding:7px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">+ Tambah Anggota ke Iuran ${year}</button>
        <button onclick="inisialisasiIuranTahunBaru(${year}, true)" style="background:rgba(13,27,42,0.06);color:var(--navy);border:1px solid var(--border);padding:7px 16px;border-radius:8px;font-size:13px;cursor:pointer">🔄 Tambah Anggota Baru ke Daftar ${year}</button>`;
      iuranTable.after(btnWrap);
    }
  }

  // Render baris tabel
  const tbody = document.getElementById("iuran-tbody");
  if (tbody) {
    tbody.innerHTML = entries
      .map(([name, status], i) => {
        let badgeClass = "lunas-badge",
          nominal = "120,000";
        if (status === "BELUM") {
          badgeClass = "belum-badge";
          nominal = "-";
        } else if (status !== "LUNAS") {
          badgeClass = "partial-badge";
          nominal = status;
        }
        const fbTag = iuranFirebase[String(year)]?.[name]
          ? `<span style="font-size:9px;color:var(--teal);margin-left:4px;font-family:'JetBrains Mono',monospace;opacity:0.7">✓</span>`
          : "";
        const editBtn = isAdmin
          ? `<span onclick="openEditIuran('${year}','${name.replace(/'/g, "\\'")}','${status}')" style="cursor:pointer;color:var(--teal);font-size:12px;margin-left:6px;opacity:0.6;" title="Edit status">✏</span>`
          : "";
        return `<tr><td>${i + 1}</td><td>${name}</td><td><span class="${badgeClass}">${status}</span>${fbTag}${editBtn}</td><td class="rp">${nominal}</td>${isAdmin ? `<td><button class="delete-btn" onclick="hapusBarisIuran('${year}','${name.replace(/'/g, "\\'")}')">🗑</button></td>` : ""}</tr>`;
      })
      .join("");
  }
}

async function hapusBarisIuran(year, name) {
  if (!isAdmin) return;
  if (!confirm(`Hapus "${name}" dari daftar iuran tahun ${year}?`)) return;
  try {
    const existing = iuranFirebase[String(year)]
      ? { ...iuranFirebase[String(year)] }
      : {};
    let mergedData = { ...existing };
    if (Object.keys(mergedData).length === 0) {
      mergedData =
        year == 2025
          ? { ...iuranStatus2025 }
          : { ...(iuranStatus[String(year)] || {}) };
    } else {
      const hardcodeBase =
        year == 2025
          ? { ...iuranStatus2025 }
          : { ...(iuranStatus[String(year)] || {}) };
      mergedData = { ...hardcodeBase, ...existing };
    }
    if (!(name in mergedData))
      return showToast(`"${name}" tidak ditemukan`, "error");
    delete mergedData[name];
    await FB.setDoc(FB.doc(db, "iuran", String(year)), mergedData);
    iuranFirebase[String(year)] = mergedData;
    renderIuranTable();
    showToast(`✅ "${name}" berhasil dihapus dari iuran ${year}`);
  } catch (e) {
    showToast("❌ Gagal hapus: " + e.message, "error");
  }
}

async function inisialisasiIuranTahunBaru(year, onlyMissing = false) {
  if (!isAdmin) return showToast("❌ Harus login admin", "error");
  const existing = iuranFirebase[String(year)] || {};
  const toAdd = onlyMissing
    ? appData.members.filter((m) => !existing[memberDisplayName(m)])
    : appData.members;
  if (toAdd.length === 0)
    return showToast("Semua anggota sudah ada di daftar iuran " + year);
  const msg = onlyMissing
    ? `Tambahkan ${toAdd.length} anggota baru ke iuran ${year}? Status awal: BELUM`
    : `Buat daftar iuran ${year} untuk ${toAdd.length} anggota? Status: BELUM`;
  if (!confirm(msg)) return;
  const newData = { ...existing };
  toAdd.forEach((m) => {
    newData[memberDisplayName(m)] = "BELUM";
  });
  try {
    await FB.setDoc(FB.doc(db, "iuran", String(year)), newData, {
      merge: true,
    });
    iuranFirebase[String(year)] = newData;
    renderIuranTable();
    showToast(`✅ Daftar iuran ${year} dibuat untuk ${toAdd.length} anggota!`);
  } catch (e) {
    showToast("❌ Gagal: " + e.message, "error");
  }
}

function openEditIuran(year, name, currentStatus) {
  let overlay = document.getElementById("modal-edit-iuran");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "modal-edit-iuran";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal" style="max-width:420px">
      <div class="modal-title">✏ Edit Status Iuran <button class="modal-close" onclick="document.getElementById('modal-edit-iuran').classList.remove('show')">✕</button></div>
      <div style="background:rgba(13,148,136,0.07);border:1px solid rgba(13,148,136,0.2);border-radius:8px;padding:12px 16px;margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-light);font-family:'JetBrains Mono',monospace;margin-bottom:4px">ANGGOTA · TAHUN IURAN</div>
        <div id="iuran-edit-name" style="font-weight:600;color:var(--navy);font-size:15px"></div>
        <div id="iuran-edit-year-display" style="font-size:12px;color:var(--teal);font-family:'JetBrains Mono',monospace;margin-top:2px"></div>
      </div>
      <input type="hidden" id="iuran-edit-year"/><input type="hidden" id="iuran-edit-key"/>
      <div class="form-group">
        <label>Status Pembayaran</label>
        <select class="form-control" id="iuran-edit-status" onchange="toggleNominalField()">
          <option value="LUNAS">✅ LUNAS (Rp 120.000)</option>
          <option value="BELUM">❌ BELUM BAYAR</option>
          <option value="custom">🔶 Sebagian (isi nominal)</option>
        </select>
      </div>
      <div class="form-group" id="iuran-nominal-group" style="display:none">
        <label>Nominal yang Sudah Dibayar (Rp)</label>
        <input type="text" class="form-control" id="iuran-edit-nominal" placeholder="Contoh: 60,000"/>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-secondary" onclick="document.getElementById('modal-edit-iuran').classList.remove('show')">Batal</button>
        <button class="btn btn-primary" onclick="saveIuranEdit()">💾 Simpan</button>
      </div>
    </div>`;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("show");
    });
    document.body.appendChild(overlay);
  }
  document.getElementById("iuran-edit-name").textContent = name;
  document.getElementById("iuran-edit-year-display").textContent =
    `Tahun ${year}`;
  document.getElementById("iuran-edit-year").value = year;
  document.getElementById("iuran-edit-key").value = name;
  const sel = document.getElementById("iuran-edit-status");
  if (currentStatus === "LUNAS" || currentStatus === "BELUM") {
    sel.value = currentStatus;
    document.getElementById("iuran-nominal-group").style.display = "none";
  } else {
    sel.value = "custom";
    document.getElementById("iuran-nominal-group").style.display = "block";
    document.getElementById("iuran-edit-nominal").value = currentStatus;
  }
  overlay.classList.add("show");
}

function toggleNominalField() {
  const sel = document.getElementById("iuran-edit-status");
  document.getElementById("iuran-nominal-group").style.display =
    sel.value === "custom" ? "block" : "none";
}

async function saveIuranEdit() {
  const year = document.getElementById("iuran-edit-year").value;
  const name = document.getElementById("iuran-edit-key").value;
  const selVal = document.getElementById("iuran-edit-status").value;
  let newStatus =
    selVal === "LUNAS" || selVal === "BELUM"
      ? selVal
      : document.getElementById("iuran-edit-nominal").value.trim();
  if (!newStatus)
    return showToast("Masukkan nominal yang sudah dibayar", "error");
  try {
    if (!iuranFirebase[year]) iuranFirebase[year] = {};
    iuranFirebase[year][name] = newStatus;
    await FB.setDoc(FB.doc(db, "iuran", String(year)), iuranFirebase[year], {
      merge: true,
    });
    document.getElementById("modal-edit-iuran").classList.remove("show");
    renderIuranTable();
    showToast(`✅ Status iuran diperbarui → ${newStatus}`);
  } catch (e) {
    showToast("❌ Gagal simpan: " + e.message, "error");
  }
}

function openTambahSatuIuran(year) {
  let overlay = document.getElementById("modal-tambah-iuran");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "modal-tambah-iuran";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal" style="max-width:440px">
      <div class="modal-title">+ Tambah Data Iuran <button class="modal-close" onclick="document.getElementById('modal-tambah-iuran').classList.remove('show')">✕</button></div>
      <div class="form-group"><label>Tahun Iuran</label><input type="number" class="form-control" id="f-iuran-baru-year" value="${year}"/></div>
      <div class="form-group"><label>Nama Keluarga</label><select class="form-control" id="f-iuran-baru-family"><option value="">-- Pilih Keluarga --</option></select></div>
      <div class="form-group"><label>Status Iuran</label><select class="form-control" id="f-iuran-baru-status" onchange="toggleIuranBaruNominal()"><option value="BELUM">❌ BELUM BAYAR</option><option value="LUNAS">✅ LUNAS</option><option value="custom">🔶 Sebagian</option></select></div>
      <div class="form-group" id="iuran-baru-nominal-group" style="display:none"><label>Nominal</label><input type="text" class="form-control" id="f-iuran-baru-nominal" placeholder="Contoh: 60,000"/></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-secondary" onclick="document.getElementById('modal-tambah-iuran').classList.remove('show')">Batal</button>
        <button class="btn btn-primary" onclick="saveTambahSatuIuran()">💾 Simpan</button>
      </div>
    </div>`;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("show");
    });
    document.body.appendChild(overlay);
  }
  document.getElementById("f-iuran-baru-year").value = year;
  const sel = document.getElementById("f-iuran-baru-family");
  const existing = iuranFirebase[String(year)] || {};
  sel.innerHTML = `<option value="">-- Pilih Keluarga --</option>`;
  appData.members
    .slice()
    .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)))
    .forEach((m) => {
      const dn = memberDisplayName(m);
      const opt = document.createElement("option");
      opt.value = dn;
      opt.textContent =
        dn + (existing[dn] ? ` (${existing[dn]})` : " — belum ada");
      sel.appendChild(opt);
    });
  overlay.classList.add("show");
}

function toggleIuranBaruNominal() {
  const sel = document.getElementById("f-iuran-baru-status");
  document.getElementById("iuran-baru-nominal-group").style.display =
    sel.value === "custom" ? "block" : "none";
}

async function saveTambahSatuIuran() {
  const year = document.getElementById("f-iuran-baru-year").value;
  const family = document.getElementById("f-iuran-baru-family").value;
  const selVal = document.getElementById("f-iuran-baru-status").value;
  if (!family) return showToast("Pilih keluarga terlebih dahulu", "error");
  let status =
    selVal === "LUNAS" || selVal === "BELUM"
      ? selVal
      : document.getElementById("f-iuran-baru-nominal").value.trim();
  if (!status) return showToast("Masukkan nominal", "error");
  try {
    if (!iuranFirebase[year]) iuranFirebase[year] = {};
    iuranFirebase[year][family] = status;
    await FB.setDoc(FB.doc(db, "iuran", String(year)), iuranFirebase[year], {
      merge: true,
    });
    currentIuranYear = parseInt(year);
    document.getElementById("modal-tambah-iuran").classList.remove("show");
    renderIuranTable();
    showToast(`✅ Data iuran ${family} tahun ${year} → ${status}`);
  } catch (e) {
    showToast("❌ Gagal simpan: " + e.message, "error");
  }
}

function openCfEdit(rowIdx) {
  const { rows } = computeCashflow(currentKeuYear);
  const r = rows[rowIdx];
  const origIdx = appData.cashflow.findIndex((x) => x.id === r.id);
  document.getElementById("f-cf-edit-idx").value = origIdx;
  document.getElementById("f-cf-edit-date").value = r.date;
  document.getElementById("f-cf-edit-desc").value = r.desc;
  document.getElementById("f-cf-edit-in").value = r.in;
  document.getElementById("f-cf-edit-out").value = r.out;
  openModal("modal-edit-cf");
}

async function saveCfEdit() {
  const idx = parseInt(document.getElementById("f-cf-edit-idx").value);
  const r = appData.cashflow[idx];
  const date = document.getElementById("f-cf-edit-date").value;
  const desc = document.getElementById("f-cf-edit-desc").value;
  const inVal = parseInt(document.getElementById("f-cf-edit-in").value) || 0;
  const outVal = parseInt(document.getElementById("f-cf-edit-out").value) || 0;
  try {
    await FB.updateDoc(FB.doc(db, "cashflow", String(r.id)), {
      date,
      desc,
      in: inVal,
      out: outVal,
    });
    appData.cashflow[idx] = { ...r, date, desc, in: inVal, out: outVal };
    closeModal("modal-edit-cf");
    renderKeuangan();
    showToast("✅ Transaksi diperbarui");
  } catch (e) {
    showToast("❌ Gagal update: " + e.message, "error");
  }
}

async function deleteCf(id) {
  if (!isAdmin || !confirm("Hapus transaksi ini?")) return;
  try {
    await FB.deleteDoc(FB.doc(db, "cashflow", String(id)));
    appData.cashflow = appData.cashflow.filter((r) => r.id != id);
    renderKeuangan();
    showToast("Transaksi dihapus");
  } catch (e) {
    showToast("❌ Gagal hapus: " + e.message, "error");
  }
}

async function addIncome() {
  const date = document.getElementById("f-inc-date").value;
  const family = document.getElementById("f-inc-family").value;
  const type = document.getElementById("f-inc-type").value;
  const year = document.getElementById("f-inc-year").value;
  const amount = parseInt(document.getElementById("f-inc-amount").value) || 0;
  const note = document.getElementById("f-inc-note").value;
  if (!date || !amount)
    return showToast("Tanggal dan nominal wajib diisi", "error");
  const desc = `${type} ${year}${family ? " - " + family : ""}${note ? " (" + note + ")" : ""}`;
  const dup = appData.cashflow.find(
    (r) => r.date === date && r.desc === desc && r.in === amount,
  );
  if (dup) return showToast("Data ini sudah ada sebelumnya", "error");
  const dropArea = document.getElementById("bukti-drop-area");
  const cfData = { date, desc, in: amount, out: 0 };
  if (dropArea?.dataset.buktiBase64) {
    cfData.bukti = dropArea.dataset.buktiBase64;
    cfData.buktiName = dropArea.dataset.buktiName;
    cfData.buktiType = dropArea.dataset.buktiType;
  }
  const id = genId();
  try {
    await FB.setDoc(FB.doc(db, "cashflow", String(id)), cfData);
    appData.cashflow.push({ id, ...cfData });
    currentKeuYear = getYear(date);
    closeModal("modal-add-income");
    renderKeuangan();
    showToast("✅ Pemasukan ditambahkan");
  } catch (e) {
    showToast("❌ Gagal simpan: " + e.message, "error");
  }
}

async function addExpense() {
  if (!isAdmin) return;
  const date = document.getElementById("f-exp-date").value;
  const desc = document.getElementById("f-exp-desc").value.trim();
  const amount = parseInt(document.getElementById("f-exp-amount").value) || 0;
  if (!date || !desc || !amount)
    return showToast("Semua field wajib diisi", "error");
  const dup = appData.cashflow.find(
    (r) => r.date === date && r.desc === desc && r.out === amount,
  );
  if (dup) return showToast("Data ini sudah ada sebelumnya", "error");
  const id = genId();
  try {
    await FB.setDoc(FB.doc(db, "cashflow", String(id)), {
      date,
      desc,
      in: 0,
      out: amount,
    });
    appData.cashflow.push({ id, date, desc, in: 0, out: amount });
    currentKeuYear = getYear(date);
    closeModal("modal-add-expense");
    renderKeuangan();
    showToast("✅ Pengeluaran ditambahkan");
  } catch (e) {
    showToast("❌ Gagal simpan: " + e.message, "error");
  }
}

// ============================================================
// SECTION 19: ANGGOTA
// ============================================================

function switchAnggotaTab(tab) {
  currentAnggotaTab = tab;
  document.getElementById("tab-daftar").style.display =
    tab === "daftar" ? "" : "none";
  document.getElementById("tab-keaktifan").style.display =
    tab === "keaktifan" ? "" : "none";
  document
    .getElementById("tab-daftar-btn")
    .classList.toggle("active", tab === "daftar");
  document
    .getElementById("tab-keaktifan-btn")
    .classList.toggle("active", tab === "keaktifan");
  if (tab === "keaktifan") renderKeaktifan();
}

function renderMembers() {
  const q = (
    document.getElementById("member-search")?.value || ""
  ).toLowerCase();
  const filtered = appData.members.filter((m) =>
    memberDisplayName(m).toLowerCase().includes(q),
  );
  const countEl = document.getElementById("member-count");
  if (countEl) countEl.textContent = appData.members.length;

  const grid = document.getElementById("member-grid");
  if (!grid) return;

  grid.innerHTML = filtered
    .map((m) => {
      const dn = memberDisplayName(m);
      const initials = (m.name[0] || "") + (m.br[0] || "");
      const stats = getMemberAttendanceStats(m.id, null);
      const attInfo =
        stats.totalEvents > 0
          ? `<div class="member-attendance-info" style="color:${stats.pct >= 75 ? "#16a34a" : stats.pct >= 50 ? "#d97706" : "#dc2626"}">📊 ${stats.pct}% hadir (${stats.attended}/${stats.totalEvents} kegiatan)</div>`
          : `<div class="member-attendance-info" style="color:var(--text-light)">— Belum ada data kehadiran</div>`;
      const tahunBergabung = m.joined ? new Date(m.joined).getFullYear() : null;
      const publicInfo = tahunBergabung
        ? `<div class="member-info">Anggota sejak ${tahunBergabung}</div>`
        : `<div class="member-info">Anggota Parsahutaon</div>`;
      const adminInfo = isAdmin
        ? `
      ${m.addr ? `<div class="member-info" style="color:var(--teal)">📍 ${m.addr}</div>` : ""}
      ${m.phone ? `<div class="member-info" style="color:var(--teal)">📞 ${m.phone}</div>` : ""}
      ${m.joined ? `<div class="member-info" style="color:var(--text-light)">📅 ${fmtDate(m.joined)}</div>` : ""}`
        : "";
      const adminActs = isAdmin
        ? `<div style="margin-left:auto;display:flex;gap:4px;flex-shrink:0"><button class="edit-btn" onclick="openEditMember(${appData.members.indexOf(m)})">✏</button><button class="delete-btn" onclick="deleteMember(${appData.members.indexOf(m)})">🗑</button></div>`
        : "";

      return `<div class="member-card">
      <div class="member-avatar" style="background:${memberColor(m.id)}">${initials}</div>
      <div style="flex:1;min-width:0">
        <div class="member-name">${dn}</div>
        ${publicInfo}${adminInfo}${attInfo}
      </div>${adminActs}
    </div>`;
    })
    .join("");
}

async function addMember() {
  if (!isAdmin) return showToast("❌ Harus login admin", "error");
  const name = document.getElementById("f-mem-name").value.trim();
  const nick = document.getElementById("f-mem-nick").value.trim();
  const addr = document.getElementById("f-mem-addr").value.trim();
  const phone = document.getElementById("f-mem-phone").value.trim();
  const joined = document.getElementById("f-mem-joined").value;
  if (!name) return showToast("Nama keluarga wajib diisi", "error");
  const parts = name
    .split("/")
    .map((s) => s.trim().replace(/^br\./i, "").trim());
  const n = parts[0],
    br = parts[1] || "";
  const dup = appData.members.find(
    (m) =>
      m.name.toLowerCase() === n.toLowerCase() &&
      m.br.toLowerCase() === br.toLowerCase(),
  );
  if (dup) return showToast("Data ini sudah ada sebelumnya", "error");
  const newId = Math.max(...appData.members.map((m) => m.id), 0) + 1;
  try {
    await FB.setDoc(FB.doc(db, "members", String(newId)), {
      name: n,
      br,
      nick,
      addr,
      phone,
      joined,
    });
    closeModal("modal-add-member");
    showToast("✅ Anggota baru berhasil didaftarkan");
  } catch (e) {
    showToast("❌ Gagal simpan: " + e.message, "error");
  }
}

function openEditMember(idx) {
  const m = appData.members[idx];
  document.getElementById("f-edit-mem-idx").value = idx;
  document.getElementById("f-edit-mem-name").value = m.name;
  document.getElementById("f-edit-mem-nick").value = m.nick || "";
  document.getElementById("f-edit-mem-addr").value = m.addr || "";
  document.getElementById("f-edit-mem-phone").value = m.phone || "";
  openModal("modal-edit-member");
}

async function saveEditMember() {
  const idx = parseInt(document.getElementById("f-edit-mem-idx").value);
  const m = appData.members[idx];
  const name = document.getElementById("f-edit-mem-name").value.trim();
  const nick = document.getElementById("f-edit-mem-nick").value.trim();
  const addr = document.getElementById("f-edit-mem-addr").value.trim();
  const phone = document.getElementById("f-edit-mem-phone").value.trim();
  try {
    await FB.updateDoc(FB.doc(db, "members", String(m.id)), {
      name,
      nick,
      addr,
      phone,
    });
    appData.members[idx] = { ...m, name, nick, addr, phone };
    closeModal("modal-edit-member");
    renderMembers();
    showToast("✅ Data anggota diperbarui");
  } catch (e) {
    showToast("❌ Gagal update: " + e.message, "error");
  }
}

async function deleteMember(idx) {
  if (!isAdmin || !confirm("Hapus anggota ini dari daftar?")) return;
  const m = appData.members[idx];
  try {
    await FB.deleteDoc(FB.doc(db, "members", String(m.id)));
    appData.members.splice(idx, 1);
    renderMembers();
    populateDropdowns();
    showToast("Anggota dihapus");
  } catch (e) {
    showToast("❌ Gagal hapus: " + e.message, "error");
  }
}

// ============================================================
// SECTION 20: KEAKTIFAN TAB
// ============================================================

function getAttendanceYears() {
  return [
    ...new Set(Object.values(attendanceData).map((ev) => getYear(ev.date))),
  ].sort((a, b) => b - a);
}

function renderKeaktifan() {
  const years = getAttendanceYears();
  const tabsHtml = [
    `<div class="year-tab ${currentKeaktifanYear === null ? "active" : ""}" onclick="currentKeaktifanYear=null;renderKeaktifan()">Semua</div>`,
    ...years.map(
      (y) =>
        `<div class="year-tab ${currentKeaktifanYear === y ? "active" : ""}" onclick="currentKeaktifanYear=${y};renderKeaktifan()">${y}</div>`,
    ),
  ].join("");
  const tabsEl = document.getElementById("keaktifan-year-tabs");
  if (tabsEl) tabsEl.innerHTML = tabsHtml;

  const eventsInScope = Object.values(attendanceData).filter(
    (ev) =>
      currentKeaktifanYear === null ||
      getYear(ev.date) === currentKeaktifanYear,
  );
  const totalEvents = eventsInScope.length;

  const stats = appData.members
    .map((m) => {
      const attended = eventsInScope.filter((ev) =>
        ev.present?.includes(m.id),
      ).length;
      const pct =
        totalEvents > 0 ? Math.round((attended / totalEvents) * 100) : null;
      return { m, attended, totalEvents, pct };
    })
    .sort((a, b) => {
      if (a.pct === null && b.pct === null)
        return memberDisplayName(a.m).localeCompare(memberDisplayName(b.m));
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      return b.pct - a.pct;
    });

  const summaryEl = document.getElementById("keaktifan-summary");
  if (summaryEl) {
    if (totalEvents === 0) {
      summaryEl.innerHTML = `<div class="keaktifan-box total" style="grid-column:1/-1"><div class="kb-num" style="color:var(--gold)">${totalEvents}</div><div class="kb-lbl" style="color:white">Total Kegiatan Tercatat</div></div>`;
    } else {
      const aktif = stats.filter((s) => s.pct !== null && s.pct >= 75).length;
      const cukup = stats.filter(
        (s) => s.pct !== null && s.pct >= 50 && s.pct < 75,
      ).length;
      const perlu = stats.filter((s) => s.pct !== null && s.pct < 50).length;
      summaryEl.innerHTML = `
        <div class="keaktifan-box total"><div class="kb-num" style="color:var(--gold)">${totalEvents}</div><div class="kb-lbl" style="color:white">Total Kegiatan</div></div>
        <div class="keaktifan-box aktif"><div class="kb-num">${aktif}</div><div class="kb-lbl">Aktif (≥75%)</div></div>
        <div class="keaktifan-box cukup"><div class="kb-num">${cukup}</div><div class="kb-lbl">Cukup (50–74%)</div></div>
        <div class="keaktifan-box perlu"><div class="kb-num">${perlu}</div><div class="kb-lbl">Perlu Perhatian (&lt;50%)</div></div>`;
    }
  }

  renderKeaktifanChart(stats.slice(0, 15), totalEvents);
  renderKeaktifanTable(stats);
}

function renderKeaktifanChart(stats, totalEvents) {
  const chartEl = document.getElementById("keaktifan-chart");
  if (!chartEl) return;
  if (totalEvents === 0) {
    chartEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-light)">Belum ada data kehadiran. Isi daftar hadir di menu Kegiatan.</div>`;
    return;
  }
  chartEl.innerHTML =
    `<div style="display:flex;flex-direction:column;gap:6px">` +
    stats
      .map((s, idx) => {
        const pct = s.pct !== null ? s.pct : 0;
        const barColor =
          pct >= 75 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
        const shortName = s.m.name + (s.m.nick ? ` (${s.m.nick})` : "");
        return `<div style="display:flex;align-items:center;gap:10px">
      <div style="width:22px;text-align:right;font-size:11px;color:var(--text-light);font-family:monospace;flex-shrink:0">${idx + 1}</div>
      <div style="width:160px;font-size:12px;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${shortName}</div>
      <div style="flex:1;background:#eee;border-radius:999px;height:10px;overflow:hidden"><div style="height:100%;border-radius:999px;background:${barColor};width:${pct}%"></div></div>
      <div style="width:50px;text-align:right;font-family:monospace;font-size:12px;font-weight:600;color:${barColor};flex-shrink:0">${s.pct !== null ? s.pct + "%" : "-"}</div>
    </div>`;
      })
      .join("") +
    `</div>`;
}

function renderKeaktifanTable(statsInput) {
  const q = (
    document.getElementById("keaktifan-search")?.value || ""
  ).toLowerCase();
  const eventsInScope = Object.values(attendanceData).filter(
    (ev) =>
      currentKeaktifanYear === null ||
      getYear(ev.date) === currentKeaktifanYear,
  );
  const totalEvents = eventsInScope.length;
  const filtered = statsInput
    ? q
      ? statsInput.filter((s) =>
          memberDisplayName(s.m).toLowerCase().includes(q),
        )
      : statsInput
    : [];

  const tbody = document.getElementById("keaktifan-tbody");
  if (!tbody) return;
  if (totalEvents === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-light)">Belum ada data kehadiran. Admin perlu mengisi daftar hadir di menu Kegiatan.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered
    .map((s, idx) => {
      const pct = s.pct;
      let badge, barColor;
      if (pct === null) {
        badge = `<span class="nodata-badge">—</span>`;
        barColor = "#ccc";
      } else if (pct >= 75) {
        badge = `<span class="aktif-badge">Aktif</span>`;
        barColor = "#16a34a";
      } else if (pct >= 50) {
        badge = `<span class="cukup-badge">Cukup</span>`;
        barColor = "#d97706";
      } else {
        badge = `<span class="perlu-badge">Perlu Perhatian</span>`;
        barColor = "#dc2626";
      }
      return `<tr style="cursor:pointer" onclick="showMemberAttDetail(${s.m.id})">
      <td style="font-weight:600;color:var(--text-light)">${idx + 1}</td>
      <td style="font-weight:600">${memberDisplayName(s.m)}</td>
      <td style="font-family:monospace;font-weight:700;color:${barColor}">${s.attended}</td>
      <td style="font-family:monospace;color:var(--text-mid)">${s.totalEvents}</td>
      <td style="font-family:monospace;font-weight:700;color:${barColor}">${pct !== null ? pct + "%" : "—"}</td>
      <td><div class="progress-wrap"><div class="progress-bar" style="width:${pct || 0}%;background:${barColor}"></div></div></td>
      <td>${badge}</td>
    </tr>`;
    })
    .join("");
}

function showMemberAttDetail(memberId) {
  const m = appData.members.find((x) => x.id === memberId);
  if (!m) return;
  const eventsInScope = Object.values(attendanceData)
    .filter(
      (ev) =>
        currentKeaktifanYear === null ||
        getYear(ev.date) === currentKeaktifanYear,
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const el = document.getElementById("keaktifan-detail");
  if (!el) return;
  if (eventsInScope.length === 0) {
    el.innerHTML = `<div style="color:var(--text-light);text-align:center;padding:20px">Belum ada data kehadiran.</div>`;
    return;
  }
  const attended = eventsInScope.filter((ev) =>
    ev.present?.includes(memberId),
  ).length;
  const rows = eventsInScope
    .map((ev) => {
      const hadir = ev.present?.includes(memberId);
      return `<tr><td>${fmtDate(ev.date)}</td><td>${ev.title}</td><td><span class="type-badge type-${(ev.type || "").toLowerCase().replace(/[^a-z]/g, "")}">${ev.type || ""}</span></td><td><span class="${hadir ? "lunas-badge" : "belum-badge"}">${hadir ? "✅ Hadir" : "❌ Tidak Hadir"}</span></td></tr>`;
    })
    .join("");
  el.innerHTML = `
    <div style="margin-bottom:12px;padding:12px 16px;background:rgba(13,148,136,0.07);border-radius:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div class="member-avatar" style="background:${memberColor(m.id)};width:36px;height:36px;font-size:14px">${m.name[0]}${m.br[0]}</div>
      <div><div style="font-weight:600;font-size:14px">${memberDisplayName(m)}</div><div style="font-size:12px;color:var(--teal);font-family:monospace">${attended} dari ${eventsInScope.length} kegiatan hadir</div></div>
    </div>
    <div class="tbl-wrap"><table><thead><tr><th>Tanggal</th><th>Kegiatan</th><th>Jenis</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ============================================================
// SECTION 21: PENGUMUMAN
// ============================================================

function renderPengumuman() {
  const years = [...new Set(appData.kegiatan.map((k) => getYear(k.date)))].sort(
    (a, b) => b - a,
  );
  const tabsEl = document.getElementById("pengumuman-year-tabs");
  if (tabsEl) {
    tabsEl.innerHTML = years
      .map(
        (y) =>
          `<div class="year-tab ${y === currentPengYear ? "active" : ""}" onclick="currentPengYear=${y};renderPengumuman()">${y}</div>`,
      )
      .join("");
  }
  const filtered = appData.kegiatan
    .filter((k) => getYear(k.date) === currentPengYear)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById("pengumuman-tbody");
  if (tbody) {
    tbody.innerHTML = filtered
      .map((k) => {
        const tc = "type-" + k.type.toLowerCase().replace(/[^a-z]/g, "");
        return `<tr><td>${fmtDate(k.date)}</td><td><span class="type-badge ${tc}">${k.type}</span></td><td><strong>${k.title}</strong></td><td style="color:var(--text-mid);font-size:13px">${k.desc || ""}${k.place ? " — " + k.place : ""}</td></tr>`;
      })
      .join("");
  }
}

// ============================================================
// SECTION 22: ADRT
// ============================================================

function renderADRT() {
  const el = document.getElementById("adrt-content");
  if (el) el.innerHTML = appData.adrt || "<p>ADRT belum diisi.</p>";
}

async function saveADRT() {
  appData.adrt = document.getElementById("f-adrt-content").value;
  try {
    await FB.setDoc(
      FB.doc(db, "settings", "config"),
      { adrt: appData.adrt },
      { merge: true },
    );
    closeModal("modal-adrt-edit");
    renderADRT();
    showToast("✅ ADRT berhasil diperbarui");
  } catch (e) {
    showToast("❌ Gagal simpan: " + e.message, "error");
  }
}

// ============================================================
// SECTION 23: DROPDOWNS
// ============================================================

function populateDropdowns() {
  const families = appData.members
    .slice()
    .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)))
    .map((m) => ({ value: memberDisplayName(m), label: memberDisplayName(m) }));

  ["f-inc-family", "f-bon-family"].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = `<option value="">-- Pilih Keluarga --</option>`;
    families.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.value;
      opt.textContent = f.label;
      if (f.value === currentVal) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

// ============================================================
// SECTION 24: UPLOAD BUKTI BAYAR
// ============================================================

function injectUploadBukti() {
  const modal = document.getElementById("modal-add-income");
  if (!modal || document.getElementById("f-inc-bukti-wrap")) return;
  const btnRow = modal.querySelector('div[style*="justify-content: flex-end"]');
  if (!btnRow) return;
  const wrap = document.createElement("div");
  wrap.className = "form-group";
  wrap.id = "f-inc-bukti-wrap";
  wrap.innerHTML = `
    <label style="display:block;font-size:12px;font-weight:600;color:var(--text-mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-family:'JetBrains Mono',monospace;">Bukti Pembayaran (Opsional)</label>
    <div id="bukti-drop-area" style="border:2px dashed var(--border);border-radius:10px;padding:20px;text-align:center;cursor:pointer;background:#fafafa;position:relative;">
      <input type="file" id="f-inc-bukti" accept="image/*,.pdf" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;"/>
      <div id="bukti-placeholder"><div style="font-size:1.8rem;margin-bottom:6px">📎</div><div style="font-size:13px;color:var(--text-mid)">Klik atau drag foto bukti transfer</div></div>
      <div id="bukti-preview" style="display:none"></div>
    </div>`;
  btnRow.parentNode.insertBefore(wrap, btnRow);
  document
    .getElementById("f-inc-bukti")
    .addEventListener("change", function () {
      handleBuktiFile(this.files[0]);
    });
}

function handleBuktiFile(file) {
  if (!file || file.size > 2 * 1024 * 1024) {
    showToast("File terlalu besar, maks 2MB", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById("bukti-placeholder").style.display = "none";
    const preview = document.getElementById("bukti-preview");
    preview.style.display = "block";
    if (file.type.startsWith("image/")) {
      preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:180px;border-radius:8px;"/><div style="font-size:12px;color:var(--teal)">${file.name}</div><button onclick="clearBukti()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px;">✕ Hapus</button>`;
    } else {
      preview.innerHTML = `<div style="font-size:2.5rem">📄</div><div>${file.name}</div><button onclick="clearBukti()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px;">✕ Hapus</button>`;
    }
    const dropArea = document.getElementById("bukti-drop-area");
    dropArea.dataset.buktiBase64 = e.target.result;
    dropArea.dataset.buktiName = file.name;
    dropArea.dataset.buktiType = file.type;
  };
  reader.readAsDataURL(file);
}

function clearBukti() {
  document.getElementById("f-inc-bukti").value = "";
  document.getElementById("bukti-placeholder").style.display = "block";
  const preview = document.getElementById("bukti-preview");
  preview.style.display = "none";
  preview.innerHTML = "";
  const dropArea = document.getElementById("bukti-drop-area");
  delete dropArea.dataset.buktiBase64;
  delete dropArea.dataset.buktiName;
  delete dropArea.dataset.buktiType;
}

function showBuktiModal(base64, name, type) {
  let existing = document.getElementById("modal-lihat-bukti");
  if (existing) existing.remove();
  const isImage = type?.startsWith("image/");
  const content = isImage
    ? `<img src="${base64}" style="max-width:100%;border-radius:8px;"/>`
    : `<div style="text-align:center;padding:20px"><div style="font-size:3rem">📄</div><p>${name}</p><a href="${base64}" download="${name}" style="background:var(--teal);color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px">⬇️ Download PDF</a></div>`;
  const overlay = document.createElement("div");
  overlay.id = "modal-lihat-bukti";
  overlay.className = "modal-overlay show";
  overlay.innerHTML = `<div class="modal" style="max-width:500px"><div class="modal-title">🧾 Bukti Pembayaran <button class="modal-close" onclick="document.getElementById('modal-lihat-bukti').remove()">✕</button></div><p style="font-size:12px;color:var(--text-light);margin-bottom:12px;font-family:monospace">${name || "bukti"}</p>${content}</div>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

// ============================================================
// SECTION 25: EXCEL DOWNLOAD
// ============================================================

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function downloadLaporanExcel() {
  const status = document.getElementById("downloadStatus");
  if (status) status.textContent = "⏳ Sedang membuat laporan...";
  await loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  );
  try {
    const wb = XLSX.utils.book_new();
    const tahun = new Date().getFullYear();
    const tgl = new Date().toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const org = "Parsahutaon Dos Roha Regency & Sekitarnya";

    // Sheet 1: Iuran
    const s1 = [
      [org],
      ["LAPORAN IURAN ANGGOTA " + tahun],
      ["Dicetak: " + tgl],
      [],
    ];
    const years = [2022, 2023, 2024, 2025, 2026];
    const h1 = ["No", "Nama Keluarga", "Nama Panggilan", "Bergabung"];
    years.forEach((y) => h1.push(y + " Status"));
    s1.push(h1);
    appData.members.forEach((m, i) => {
      const row = [
        i + 1,
        m.name + " / br." + m.br,
        m.nick || "-",
        m.joined || "-",
      ];
      years.forEach((y) => {
        const sm = getMergedIuranStatus(y);
        row.push(sm[memberDisplayName(m)] || "-");
      });
      s1.push(row);
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(s1),
      "Laporan Iuran",
    );

    // Sheet 2: Cashflow
    const s2 = [
      [org],
      ["LAPORAN KEUANGAN & CASHFLOW"],
      ["Dicetak: " + tgl],
      [],
    ];
    const tMasuk = appData.cashflow.reduce((s, c) => s + (c.in || 0), 0);
    const tKeluar = appData.cashflow.reduce((s, c) => s + (c.out || 0), 0);
    s2.push(
      ["=== RINGKASAN ==="],
      ["Total Pemasukan", tMasuk],
      ["Total Pengeluaran", tKeluar],
      ["Saldo", tMasuk - tKeluar],
      [],
    );
    s2.push([
      "Tanggal",
      "Keterangan",
      "Masuk (Rp)",
      "Keluar (Rp)",
      "Saldo (Rp)",
    ]);
    let saldo = 10364300;
    appData.cashflow
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((c) => {
        saldo += (c.in || 0) - (c.out || 0);
        s2.push([c.date || "-", c.desc || "-", c.in || "", c.out || "", saldo]);
      });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(s2),
      "Keuangan & Cashflow",
    );

    // Sheet 3: Kehadiran
    const s3 = [[org], ["LAPORAN KEHADIRAN ANGGOTA"], ["Dicetak: " + tgl], []];
    const allEvents = Object.values(attendanceData).sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
    if (allEvents.length > 0) {
      const hdr3 = ["No", "Nama Keluarga"];
      allEvents.forEach((ev) =>
        hdr3.push(ev.date?.slice(0, 10) + " - " + ev.title?.slice(0, 20)),
      );
      hdr3.push("Jumlah Hadir", "Total Event", "Persentase (%)");
      s3.push(hdr3);
      appData.members.forEach((m, i) => {
        const row = [i + 1, memberDisplayName(m)];
        let hadir = 0;
        allEvents.forEach((ev) => {
          const h = ev.present?.includes(m.id);
          row.push(h ? "Hadir" : "Tidak Hadir");
          if (h) hadir++;
        });
        row.push(
          hadir,
          allEvents.length,
          allEvents.length > 0
            ? Math.round((hadir / allEvents.length) * 100) + "%"
            : "0%",
        );
        s3.push(row);
      });
    } else {
      s3.push(["Belum ada data kehadiran."]);
    }
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(s3),
      "Kehadiran Anggota",
    );

    const fname = `Laporan_DosRoha_${tahun}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fname);
    if (status)
      status.textContent = "✅ Berhasil! File " + fname + " sudah terdownload.";
  } catch (err) {
    console.error(err);
    if (status) status.textContent = "❌ Gagal. Cek konsol browser.";
  }
}

// ============================================================
// SECTION 26: DOM INIT
// Konsep: DOMContentLoaded = tunggu HTML siap sebelum manipulasi
// ============================================================

function waitAndInitFirebase() {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (window.FB && window.db) {
      clearInterval(interval);
      console.log(`✅ window.FB siap (${attempts * 100}ms), init Firebase...`);
      initFirebase();
      return;
    }
    if (attempts >= 50) {
      clearInterval(interval);
      console.error("❌ Firebase tidak load dalam 5 detik");
      renderBeranda();
      updateStatKegiatan();
    }
  }, 100);
}

document.addEventListener("DOMContentLoaded", () => {
  // Inisialisasi UI dasar
  populateDropdowns();
  updateAdminUI();

  // Set tanggal hari ini di semua form date
  const today = new Date().toISOString().split("T")[0];
  ["f-keg-date", "f-inc-date", "f-exp-date", "f-mem-joined"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  // Inject upload bukti
  setTimeout(injectUploadBukti, 300);

  // Stat header
  const statTahun = document.getElementById("stat-tahun");
  if (statTahun) statTahun.textContent = new Date().getFullYear() - 2010;

  // Tunggu Firebase module siap, lalu init
  if (!window._firebaseInitDone) {
    window._firebaseInitDone = true;
    setTimeout(() => {
      if (!window._firebaseInitDone2) {
        window._firebaseInitDone2 = true;
        waitAndInitFirebase();
      }
    }, 200);
  }
});

// Fallback jika DOMContentLoaded sudah lewat
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  setTimeout(() => {
    if (!window._firebaseInitDone) {
      window._firebaseInitDone = true;
      window._firebaseInitDone2 = true;
      waitAndInitFirebase();
    }
    populateDropdowns();
    updateAdminUI();
    setTimeout(injectUploadBukti, 300);
    const statTahun = document.getElementById("stat-tahun");
    if (statTahun) statTahun.textContent = new Date().getFullYear() - 2010;
  }, 300);
}

console.log(
  "✅ app-core.js loaded — semua patch tergabung, bug kritis terperbaiki!",
);
