/* ZADA Yearbook — data layer (Firestore backend)

   SCHEMA:
   - schools/{schoolId}          -> public metadata only: school, level,
                                     palette, cover, hasPassword (bool),
                                     editions (array) IF NOT protected,
                                     progress (object) IF NOT protected.
                                     If protected, `editions` here is [] and
                                     `progress` here is null.
   - protected/{schoolId}__{hash} -> only exists for protected schools.
                                     doc id embeds SHA-256(password), so a
                                     visitor can only fetch this document if
                                     they already know the correct password
                                     (which produces the same hash). Content:
                                     { editions: [...], progress: {...} }.
                                     `progress` is the 6-tahap workflow status
                                     (lihat PROGRESS_STAGES) shown on the
                                     separate "Perkembangan" page, gated by
                                     the same school password.
   - admin_meta/{schoolId}        -> admin-only bookkeeping (current hash),
                                     readable/writable only when signed in.
                                     Never exposed to public visitors.

   This means: the raw password is never written to any document, and the
   editions/progress content of a protected school cannot be read unless the
   visitor already supplies the exact password (client hashes it, then
   requests the matching document path). There is no plaintext password
   sitting in the database or in the page's JS for someone to just look at. */

/* Every spine/cover gradient is built only from the site's own Color Hunt
   palette (navy / blue / sky / mint + their deep & bright siblings) so the
   shelf and cards always read as "one family" with the rest of the theme,
   instead of a rainbow of unrelated hues. */
const COVER_PALETTES = [
  { base: "linear-gradient(155deg,#293681,#4274D9)", accent: "#D0E7E6", name: "navy-blue" },
  { base: "linear-gradient(155deg,#4274D9,#95CCDD)", accent: "#0A0E2B", name: "blue-sky" },
  { base: "linear-gradient(155deg,#131A4A,#293681)", accent: "#D0E7E6", name: "deep-navy" },
  { base: "linear-gradient(155deg,#95CCDD,#D0E7E6)", accent: "#131A4A", name: "sky-mint" },
  { base: "linear-gradient(155deg,#293681,#6F97EA)", accent: "#D0E7E6", name: "navy-brightblue" },
  { base: "linear-gradient(155deg,#6F97EA,#95CCDD)", accent: "#0A0E2B", name: "brightblue-sky" },
  { base: "linear-gradient(155deg,#131A4A,#4274D9)", accent: "#D0E7E6", name: "deepnavy-blue" },
  { base: "linear-gradient(155deg,#4274D9,#D0E7E6)", accent: "#0A0E2B", name: "blue-mint" },
  { base: "linear-gradient(155deg,#293681,#95CCDD)", accent: "#D0E7E6", name: "navy-sky" },
  { base: "linear-gradient(155deg,#131A4A,#6F97EA)", accent: "#D0E7E6", name: "deepnavy-brightblue" },
];

/* ------------------------------------------------------------------ */
/* Produksi buku tahunan — 6 tahap resmi alur kerja ZADA.              */
/* Tahap 5 (cetak) bersifat kondisional: hanya relevan jika sekolah    */
/* memilih paket cetak fisik.                                          */
/* ------------------------------------------------------------------ */
const PROGRESS_STAGES = [
  {
    key: "konsep",
    order: 1,
    title: "Konsep & Konsultasi",
    desc: "Menentukan tema sampul, gaya fotografi, dan struktur halaman bersama pihak sekolah.",
  },
  {
    key: "produksi",
    order: 2,
    title: "Produksi",
    desc: "Fotografi studio & kandid, pengambilan dokumentasi kegiatan, serta kurasi data siswa.",
  },
  {
    key: "revisi",
    order: 3,
    title: "Revisi",
    desc: "Draf tata letak dikirim ke sekolah untuk dicek dan direvisi sebelum difinalisasi.",
  },
  {
    key: "flipbook",
    order: 4,
    title: "Publikasi Flipbook",
    desc: "Buku final diterbitkan sebagai flipbook interaktif melalui AnyFlip.",
  },
  {
    key: "cetak",
    order: 5,
    title: "Publikasi Cetakan",
    desc: "Opsional — dicetak fisik jika sekolah memilih paket cetak.",
    optional: true,
  },
  {
    key: "arsip",
    order: 6,
    title: "Pengarsipan",
    desc: "Buku dan seluruh berkas disimpan permanen sebagai arsip digital resmi ZADA.",
  },
];

function defaultProgress() {
  return { currentStage: 1, printOrdered: false, completed: false, note: "", updatedAt: null };
}

