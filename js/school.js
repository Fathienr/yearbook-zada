document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const root = document.getElementById("page-content");
  root.innerHTML = `<section style="padding:6rem 0;text-align:center;"><p style="color:var(--text-faint);font-family:var(--mono);font-size:0.85rem;">Memuat data sekolah&hellip;</p></section>`;
  const school = id ? await ZadaData.getSchoolById(id) : null;

  if (!school) {
    root.innerHTML = `
      <section style="padding:6rem 0;text-align:center;">
        <div class="container">
          <span class="eyebrow">404</span>
          <h1 style="font-family:var(--display);font-size:2rem;margin:0.6rem 0 1rem;">Sekolah tidak ditemukan</h1>
          <p style="color:var(--text-muted);margin-bottom:1.6rem;">Tautan ini mungkin sudah tidak berlaku, atau data sekolah telah dihapus dari arsip.</p>
          <a href="index.html" class="btn btn-primary">Kembali ke Portofolio</a>
        </div>
      </section>
    `;
    return;
  }

  const unlockKey = `zada_unlocked_${school.id}`;
  const isProtected = Boolean(school.hasPassword);
  // Session-only convenience so the visitor isn't asked again on this
  // device during this browser tab session. It does NOT grant access on
  // its own — it's just a flag we check before re-fetching from Firestore.
  const alreadyUnlockedThisSession = sessionStorage.getItem(unlockKey) === "1";

  if (!isProtected) {
    renderFullDetail(school.editions || []);
  } else if (alreadyUnlockedThisSession) {
    const cached = JSON.parse(sessionStorage.getItem(`${unlockKey}_data`) || "{}");
    renderFullDetail(cached.editions || []);
  } else {
    renderLockGate();
  }

  function renderLockGate() {
    root.innerHTML = `
      <section style="padding:5rem 0;">
        <div class="container">
          <a href="index.html#portofolio" class="back-link">&larr; Kembali ke Portofolio</a>
          <div class="lock-gate">
            <span class="lock-icon">&#128274;</span>
            <span class="eyebrow">Portofolio Privat</span>
            <h1>${school.school}</h1>
            <p>Portofolio buku tahunan sekolah ini bersifat privat untuk menjaga kerahasiaan dokumentasi siswa. Masukkan kata sandi yang diberikan oleh pihak sekolah untuk melihat seluruh edisi.</p>
            <form id="lock-form">
              <div class="field">
                <label for="lock-password">Kata Sandi</label>
                <input type="password" id="lock-password" autocomplete="off" required />
              </div>
              <p class="lock-error" id="lock-error">Kata sandi salah. Coba lagi atau hubungi pihak ZADA.</p>
              <button type="submit" class="btn btn-primary" id="lock-submit">Buka Portofolio</button>
            </form>
            <a href="progress.html?id=${encodeURIComponent(school.id)}" class="lock-gate-alt-link">Hanya ingin cek perkembangan buku? &rarr;</a>
          </div>
        </div>
      </section>
    `;

    const form = document.getElementById("lock-form");
    const errorEl = document.getElementById("lock-error");
    const submitBtn = document.getElementById("lock-submit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.style.display = "none";
      submitBtn.disabled = true;
      submitBtn.textContent = "Memeriksa...";

      const value = document.getElementById("lock-password").value;
      // The candidate password is hashed and checked against Firestore —
      // the real password is never compared in this page's JS, so it's
      // never sitting in view-source or memory as plaintext to steal.
      const portal = await ZadaData.tryUnlockPortal(school.id, value);

      if (portal !== null) {
        sessionStorage.setItem(unlockKey, "1");
        sessionStorage.setItem(`${unlockKey}_data`, JSON.stringify(portal));
        renderFullDetail(portal.editions);
      } else {
        errorEl.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.textContent = "Buka Portofolio";
      }
    });
  }

  function renderFullDetail(editionsRaw) {
    const pal = ZadaData.palette(school.palette);
    const initial = school.school.trim().charAt(0).toUpperCase();
    const editions = (editionsRaw || []).slice().sort((a, b) => b.year - a.year);
    const totalStudents = editions.reduce((sum, e) => sum + (Number(e.students) || 0), 0);
    const years = editions.map((e) => e.year).sort((a, b) => b - a);
    const yearLabel = years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : `${years[0] || "-"}`;

    const editionsHTML = editions.length
      ? editions
          .map((e) => {
            const isLiveLink = e.flipbookUrl && !e.flipbookUrl.includes("/example/");
            const flipEmbed = isLiveLink
              ? `<iframe src="${e.flipbookUrl}" loading="lazy" allowfullscreen title="Flipbook ${school.school} ${e.year}"></iframe>`
              : `<div class="flip-fallback">
                  Pratinjau flipbook AnyFlip edisi ${e.year} akan tampil di sini setelah tautan proyek terhubung ke akun AnyFlip ZADA.<br />
                  <a href="${e.flipbookUrl}" target="_blank" rel="noopener" style="color:var(--maroon);font-family:var(--mono);">${e.flipbookUrl}</a>
                </div>`;
            return `
      <div class="edition-block">
        <div class="edition-head">
          <div>
            <span class="eyebrow">Edisi ${e.year}</span>
            <h3>Buku Tahunan ${e.year}</h3>
          </div>
          <div class="edition-badges">
            <span class="pill">${e.category}</span>
            <span class="pill">${e.students} Siswa</span>
          </div>
        </div>
        <p class="edition-summary">${e.summary}</p>
        <div class="flip-frame">
          <div class="frame-bar">
            <span>anyflip.com</span>
            <a href="${e.flipbookUrl}" target="_blank" rel="noopener">Buka di tab baru &rarr;</a>
          </div>
          ${flipEmbed}
        </div>
      </div>
    `;
          })
          .join("")
      : `<div class="empty-state">Belum ada edisi buku tahunan tercatat untuk sekolah ini.</div>`;

    root.innerHTML = `
    <header class="detail-hero">
      <div class="container">
        <a href="index.html#portofolio" class="back-link">&larr; Kembali ke Portofolio</a>
        <div class="detail-grid">
          <div class="detail-cover" style="background:${pal.base}">
            ${school.cover ? `<img class="detail-cover-img" src="${school.cover}" alt="Sampul ${school.school}" />` : `<span class="card-initial">${initial}</span>`}
          </div>
          <div class="detail-title">
            <span class="eyebrow">${school.level} &middot; ${editions.length} Edisi Tersedia${school.hasPassword ? " &middot; &#128274; Privat" : ""}</span>
            <h1>${school.school}</h1>
            <div class="detail-meta">
              <div><span>Jenjang</span><strong>${school.level}</strong></div>
              <div><span>Rentang Edisi</span><strong>${yearLabel}</strong></div>
              <div><span>Total Edisi</span><strong>${editions.length}</strong></div>
              <div><span>Total Siswa Terdokumentasi</span><strong>${totalStudents}</strong></div>
            </div>
            <p class="detail-summary">Semua buku tahunan yang telah diproduksi ZADA untuk ${school.school} terkumpul di satu halaman ini — pilih edisi tahun mana pun untuk membaca flipbook-nya secara interaktif.</p>
            <div class="detail-actions">
              <a href="progress.html?id=${encodeURIComponent(school.id)}" class="btn btn-ghost">Cek Perkembangan Buku &rarr;</a>
            </div>
          </div>
        </div>
      </div>
    </header>

    <section class="detail-body">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="eyebrow">Semua Portofolio</span>
            <h2>Edisi buku tahunan ${school.school}</h2>
            <p>Diurutkan dari edisi terbaru. Setiap edisi dipublikasikan melalui AnyFlip sehingga dapat dibaca langsung tanpa perlu mengunduh file.</p>
          </div>
        </div>
        <div class="editions-list">
          ${editionsHTML}
        </div>
      </div>
    </section>
  `;
  }
});
