const dataRoot = new URL("./output/", window.location.href);
const listUrl = new URL("liste_parlementaires.json", dataRoot).toString();
const detailsRoot = new URL("parlementaires/", dataRoot).toString();

const elements = {
  list: document.getElementById("parliamentList"),
  filterInput: document.getElementById("parliamentFilterInput"),
  clearBtn: document.getElementById("clearSearchBtn"),
  main: document.getElementById("mainContent"),
  sidebarMeta: document.getElementById("sidebarMeta"),
};

const state = {
  all: [],
  filtered: [],
  activeId: null,
};

const isMissing = (value) => {
  if (value === null || value === undefined) {
    return true;
  }
  const text = String(value).trim().toLowerCase();
  return text === "" || text === "nan" || text === "null" || text === "undefined";
};

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pickValue = (primary, fallback) => {
  if (!isMissing(primary)) {
    return String(primary).trim();
  }
  if (!isMissing(fallback)) {
    return String(fallback).trim();
  }
  return "";
};

const formatDate = (value) => {
  if (isMissing(value)) {
    return "Date inconnue";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getStatusInfo = (status) => {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "OUI") {
    return { label: "OUI", className: "status-oui" };
  }
  if (normalized === "NON") {
    return { label: "NON", className: "status-non" };
  }
  if (normalized === "INCERTAIN") {
    return { label: "INCERTAIN", className: "status-incertain" };
  }
  if (normalized === "ERREUR JSON") {
    return { label: "ERREUR JSON", className: "status-error" };
  }
  return { label: "Non analyse", className: "status-empty" };
};

const updateSidebarMeta = () => {
  const total = state.all.length;
  const visible = state.filtered.length;
  if (total === 0) {
    elements.sidebarMeta.textContent = "Aucun parlementaire";
    return;
  }
  if (total === visible) {
    elements.sidebarMeta.textContent = `${total} suivis`;
    return;
  }
  elements.sidebarMeta.textContent = `${visible} / ${total} visibles`;
};

const renderList = () => {
  elements.list.innerHTML = "";
  if (state.filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "Aucun resultat.";
    elements.list.appendChild(empty);
    return;
  }

  state.filtered.forEach((member) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "parliament-item";
    if (state.activeId === member.id) {
      item.classList.add("active");
    }

    const name = document.createElement("span");
    name.className = "parliament-name";
    const nameParts = [];
    const fullName = pickValue(member.full_name, "");
    if (fullName) {
      name.textContent = fullName;
    } else {
      const prenom = pickValue(member.prenom, "");
      const nom = pickValue(member.nom, "");
      if (prenom) {
        nameParts.push(prenom);
      }
      if (nom) {
        nameParts.push(nom);
      }
      name.textContent = nameParts.join(" ") || "Nom inconnu";
    }

    const meta = document.createElement("span");
    meta.className = "parliament-meta";
    const metaParts = [];
    const parti = pickValue(member.parti, "");
    const departement = pickValue(member.departement, "");
    const commune = pickValue(member.commune, "");
    if (parti) {
      metaParts.push(parti);
    }
    if (departement) {
      metaParts.push(departement);
    }
    if (commune) {
      metaParts.push(commune);
    }
    meta.textContent = metaParts.join(" - ") || "Infos manquantes";

    item.appendChild(name);
    item.appendChild(meta);
    item.addEventListener("click", () => selectMember(member));
    elements.list.appendChild(item);
  });
};

const renderLoading = (message) => {
  const text = message || "Chargement...";
  elements.main.innerHTML = `<div class="loading-state"><p>${escapeHtml(
    text
  )}</p></div>`;
};

const renderError = (message, details) => {
  const detailsHtml = details
    ? `<div class="error-details">${escapeHtml(details)}</div>`
    : "";
  elements.main.innerHTML = `<div class="error-state"><p>${escapeHtml(
    message
  )}</p>${detailsHtml}</div>`;
};

