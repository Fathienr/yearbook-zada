/* Shared UI helpers used across pages */

function initNavToggle() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => links.classList.toggle("open"));
}

function schoolCardHTML(school) {
  const pal = ZadaData.palette(school.palette);
  const initial = school.school.trim().charAt(0).toUpperCase();
  const years = ZadaData.editionYears(school);
  const yearLabel = years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : `${years[0] || "-"}`;
  const editionWord = school.editions.length > 1 ? "Edisi" : "Edisi";
  const latest = school.editions.slice().sort((a, b) => b.year - a.year)[0];

  const coverImg = school.cover
    ? `<img class="card-cover-img" src="${school.cover}" alt="Sampul ${school.school}" loading="lazy" />`
    : "";

  return `
    <a class="card" href="school.html?id=${encodeURIComponent(school.id)}">
      <div class="card-cover" style="background:${pal.base}">
        ${coverImg}
        <span class="card-tag">${school.level} &middot; ${school.editions.length} ${editionWord}${school.password ? " &middot; &#128274;" : ""}</span>
        ${school.cover ? "" : `<span class="card-initial">${initial}</span>`}
        <div class="card-cover-foot">
          <div class="school">${school.school}</div>
          <div class="meta">EDISI ${yearLabel}</div>
        </div>
      </div>
      <div class="card-body">
        <p>${school.password ? "Portofolio ini bersifat privat. Masukkan kata sandi di halaman sekolah untuk melihat isinya." : (latest ? latest.summary : "Belum ada edisi tercatat.")}</p>
        <span class="card-link">${school.password ? "Buka dengan kata sandi" : `Lihat ${school.editions.length > 1 ? "semua portofolio" : "flipbook"}`} &rarr;</span>
      </div>
    </a>
  `;
}

function populateYearFilter(selectEl, schools) {
  const years = new Set();
  schools.forEach((s) => s.editions.forEach((e) => years.add(e.year)));
  [...years]
    .sort((a, b) => b - a)
    .forEach((y) => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      selectEl.appendChild(opt);
    });
}

document.addEventListener("DOMContentLoaded", initNavToggle);
