const dataRoot = new URL("./output/", window.location.href);
const listUrl = new URL("liste_parlementaires.json", dataRoot).toString();
const detailsRoot = new URL("parlementaires/", dataRoot).toString();

const elements = {
  list: document.getElementById("parliamentList"),
  filterInput: document.getElementById("parliamentFilterInput"),
  clearBtn: document.getElementById("clearSearchBtn"),
  main: document.getElementById("mainContent"),
  sidebarMeta: document.getElementById("sidebarMeta"),
  homeBtn: document.getElementById("homeBtn"),
};

const state = {
  all: [],
  filtered: [],
  activeId: null,
  view: "summary",
  detailsById: {},
  detailsErrors: {},
  summaryRequestId: 0,
  byId: {},
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

const getHumanStatusInfo = (position) => {
  if (isMissing(position)) {
    return { label: "Non renseigne", className: "status-empty" };
  }
  const normalized = normalize(position).replace(/\s+/g, " ").trim();
  if (normalized.includes("pourrait etre sur la liste")) {
    return { label: "INCERTAIN", className: "status-incertain" };
  }
  if (normalized.includes("tete de liste") || normalized.includes("sur la liste")) {
    return { label: "OUI", className: "status-oui" };
  }
  return { label: "Autre", className: "status-empty" };
};

const getAiStatusInfo = (details) => {
  if (!details || !details.analysis) {
    return getStatusInfo(null);
  }
  return getStatusInfo(details.analysis.status || details.analysis.statut);
};

const getPositionValue = (member, details) => {
  const position = pickValue(member.position, details?.identity?.position);
  return position || "Non renseigne";
};

const getIdentityFields = (member, details) => {
  const identity = details && details.identity ? details.identity : member;
  const fullName = pickValue(
    identity.full_name,
    pickValue(member.full_name, "")
  );
  const prenom = pickValue(identity.prenom, member.prenom);
  const nom = pickValue(identity.nom, member.nom);
  const displayName =
    fullName || [prenom, nom].filter(Boolean).join(" ") || "Nom inconnu";
  const parti = pickValue(identity.parti, member.parti);
  const departement = pickValue(identity.departement, member.departement);
  const commune = pickValue(identity.commune, member.commune);
  return { displayName, parti, departement, commune };
};

const formatMemberMetaLine = (departement, commune) => {
  const parts = [];
  if (departement) {
    parts.push(`Departement: ${departement}`);
  }
  if (commune) {
    parts.push(`Commune: ${commune}`);
  }
  return parts.join(" - ") || "Informations incompletes";
};

const isComparableLabel = (label) => {
  return ["OUI", "INCERTAIN", "NON"].includes(label);
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
  const { displayName, parti, departement, commune } = getIdentityFields(
    member,
    details
  );
  const position = getPositionValue(member, details);

  const statusInfo = getAiStatusInfo(details);
  const positionStatusInfo = getHumanStatusInfo(position);

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

  const metaLine = formatMemberMetaLine(departement, commune);

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
        <div class="status-pill ${positionStatusInfo.className}">${escapeHtml(
          positionStatusInfo.label
        )}</div>
        <div class="info-value">${escapeHtml(position)}</div>
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

const fetchMemberDetails = async (member) => {
  if (!member || !member.filename) {
    return null;
  }
  if (state.detailsById[member.id]) {
    return state.detailsById[member.id];
  }
  if (state.detailsErrors[member.id]) {
    return null;
  }
  try {
    const detailUrl = new URL(member.filename, detailsRoot).toString();
    const details = await fetchJson(detailUrl);
    state.detailsById[member.id] = details;
    return details;
  } catch (error) {
    console.error("Detail load failed", member.id, error);
    state.detailsErrors[member.id] = error.message;
    return null;
  }
};

const prefetchDetails = async (members) => {
  const queue = members.filter(
    (member) =>
      member &&
      !state.detailsById[member.id] &&
      !state.detailsErrors[member.id]
  );
  if (queue.length === 0) {
    return;
  }
  const limit = Math.min(8, queue.length);
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const member = queue.shift();
      if (!member) {
        continue;
      }
      await fetchMemberDetails(member);
    }
  });
  await Promise.all(workers);
};

