/* --- auth guard: real Firebase session check, not a fake sessionStorage flag --- */
auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = "admin-login.html";
  } else {
    renderSchoolTable();
  }
});

document.getElementById("btn-logout").addEventListener("click", () => {
  auth.signOut().then(() => (window.location.href = "admin-login.html"));
});

const toast = document.getElementById("toast");
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ============ SCHOOL TABLE ============ */

const tableBody = document.getElementById("table-body");

async function refreshStats(schools) {
  const allEditions = schools.flatMap((s) => s.editions || []);
  document.getElementById("stat-schools").textContent = schools.length;
  document.getElementById("stat-editions").textContent = allEditions.length;
  document.getElementById("stat-premium").textContent = allEditions.filter(
    (e) => e.category === "Premium"
  ).length;
  document.getElementById("stat-year").textContent = allEditions.length
    ? Math.max(...allEditions.map((e) => e.year))
    : "—";
}

async function renderSchoolTable() {
  tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">Memuat data...</td></tr>`;

  const withTimeout = (promise, ms = 8000) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Waktu tunggu habis (server tidak merespons)")), ms)),
    ]);

  let schools;
  try {
    schools = (await withTimeout(ZadaData.getAllSchools())).sort((a, b) => a.school.localeCompare(b.school));

    // Fetch protected schools' real editions in PARALLEL instead of one
    // at a time — this was the main source of slow loading.
    await Promise.all(
      schools
        .filter((s) => s.hasPassword)
        .map(async (s) => {
          const { editions } = await ZadaData._loadPortalForAdmin(s.id);
          s.editions = editions;
        })
    );
  } catch (err) {
    console.error("Gagal memuat data dari Firestore:", err);
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#f2a6a6;padding:2rem;">
      Gagal memuat data: ${err.code || err.message}.<br/>
      Cek apakah Firestore Rules sudah di-Publish, dan koneksi internet aktif.
    </td></tr>`;
    return;
  }

  await refreshStats(schools);

  if (!schools.length) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">Belum ada sekolah. Klik "Tambah Sekolah" untuk memulai.</td></tr>`;
    return;
  }

  tableBody.innerHTML = schools
    .map((s) => {
      const pal = ZadaData.palette(s.palette);
      const initial = s.school.trim().charAt(0).toUpperCase();
      const years = ZadaData.editionYears(s);
      const yearRange = years.length
        ? years.length > 1
          ? `${years[years.length - 1]}–${years[0]}`
          : `${years[0]}`
        : "—";
      const swatchStyle = s.cover
        ? `background-image:url('${s.cover}')`
        : `background:${pal.base}`;
      return `
      <tr data-id="${s.id}">
        <td><span class="swatch" style="${swatchStyle}">${s.cover ? "" : initial}</span></td>
        <td><strong>${s.school}</strong></td>
        <td>
          <span class="pill">${s.level}</span>
          ${s.hasPassword ? '<span class="pill pill-lock">&#128274; Privat</span>' : ""}
        </td>
        <td>${(s.editions || []).length}</td>
        <td>${yearRange}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="editions">Kelola Edisi</button>
            <button class="icon-btn" data-action="progress">Kelola Progres</button>
            <button class="icon-btn" data-action="edit-school">Edit</button>
            <button class="icon-btn danger" data-action="delete-school">Hapus</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

tableBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.closest("tr").dataset.id;
  const school = await ZadaData.getSchoolById(id);

  if (btn.dataset.action === "edit-school") {
    openSchoolModal(school);
  } else if (btn.dataset.action === "delete-school") {
    if (
      confirm(
        `Hapus "${school.school}" beserta seluruh buku tahunannya? Tindakan ini tidak dapat dibatalkan.`
      )
    ) {
      await ZadaData.removeSchool(id);
      showToast("Sekolah berhasil dihapus.");
      renderSchoolTable();
    }
  } else if (btn.dataset.action === "editions") {
    openEditionsModal(id);
  } else if (btn.dataset.action === "progress") {
    openProgressModal(id, school);
  }
});

/* ============ SCHOOL MODAL (add/edit) ============ */

const schoolOverlay = document.getElementById("school-overlay");
const schoolForm = document.getElementById("school-form");
const schoolModalTitle = document.getElementById("school-modal-title");
const coverInput = document.getElementById("s-cover-input");
const coverHidden = document.getElementById("s-cover");
const coverPreview = document.getElementById("s-cover-preview");

function setCoverPreview(dataUrl, initial) {
  coverHidden.value = dataUrl || "";
  coverPreview.innerHTML = dataUrl
    ? `<img src="${dataUrl}" alt="Pratinjau sampul" />`
    : (initial || "?");
}

coverInput.addEventListener("change", () => {
  const file = coverInput.files && coverInput.files[0];
  if (!file) return;
  if (!/^image\/(jpe?g|png)$/i.test(file.type)) {
    showToast("File harus berformat JPG, JPEG, atau PNG.");
    coverInput.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setCoverPreview(reader.result);
  reader.readAsDataURL(file);
});

function openSchoolModal(school) {
  schoolForm.reset();
  coverInput.value = "";
  if (school) {
    schoolModalTitle.textContent = "Edit Sekolah";
    document.getElementById("s-id").value = school.id;
    document.getElementById("s-name").value = school.school;
    document.getElementById("s-level").value = school.level;
    document.getElementById("s-password").value = "";
    document.getElementById("s-password").placeholder = school.hasPassword
      ? "Kosongkan untuk tetap pakai password lama"
      : "";
    setCoverPreview(school.cover, school.school.trim().charAt(0).toUpperCase());
  } else {
    schoolModalTitle.textContent = "Tambah Sekolah";
    document.getElementById("s-id").value = "";
    document.getElementById("s-password").placeholder = "";
    setCoverPreview("", "?");
  }
  schoolOverlay.classList.add("open");
}

function closeSchoolModal() {
  schoolOverlay.classList.remove("open");
}

document.getElementById("btn-add-school").addEventListener("click", () => openSchoolModal(null));
document.getElementById("btn-school-cancel").addEventListener("click", closeSchoolModal);
schoolOverlay.addEventListener("click", (e) => {
  if (e.target === schoolOverlay) closeSchoolModal();
});

schoolForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("s-id").value;
  const name = document.getElementById("s-name").value.trim();
  const password = document.getElementById("s-password").value.trim();

  if (!id && !password) {
    showToast("Kata sandi wajib diisi untuk menjaga privasi sekolah.");
    document.getElementById("s-password").focus();
    return;
  }

  const patch = {
    school: name,
    level: document.getElementById("s-level").value,
    cover: coverHidden.value,
  };
  if (password) patch.password = password; // only sent if admin actually typed one

  if (id) {
    await ZadaData.updateSchool(id, patch);
    showToast("Data sekolah berhasil diperbarui.");
  } else {
    const newId = `${ZadaData.slugFromSchool(name)}-${Date.now().toString().slice(-4)}`;
    await ZadaData.addSchool({ id: newId, ...patch, palette: Math.floor(Math.random() * 10), editions: [] });
    showToast("Sekolah baru berhasil ditambahkan. Sekarang tambahkan edisi buku tahunannya.");
  }

  closeSchoolModal();
  renderSchoolTable();
});

/* ============ EDITIONS MODAL (list per school) ============ */

const editionsOverlay = document.getElementById("editions-overlay");
const editionsTableBody = document.getElementById("editions-table-body");
const editionsModalTitle = document.getElementById("editions-modal-title");
let activeSchoolId = null;

async function openEditionsModal(schoolId) {
  activeSchoolId = schoolId;
  const school = await ZadaData.getSchoolById(schoolId);
  editionsModalTitle.textContent = `Edisi Buku Tahunan — ${school.school}`;
  await renderEditionsTable();
  editionsOverlay.classList.add("open");
}

function closeEditionsModal() {
  editionsOverlay.classList.remove("open");
  activeSchoolId = null;
  renderSchoolTable();
}

async function renderEditionsTable() {
  const { editions: rawEditions } = await ZadaData._loadPortalForAdmin(activeSchoolId);
  const editions = rawEditions.slice().sort((a, b) => b.year - a.year);

  if (!editions.length) {
    editionsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.6rem;">Belum ada edisi. Klik "+ Tambah Edisi" untuk menambahkan buku tahunan pertama.</td></tr>`;
    return;
  }

  editionsTableBody.innerHTML = editions
    .map(
      (e) => `
    <tr data-edition-id="${e.id}">
      <td><strong>${e.year}</strong></td>
      <td><span class="pill">${e.category}</span></td>
      <td>${e.students}</td>
      <td><a href="${e.flipbookUrl}" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:0.78rem;color:var(--maroon);">Buka &rarr;</a></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit-edition">Edit</button>
          <button class="icon-btn danger" data-action="delete-edition">Hapus</button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}

document.getElementById("btn-editions-close").addEventListener("click", closeEditionsModal);
editionsOverlay.addEventListener("click", (e) => {
  if (e.target === editionsOverlay) closeEditionsModal();
});

editionsTableBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const editionId = btn.closest("tr").dataset.editionId;
  const { editions } = await ZadaData._loadPortalForAdmin(activeSchoolId);
  const edition = editions.find((ed) => ed.id === editionId);

  if (btn.dataset.action === "edit-edition") {
    openEditionForm(edition);
  } else if (btn.dataset.action === "delete-edition") {
    if (confirm(`Hapus edisi tahun ${edition.year}? Tindakan ini tidak dapat dibatalkan.`)) {
      await ZadaData.removeEdition(activeSchoolId, editionId);
      showToast("Edisi berhasil dihapus.");
      renderEditionsTable();
    }
  }
});

/* ============ EDITION FORM MODAL (add/edit one book) ============ */

const editionFormOverlay = document.getElementById("edition-form-overlay");
const editionForm = document.getElementById("edition-form");
const editionFormTitle = document.getElementById("edition-form-title");

function openEditionForm(edition) {
  editionForm.reset();
  if (edition) {
    editionFormTitle.textContent = `Edit Edisi ${edition.year}`;
    document.getElementById("e-id").value = edition.id;
    document.getElementById("e-year").value = edition.year;
    document.getElementById("e-category").value = edition.category;
    document.getElementById("e-students").value = edition.students;
    document.getElementById("e-flipbook").value = edition.flipbookUrl;
    document.getElementById("e-summary").value = edition.summary;
  } else {
    editionFormTitle.textContent = "Tambah Edisi";
    document.getElementById("e-id").value = "";
  }
  editionFormOverlay.classList.add("open");
}

function closeEditionForm() {
  editionFormOverlay.classList.remove("open");
}

document.getElementById("btn-add-edition").addEventListener("click", () => openEditionForm(null));
document.getElementById("btn-edition-cancel").addEventListener("click", closeEditionForm);
editionFormOverlay.addEventListener("click", (e) => {
  if (e.target === editionFormOverlay) closeEditionForm();
});

editionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const editionId = document.getElementById("e-id").value;
  const year = Number(document.getElementById("e-year").value);
  const patch = {
    year,
    category: document.getElementById("e-category").value,
    students: Number(document.getElementById("e-students").value),
    flipbookUrl: document.getElementById("e-flipbook").value.trim(),
    summary: document.getElementById("e-summary").value.trim(),
  };

  if (editionId) {
    await ZadaData.updateEdition(activeSchoolId, editionId, patch);
    showToast("Edisi berhasil diperbarui.");
  } else {
    const newId = `${activeSchoolId}-${year}-${Date.now().toString().slice(-4)}`;
    await ZadaData.addEdition(activeSchoolId, { id: newId, ...patch });
    showToast("Edisi baru berhasil ditambahkan.");
  }

  closeEditionForm();
  renderEditionsTable();
});

/* ============ PROGRESS MODAL (6-tahap alur kerja per sekolah) ============ */

const progressOverlay = document.getElementById("progress-overlay");
const progressForm = document.getElementById("progress-form");
const progressStagesEl = document.getElementById("progress-stages");
const progressSchoolName = document.getElementById("progress-school-name");
let activeProgressSchoolId = null;

function stageOptionHTML(stage, currentStage) {
  const checked = stage.order === currentStage ? "checked" : "";
  return `
    <label class="stage-option ${checked ? "is-selected" : ""}" data-order="${stage.order}">
      <input type="radio" name="p-stage" value="${stage.order}" ${checked} />
      <span class="stage-option-num">${stage.order}</span>
      <span class="stage-option-copy">
        <strong>${stage.title}${stage.optional ? ' <em>(opsional)</em>' : ""}</strong>
        <small>${stage.desc}</small>
      </span>
    </label>`;
}

async function openProgressModal(schoolId, school) {
  activeProgressSchoolId = schoolId;
  const { progress } = await ZadaData._loadPortalForAdmin(schoolId);
  progressSchoolName.textContent = school.school;
  progressStagesEl.innerHTML = ZadaData.stages().map((s) => stageOptionHTML(s, progress.currentStage)).join("");
  document.getElementById("p-print").checked = Boolean(progress.printOrdered);
  document.getElementById("p-completed").checked = Boolean(progress.completed);
  document.getElementById("p-note").value = progress.note || "";
  document.getElementById("p-updated").textContent = progress.updatedAt
    ? `Terakhir diperbarui: ${new Date(progress.updatedAt).toLocaleString("id-ID")}`
    : "Belum pernah diperbarui.";
  progressOverlay.classList.add("open");
}

function closeProgressModal() {
  progressOverlay.classList.remove("open");
  activeProgressSchoolId = null;
}

progressStagesEl.addEventListener("click", (e) => {
  const label = e.target.closest(".stage-option");
  if (!label) return;
  progressStagesEl.querySelectorAll(".stage-option").forEach((el) => el.classList.remove("is-selected"));
  label.classList.add("is-selected");
  label.querySelector("input").checked = true;
});

document.getElementById("btn-progress-cancel").addEventListener("click", closeProgressModal);
progressOverlay.addEventListener("click", (e) => {
  if (e.target === progressOverlay) closeProgressModal();
});

progressForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const selected = progressForm.querySelector('input[name="p-stage"]:checked');
  const patch = {
    currentStage: selected ? Number(selected.value) : 1,
    printOrdered: document.getElementById("p-print").checked,
    completed: document.getElementById("p-completed").checked,
    note: document.getElementById("p-note").value.trim(),
  };
  await ZadaData.saveProgress(activeProgressSchoolId, patch);
  showToast("Perkembangan buku berhasil diperbarui.");
  closeProgressModal();
});
