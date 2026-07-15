document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const root = document.getElementById("page-content");
  root.innerHTML = `<section style="padding:6rem 0;text-align:center;"><p style="color:var(--text-faint);font-family:var(--mono);font-size:0.85rem;">Memuat perkembangan&hellip;</p></section>`;
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

  // Shares the same unlock key/session cache as school.html — a visitor
  // who already unlocked the portfolio (or unlocks it here first) does not
  // need to type the password twice in the same browser tab.
  const unlockKey = `zada_unlocked_${school.id}`;
  const isProtected = Boolean(school.hasPassword);
  const alreadyUnlockedThisSession = sessionStorage.getItem(unlockKey) === "1";

  if (!isProtected) {
    renderProgress(school.progress || ZadaData.defaultProgress());
  } else if (alreadyUnlockedThisSession) {
    const cached = JSON.parse(sessionStorage.getItem(`${unlockKey}_data`) || "{}");
    renderProgress(cached.progress || ZadaData.defaultProgress());
  } else {
    renderLockGate();
  }

  function renderLockGate() {
    root.innerHTML = `
      <section style="padding:5rem 0;">
        <div class="container">
          <a href="school.html?id=${encodeURIComponent(school.id)}" class="back-link">&larr; Kembali ke halaman sekolah</a>
          <div class="lock-gate">
            <span class="lock-icon">&#128274;</span>
            <span class="eyebrow">Perkembangan Privat</span>
            <h1>${school.school}</h1>
            <p>Progres pengerjaan buku tahunan sekolah ini bersifat privat. Masukkan kata sandi yang diberikan oleh tim ZADA untuk melihat tahap yang sedang berjalan.</p>
            <form id="lock-form">
              <div class="field">
                <label for="lock-password">Kata Sandi</label>
                <input type="password" id="lock-password" autocomplete="off" required />
              </div>
              <p class="lock-error" id="lock-error">Kata sandi salah. Coba lagi atau hubungi pihak ZADA.</p>
              <button type="submit" class="btn btn-primary" id="lock-submit">Lihat Perkembangan</button>
            </form>
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
      const portal = await ZadaData.tryUnlockPortal(school.id, value);

      if (portal !== null) {
        sessionStorage.setItem(unlockKey, "1");
        sessionStorage.setItem(`${unlockKey}_data`, JSON.stringify(portal));
        renderProgress(portal.progress);
      } else {
        errorEl.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.textContent = "Lihat Perkembangan";
      }
    });
  }

  function renderProgress(progress) {
    const stages = ZadaData.stages();
    const current = progress.currentStage || 1;
    const isFullyCompleted = Boolean(progress.completed);

    const stepsHTML = stages
      .map((stage) => {
        const isSkipped = stage.optional && !progress.printOrdered;
        let state = "pending";
        if (isSkipped) state = "skipped";
        else if (isFullyCompleted) state = "done";
        else if (stage.order < current) state = "done";
        else if (stage.order === current) state = "active";

        const statusLabel = {
          done: "Selesai",
          active: "Sedang Berjalan",
          pending: "Menunggu",
          skipped: "Tidak Dipesan",
        }[state];

        return `
      <li class="stage-step stage-step--${state}">
        <div class="stage-step-marker">
          <span class="stage-step-num">${state === "done" ? "&#10003;" : stage.order}</span>
        </div>
        <div class="stage-step-body">
          <span class="stage-step-status">${statusLabel}</span>
          <h3>${stage.title}${stage.optional ? ' <em>(opsional)</em>' : ""}</h3>
          <p>${stage.desc}</p>
        </div>
      </li>`;
      })
      .join("");

    const updatedLabel = progress.updatedAt
      ? new Date(progress.updatedAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })
      : "belum ada pembaruan tercatat";

    root.innerHTML = `
    <header class="detail-hero">
      <div class="container">
        <a href="school.html?id=${encodeURIComponent(school.id)}" class="back-link">&larr; Kembali ke halaman sekolah</a>
        <div class="progress-head">
          <span class="eyebrow">Status Perkembangan &middot; ${school.hasPassword ? "&#128274; Privat" : "Publik"}</span>
          <h1>${school.school}</h1>
          <p class="detail-summary">${
            isFullyCompleted
              ? `Buku tahunan ${school.school} telah rampung diproses oleh tim ZADA, dari konsep hingga pengarsipan resmi.`
              : `Halaman ini menunjukkan sejauh mana buku tahunan ${school.school} telah diproses oleh tim ZADA, mengikuti alur kerja resmi dari konsep hingga pengarsipan.`
          }</p>
        </div>
      </div>
    </header>

    <section class="detail-body">
      <div class="container">
        <div class="progress-panel">
          ${
            isFullyCompleted
              ? `<div class="progress-complete-banner">
                  <span class="progress-complete-icon">&#10003;</span>
                  <div>
                    <strong>Seluruh Proses Selesai</strong>
                    <p>Buku tahunan ini telah tuntas dikerjakan dan diarsipkan secara resmi oleh tim ZADA.</p>
                  </div>
                </div>`
              : ""
          }
          <ol class="stage-track">
            ${stepsHTML}
          </ol>

          ${
            progress.note
              ? `<div class="progress-note"><span class="eyebrow">Catatan dari Tim ZADA</span><p>${progress.note}</p></div>`
              : ""
          }

          <p class="progress-updated">Terakhir diperbarui: ${updatedLabel}</p>

          <div class="detail-actions">
            <a href="school.html?id=${encodeURIComponent(school.id)}" class="btn btn-ghost">Lihat Portofolio &amp; Flipbook &rarr;</a>
          </div>
        </div>
      </div>
    </section>
  `;
  }
});