const buildComparisonMatrix = (entries) => {
  const aiCategories = ["OUI", "INCERTAIN", "NON", "ERREUR JSON", "Non analyse"];
  const humanCategories = ["OUI", "INCERTAIN", "Non renseigne", "Autre"];
  const matrix = {};
  const humanTotals = {};
  const aiTotals = {};

  aiCategories.forEach((label) => {
    aiTotals[label] = 0;
  });

  humanCategories.forEach((label) => {
    matrix[label] = {};
    aiCategories.forEach((aiLabel) => {
      matrix[label][aiLabel] = 0;
    });
    humanTotals[label] = 0;
  });

  entries.forEach((entry) => {
    const humanLabel = humanCategories.includes(entry.humanStatus.label)
      ? entry.humanStatus.label
      : "Autre";
    const aiLabel = aiCategories.includes(entry.aiStatus.label)
      ? entry.aiStatus.label
      : "Non analyse";
    matrix[humanLabel][aiLabel] += 1;
    humanTotals[humanLabel] += 1;
    aiTotals[aiLabel] += 1;
  });

  return {
    aiCategories,
    humanCategories,
    matrix,
    humanTotals,
    aiTotals,
  };
};

const renderSummaryView = (entries) => {
  if (!entries.length) {
    elements.main.innerHTML =
      '<div class="empty-state"><p>Aucun parlementaire.</p></div>';
    return;
  }

  const total = entries.length;
  const comparable = entries.filter(
    (entry) =>
      isComparableLabel(entry.aiStatus.label) &&
      isComparableLabel(entry.humanStatus.label)
  ).length;
  const mismatch = entries.filter(
    (entry) =>
      isComparableLabel(entry.aiStatus.label) &&
      isComparableLabel(entry.humanStatus.label) &&
      entry.aiStatus.label !== entry.humanStatus.label
  ).length;

  const { aiCategories, humanCategories, matrix, humanTotals, aiTotals } =
    buildComparisonMatrix(entries);

  const matrixHeader = aiCategories
    .map((label) => `<th>${escapeHtml(label)}</th>`)
    .join("");
  const matrixRows = humanCategories
    .map((label) => {
      const cells = aiCategories
        .map((aiLabel) => `<td>${matrix[label][aiLabel]}</td>`)
        .join("");
      return `<tr><th>${escapeHtml(label)}</th>${cells}<td class="matrix-total">${humanTotals[label]}</td></tr>`;
    })
    .join("");
  const matrixFooter = `<tr><th>Total</th>${aiCategories
    .map((aiLabel) => `<td class="matrix-total">${aiTotals[aiLabel]}</td>`)
    .join("")}<td class="matrix-total">${total}</td></tr>`;

  const rowsHtml = entries
    .map((entry) => {
      const mismatchClass =
        isComparableLabel(entry.aiStatus.label) &&
        isComparableLabel(entry.humanStatus.label) &&
        entry.aiStatus.label !== entry.humanStatus.label
          ? "is-mismatch"
          : "";
      const departement = entry.departement || "n/a";
      const commune = entry.commune || "n/a";
      const parti = entry.parti || "n/a";
      return `
        <tr class="${mismatchClass}" data-member-id="${escapeHtml(
        entry.member.id
      )}">
          <td class="cell-name">${escapeHtml(entry.displayName)}</td>
          <td>${escapeHtml(parti)}</td>
          <td>${escapeHtml(departement)}</td>
          <td>${escapeHtml(commune)}</td>
          <td class="cell-status"><span class="status-pill ${
            entry.aiStatus.className
          }">${escapeHtml(entry.aiStatus.label)}</span></td>
          <td class="cell-status"><span class="status-pill ${
            entry.humanStatus.className
          }">${escapeHtml(entry.humanStatus.label)}</span></td>
          <td class="cell-position">${escapeHtml(entry.position)}</td>
        </tr>
      `;
    })
    .join("");

  const filteredNote =
    state.filtered.length === state.all.length
      ? `${total} suivis`
      : `${total} affiches sur ${state.all.length}`;

  elements.main.innerHTML = `
    <div class="summary-header">
      <div>
        <div class="member-kicker">Recapitulatif</div>
        <h2>Parlementaires suivis</h2>
        <div class="member-sub">${escapeHtml(filteredNote)}</div>
      </div>
      <div class="summary-metrics">
        <div class="summary-card">
          <div class="summary-card-title">Total</div>
          <div class="summary-card-value">${total}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-title">Comparables</div>
          <div class="summary-card-value">${comparable}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-title">Divergences</div>
          <div class="summary-card-value">${mismatch}</div>
        </div>
      </div>
    </div>

    <section class="summary-section">
      <div class="section-title">Comparaison IA / Humain</div>
      <div class="summary-table-wrapper">
        <table class="summary-table summary-matrix">
          <thead>
            <tr>
              <th>Humain \\ IA</th>
              ${matrixHeader}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${matrixRows}
          </tbody>
          <tfoot>
            ${matrixFooter}
          </tfoot>
        </table>
      </div>
    </section>

    <section class="summary-section">
      <div class="section-title">Tous les parlementaires</div>
      <div class="summary-table-wrapper">
        <table class="summary-table summary-table-main">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Parti</th>
              <th>Departement</th>
              <th>Commune</th>
              <th>IA</th>
              <th>Humain</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </section>
  `;
};