const renderMember = (member, details) => {
  const identity = details && details.identity ? details.identity : member;
  const fullName = pickValue(
    identity.full_name,
    pickValue(member.full_name, "")
  );
  const prenom = pickValue(identity.prenom, member.prenom);
  const nom = pickValue(identity.nom, member.nom);
  const displayName = fullName || [prenom, nom].filter(Boolean).join(" ") || "Nom inconnu";

  const parti = pickValue(identity.parti, member.parti);
  const departement = pickValue(identity.departement, member.departement);
  const commune = pickValue(identity.commune, member.commune);
  const position = pickValue(member.position, identity.position) || "Non renseigne";

  const analysis = details ? details.analysis : null;
  const statusInfo = getStatusInfo(analysis && (analysis.status || analysis.statut));

  const tagLabels = [];
  if (parti) {
    tagLabels.push(`Parti: ${parti}`);
  }
  if (departement) {
    tagLabels.push(`Departement: ${departement}`);
  }
  if (commune) {
    tagLabels.push(`Commune: ${commune}`);
  }
  const tagsHtml = tagLabels.length
    ? tagLabels.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")
    : '<span class="tag">Infos manquantes</span>';

  const metaLineParts = [];
  if (departement) {
    metaLineParts.push(`Departement: ${departement}`);
  }
  if (commune) {
    metaLineParts.push(`Commune: ${commune}`);
  }
  const metaLine = metaLineParts.join(" - ") || "Informations incompletes";

  const articles = details && Array.isArray(details.search_results) ? details.search_results : [];
  const articlesHtml = articles.length
    ? articles
        .map((article) => {
          const title = pickValue(article.title, "Sans titre");
          const snippet = pickValue(article.snippet, "");
          const source = pickValue(article.source, "Source inconnue");
          const dateText = formatDate(article.date);
          const link = pickValue(article.link, "");
          const titleHtml = link
            ? `<a class="article-title" href="${escapeHtml(
                link
              )}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
            : `<span class="article-title">${escapeHtml(title)}</span>`;
          const snippetHtml = snippet
            ? `<div class="article-snippet">${escapeHtml(snippet)}</div>`
            : "";
          return `
            <article class="article-card">
              ${titleHtml}
              ${snippetHtml}
              <div class="article-meta">${escapeHtml(
                `${source} - ${dateText}`
              )}</div>
            </article>
          `;
        })
        .join("")
    : '<div class="list-empty">Aucun article disponible.</div>';

  elements.main.innerHTML = `
    <div class="member-header">
      <div class="member-title">
        <div class="member-kicker">Parlementaire suivi</div>
        <h2>${escapeHtml(displayName)}</h2>
        <div class="member-sub">${escapeHtml(metaLine)}</div>
      </div>
      <div class="member-tags">
        ${tagsHtml}
      </div>
    </div>

    <section class="info-grid">
      <div class="info-card">
        <div class="info-label">Classification IA</div>
        <div class="status-pill ${statusInfo.className}">${escapeHtml(
          statusInfo.label
        )}</div>
        <div class="info-hint">Est-il present sur une liste ?</div>
      </div>
      <div class="info-card">
        <div class="info-label">Position (humain)</div>
        <div class="info-value">${escapeHtml(position)}</div>
      </div>
      <div class="info-card">
        <div class="info-label">Comparaison</div>
        <div class="comparison">
          <div><span class="comparison-label">IA</span>${escapeHtml(
            statusInfo.label
          )}</div>
          <div><span class="comparison-label">Humain</span>${escapeHtml(
            position
          )}</div>
        </div>
      </div>
    </section>

    <section>
      <div class="section-title">Articles (${articles.length})</div>
      <div class="articles-list">
        ${articlesHtml}
      </div>
    </section>
  `;
};

const parseJsonSafe = (text) => {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return { value: null, error };
  }
};

const fetchJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const parsed = parseJsonSafe(payload);
  if (!parsed.error) {
    return parsed.value;
  }

  const sanitized = payload
    .replace(/\bNaN\b/g, "null")
    .replace(/-?Infinity\b/g, "null");
  const parsedSanitized = parseJsonSafe(sanitized);
  if (!parsedSanitized.error) {
    return parsedSanitized.value;
  }

  throw new Error(`JSON parse error: ${parsedSanitized.error.message}`);
};

const selectMember = (member) => {
  if (!member) {
    return;
  }
  state.activeId = member.id;
  renderList();
  loadMember(member);
};

const applyFilter = () => {
  const query = normalize(elements.filterInput.value);
  if (!query) {
    state.filtered = [...state.all];
  } else {
    state.filtered = state.all.filter((member) => {
      const haystack = normalize(
        [
          member.full_name,
          member.nom,
          member.prenom,
          member.parti,
          member.departement,
          member.commune,
        ].join(" ")
      );
      return haystack.includes(query);
    });
  }
  renderList();
  updateSidebarMeta();
};

const loadMember = async (member) => {
  renderLoading("Chargement du parlementaire...");
  try {
    const detailUrl = new URL(member.filename, detailsRoot).toString();
    const details = await fetchJson(detailUrl);
    renderMember(member, details);
  } catch (error) {
    console.error("Member load failed", error);
    renderError("Impossible de charger les details.", error.message);
  }
};

const loadList = async () => {
  renderLoading("Chargement de la liste...");
  try {
    const data = await fetchJson(listUrl);
    state.all = Array.isArray(data) ? data : [];
    state.all.sort((a, b) =>
      String(a.full_name || "").localeCompare(String(b.full_name || ""), "fr", {
        sensitivity: "base",
      })
    );
    state.filtered = [...state.all];
    renderList();
    updateSidebarMeta();
    elements.main.innerHTML =
      '<div class="empty-state"><p>Selectionnez un parlementaire pour voir les details.</p></div>';
  } catch (error) {
    console.error("List load failed", error, listUrl);
    if (window.location.protocol === "file:") {
      const host = window.location.host || "localhost:8005";
      renderError(
        "Impossible de charger la liste.",
        `Ouvrez http://${host}/frontend/ depuis un serveur local.`
      );
      return;
    }
    renderError(
      "Impossible de charger la liste des parlementaires.",
      `URL: ${listUrl} | ${error.message}`
    );
  }
};

elements.filterInput.addEventListener("input", applyFilter);
elements.clearBtn.addEventListener("click", () => {
  elements.filterInput.value = "";
  applyFilter();
  elements.filterInput.focus();
});

loadList();