const ZadaData = {
  async getAllSchools() {
    const snap = await db.collection("schools").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async getSchoolById(id) {
    const doc = await db.collection("schools").doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  /* Attempt to unlock a protected school's portal (editions + progress)
     with a candidate password. Returns { editions, progress } on success,
     or null on failure. The check happens by trying to fetch a document
     whose ID embeds the hash of the candidate password — Firestore itself
     is the verifier. */
  async tryUnlockPortal(schoolId, candidatePassword) {
    const hash = await sha256Hex(candidatePassword);
    const doc = await db.collection("protected").doc(`${schoolId}__${hash}`).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return { editions: data.editions || [], progress: data.progress || defaultProgress() };
  },

  /* --- Admin-only writes below. Firestore rules require an authenticated
     admin session for all of these; see firestore.rules. --- */

  async addSchool(school) {
    const { id, password, editions, progress, ...meta } = school;
    const hasPassword = Boolean(password);
    const docData = {
      ...meta,
      hasPassword,
      editions: hasPassword ? [] : editions || [],
      progress: hasPassword ? null : progress || defaultProgress(),
    };
    await db.collection("schools").doc(id).set(docData);
    if (hasPassword) {
      await this._writeProtectedData(id, password, {
        editions: editions || [],
        progress: progress || defaultProgress(),
      });
    }
    return school;
  },

  async updateSchool(id, patch) {
    const current = await this.getSchoolById(id);
    if (!current) return false;

    const { password, editions, progress, ...metaPatch } = patch;
    const nowHasPassword = password !== undefined ? Boolean(password) : current.hasPassword;

    let currentEditions = current.editions || [];
    let currentProgress = current.progress || defaultProgress();
    if (current.hasPassword) {
      const meta = await db.collection("admin_meta").doc(id).get();
      if (meta.exists && meta.data().hash) {
        const prot = await db.collection("protected").doc(`${id}__${meta.data().hash}`).get();
        currentEditions = prot.exists ? prot.data().editions : [];
        currentProgress = prot.exists ? prot.data().progress || defaultProgress() : defaultProgress();
      } else {
        currentEditions = [];
        currentProgress = defaultProgress();
      }
    }
    const nextEditions = editions !== undefined ? editions : currentEditions;
    const nextProgress = progress !== undefined ? progress : currentProgress;

    await db.collection("schools").doc(id).set(
      {
        ...metaPatch,
        hasPassword: nowHasPassword,
        editions: nowHasPassword ? [] : nextEditions,
        progress: nowHasPassword ? null : nextProgress,
      },
      { merge: true }
    );

    if (nowHasPassword) {
      if (password) {
        await this._writeProtectedData(id, password, { editions: nextEditions, progress: nextProgress });
      } else if (editions !== undefined || progress !== undefined) {
        // content changed but password wasn't resubmitted: keep same hash
        const meta = await db.collection("admin_meta").doc(id).get();
        if (meta.exists && meta.data().hash) {
          await db
            .collection("protected")
            .doc(`${id}__${meta.data().hash}`)
            .set({ editions: nextEditions, progress: nextProgress });
        }
      }
    } else {
      await this._clearProtectedData(id);
    }
    return true;
  },

  async _writeProtectedData(schoolId, password, { editions, progress }) {
    const hash = await sha256Hex(password);
    await this._clearProtectedData(schoolId);
    await db.collection("protected").doc(`${schoolId}__${hash}`).set({ editions, progress });
    await db.collection("admin_meta").doc(schoolId).set({ hash });
  },

  async _clearProtectedData(schoolId) {
    const meta = await db.collection("admin_meta").doc(schoolId).get();
    if (meta.exists && meta.data().hash) {
      await db.collection("protected").doc(`${schoolId}__${meta.data().hash}`).delete();
      await db.collection("admin_meta").doc(schoolId).delete();
    }
  },

  async removeSchool(id) {
    await this._clearProtectedData(id);
    await db.collection("schools").doc(id).delete();
  },

  async _loadPortalForAdmin(schoolId) {
    const school = await this.getSchoolById(schoolId);
    if (!school) return { school: null, editions: [], progress: defaultProgress() };
    if (!school.hasPassword) {
      return { school, editions: school.editions || [], progress: school.progress || defaultProgress() };
    }
    const meta = await db.collection("admin_meta").doc(schoolId).get();
    if (!meta.exists || !meta.data().hash) {
      return { school, editions: [], progress: defaultProgress() };
    }
    const prot = await db.collection("protected").doc(`${schoolId}__${meta.data().hash}`).get();
    return {
      school,
      editions: prot.exists ? prot.data().editions : [],
      progress: prot.exists ? prot.data().progress || defaultProgress() : defaultProgress(),
    };
  },

  async addEdition(schoolId, edition) {
    const { school, editions, progress } = await this._loadPortalForAdmin(schoolId);
    if (!school) return false;
    const next = [edition, ...editions];
    await this._savePortal(schoolId, school, next, progress);
    return true;
  },

  async updateEdition(schoolId, editionId, patch) {
    const { school, editions, progress } = await this._loadPortalForAdmin(schoolId);
    if (!school) return false;
    const idx = editions.findIndex((e) => e.id === editionId);
    if (idx === -1) return false;
    editions[idx] = { ...editions[idx], ...patch };
    await this._savePortal(schoolId, school, editions, progress);
    return true;
  },

  async removeEdition(schoolId, editionId) {
    const { school, editions, progress } = await this._loadPortalForAdmin(schoolId);
    if (!school) return false;
    const next = editions.filter((e) => e.id !== editionId);
    await this._savePortal(schoolId, school, next, progress);
    return true;
  },

  /* Update the 6-tahap workflow status for a school. `patch` may include
     currentStage (1-6), printOrdered (bool), note (string). */
  async saveProgress(schoolId, patch) {
    const { school, editions, progress } = await this._loadPortalForAdmin(schoolId);
    if (!school) return false;
    const nextProgress = {
      ...defaultProgress(),
      ...progress,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this._savePortal(schoolId, school, editions, nextProgress);
    return true;
  },

  async _savePortal(schoolId, school, editions, progress) {
    if (school.hasPassword) {
      const meta = await db.collection("admin_meta").doc(schoolId).get();
      if (meta.exists && meta.data().hash) {
        await db.collection("protected").doc(`${schoolId}__${meta.data().hash}`).set({ editions, progress });
      }
    } else {
      await db.collection("schools").doc(schoolId).set({ editions, progress }, { merge: true });
    }
  },

  palette(index) {
    return COVER_PALETTES[index % COVER_PALETTES.length];
  },

  slugFromSchool(school) {
    return school
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  },

  editionYears(schoolWithEditions) {
    return [...(schoolWithEditions.editions || []).map((e) => e.year)].sort((a, b) => b - a);
  },

  stages() {
    return PROGRESS_STAGES;
  },

  defaultProgress,
};