const loadSummary = async () => {
  const requestId = (state.summaryRequestId += 1);
  const members = [...state.filtered];
  const needsPrefetch = members.some(
    (member) =>
      member &&
      !state.detailsById[member.id] &&
      !state.detailsErrors[member.id]
  );
  if (needsPrefetch) {
    renderLoading("Chargement du recapitulatif...");
  }
  await prefetchDetails(members);
  if (requestId !== state.summaryRequestId) {
    return;
  }
  if (state.view !== "summary") {
    return;
  }

  const entries = members.map((member) => {
    const details = state.detailsById[member.id] || null;
    const { displayName, parti, departement, commune } = getIdentityFields(
      member,
      details
    );
    const position = getPositionValue(member, details);
    const aiStatus = getAiStatusInfo(details);
    const humanStatus = getHumanStatusInfo(position);
    return {
      member,
      displayName,
      parti,
      departement,
      commune,
      position,
      aiStatus,
      humanStatus,
    };
  });

  renderSummaryView(entries);
};

const showSummary = () => {
  state.view = "summary";
  state.activeId = null;
  renderList();
  loadSummary();
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
  state.view = "detail";
  state.summaryRequestId += 1;
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
  if (state.view === "summary") {
    loadSummary();
  }
};

const loadMember = async (member) => {
  renderLoading("Chargement du parlementaire...");
  try {
    const details = await fetchMemberDetails(member);
    if (!details) {
      throw new Error(state.detailsErrors[member.id] || "Details manquants.");
    }
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
    state.byId = state.all.reduce((acc, member) => {
      acc[member.id] = member;
      return acc;
    }, {});
    state.filtered = [...state.all];
    updateSidebarMeta();
    showSummary();
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
if (elements.homeBtn) {
  elements.homeBtn.addEventListener("click", showSummary);
}
elements.main.addEventListener("click", (event) => {
  if (state.view !== "summary") {
    return;
  }
  const row = event.target.closest("tr[data-member-id]");
  if (!row) {
    return;
  }
  const member = state.byId[row.dataset.memberId];
  if (member) {
    selectMember(member);
  }
});

loadList();
