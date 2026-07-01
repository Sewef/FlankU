import "./style.css";
import OBR, { buildShape } from "@owlbear-rodeo/sdk";

import {
  EXTENSION_ID,
  METADATA_FIELDS,
  METADATA_KEY,
  TEAM_COLORS,
  TEAM_DEFAULT,
  TEAM_LABELS,
  TEAMS,
  normalizeTeam,
} from "./constants.js";
import { formatCell } from "./cells.js";
import { isAdjacentToAlly, isFlanked } from "./flanking.js";
import { toTokenCellInfo } from "./grid.js";
import { escapeHtml } from "./html.js";
import { ensureExtensionMetadata, isCharacterImage, isFlankWatchHitbox } from "./items.js";
import { applyTheme } from "./theme.js";

let gridDpi = 150;
let unsubscribeItems = null;
let unsubscribeGrid = null;
let unsubscribeTheme = null;
let isUpdatingTeam = false;
let isUpdatingImmune = false;
let isUpdatingHitboxes = false;
let isUpdatingFlankedMetadata = false;
let showHitbox = localStorage.getItem(`${EXTENSION_ID}/show-hitbox`) === "true";
let refreshTimer = null;
let ignoreItemChangesUntil = 0;
let activeTeam = normalizeTeam(localStorage.getItem(`${EXTENSION_ID}/active-team`));

document.querySelector("#app").innerHTML = `
  <main class="panel">
    <header class="header">
      <div>
        <p class="eyebrow">FlankWatch</p>
        <button id="refresh" type="button">Refresh</button>
        <label class="option-toggle">
          <input id="show-hitbox" type="checkbox" />
          Hitbox
        </label>
      </div>
    </header>

    <nav class="team-tabs" aria-label="Team tabs">
      ${TEAMS.map((team, index) => {
        return `
          <button
            type="button"
            class="${index === 0 ? "active" : ""}"
            data-team-tab="${team}"
            style="--team-color: ${TEAM_COLORS[team]}"
          >
            ${TEAM_LABELS[team]}
            <span id="team-count-${team}">0</span>
          </button>
        `;
      }).join("")}
    </nav>

    <section class="token-list" aria-label="Token cell positions">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Team</th>
            <th>Imm.</th>
            <th>Adj.</th>
            <th>Flanked</th>
            <th>Pos.</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody id="token-rows">
          <tr></tr>
        </tbody>
      </table>
    </section>
  </main>
`;

const tokenRowsEl = document.querySelector("#token-rows");
const showHitboxEl = document.querySelector("#show-hitbox");
const teamTabsEl = document.querySelector(".team-tabs");

document.querySelector("#refresh").addEventListener("click", refreshTokenPositions);
tokenRowsEl.addEventListener("change", handleTableChange);
teamTabsEl.addEventListener("click", handleTeamTabClick);
showHitboxEl.checked = showHitbox;
showHitboxEl.addEventListener("change", handleShowHitboxChange);

if (OBR.isAvailable) {
  OBR.onReady(setup);
}

async function setup() {
  applyTheme(await OBR.theme.getTheme());
  unsubscribeTheme = OBR.theme.onChange(applyTheme);

  if ((await OBR.player.getRole()) !== "GM") {
    renderNoGmMessage();
    return;
  }

  await registerContextMenus();
  await refreshGrid();

  unsubscribeGrid = OBR.scene.grid.onChange(async () => {
    await refreshGrid();
    await refreshTokenPositions();
  });

  OBR.scene.onReadyChange(handleSceneReady);
  handleSceneReady(await OBR.scene.isReady());
}

function renderNoGmMessage() {
  document.querySelector("#app").innerHTML = `
    <main class="no-gm-panel">
      U NO GM ᕕ( ᐛ )ᕗ
    </main>
  `;
}

async function handleSceneReady(ready) {
  if (!ready) {
    unsubscribeItems?.();
    unsubscribeItems = null;
    renderTokens([]);
    await clearHitboxes();
    return;
  }

  unsubscribeItems?.();
  unsubscribeItems = OBR.scene.items.onChange(scheduleTokenRefresh);
  await refreshTokenPositions();
}

async function refreshGrid() {
  gridDpi = await OBR.scene.grid.getDpi();
}

async function refreshTokenPositions() {
  if (isUpdatingHitboxes || isUpdatingFlankedMetadata || !(await OBR.scene.isReady())) {
    return;
  }

  await refreshGrid();

  const items = await OBR.scene.items.getItems(isCharacterImage);
  const tokens = await Promise.all(
    items.map((item) => {
      return toTokenCellInfo(item, gridDpi, (...args) => OBR.scene.grid.snapPosition(...args));
    }),
  );
  const tokensWithState = tokens.map((token) => {
    return {
      ...token,
      adjacentToAlly: isAdjacentToAlly(token, tokens),
      flanked: isFlanked(token, tokens),
    };
  });

  const sortedTokens = tokensWithState.sort(compareTokenInfo);
  renderTokens(sortedTokens);
  await syncFlankedMetadata(sortedTokens);
  await syncHitboxes(sortedTokens);
}

function scheduleTokenRefresh() {
  if (Date.now() < ignoreItemChangesUntil) {
    return;
  }

  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshTokenPositions, 80);
}

async function registerContextMenus() {
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/team-menu`,
    icons: [
      {
        icon: "/icon.svg",
        label: "FlankWatch",
        filter: { min: 1, roles: ["GM"] },
      },
    ],
    embed: {
      url: "/team-menu.html",
      height: 150,
    },
  });
}

function handleTeamTabClick(event) {
  const button = event.target.closest("[data-team-tab]");

  if (!button) {
    return;
  }

  activeTeam = normalizeTeam(button.dataset.teamTab);
  localStorage.setItem(`${EXTENSION_ID}/active-team`, activeTeam);
  updateActiveTab();
  refreshTokenPositions();
}

async function handleShowHitboxChange() {
  showHitbox = showHitboxEl.checked;
  localStorage.setItem(`${EXTENSION_ID}/show-hitbox`, String(showHitbox));

  if (showHitbox) {
    await refreshTokenPositions();
  } else {
    await clearHitboxes();
  }
}

async function handleTableChange(event) {
  const immuneToggle = event.target.closest("[data-immune-toggle]");
  const teamSelect = event.target.closest("[data-team-toggle]");

  if (immuneToggle && !isUpdatingImmune) {
    await setImmune([immuneToggle.dataset.tokenId], immuneToggle.checked);
    return;
  }

  if (teamSelect && !isUpdatingTeam) {
    await setTeam([teamSelect.dataset.tokenId], teamSelect.value);
  }
}

async function setTeam(ids, team) {
  if (!ids.length || !TEAMS.includes(team)) {
    return;
  }

  isUpdatingTeam = true;

  try {
    await OBR.scene.items.updateItems(
      (item) => ids.includes(item.id) && isCharacterImage(item),
      (items) => {
        for (const item of items) {
          const metadata = ensureExtensionMetadata(item);
          metadata[METADATA_FIELDS.team] = team;
        }
      },
    );
    await refreshTokenPositions();
  } finally {
    isUpdatingTeam = false;
  }
}

async function setImmune(ids, immune) {
  if (!ids.length) {
    return;
  }

  isUpdatingImmune = true;

  try {
    await OBR.scene.items.updateItems(
      (item) => ids.includes(item.id) && isCharacterImage(item),
      (items) => {
        for (const item of items) {
          const metadata = ensureExtensionMetadata(item);
          if (immune) {
            metadata[METADATA_FIELDS.immune] = true;
          } else {
            delete metadata[METADATA_FIELDS.immune];
          }
        }
      },
    );
    await refreshTokenPositions();
  } finally {
    isUpdatingImmune = false;
  }
}

async function syncHitboxes(tokens) {
  if (isUpdatingHitboxes || !showHitbox || !(await OBR.scene.isReady())) {
    return;
  }

  isUpdatingHitboxes = true;
  ignoreItemChangesUntil = Date.now() + 500;

  try {
    await clearHitboxes();
    const shapesToAdd = tokens.map(buildTokenHitbox);

    if (shapesToAdd.length) {
      await OBR.scene.items.addItems(shapesToAdd);
    }
  } finally {
    isUpdatingHitboxes = false;
  }
}

async function syncFlankedMetadata(tokens) {
  const flankedById = new Map(tokens.map((token) => [token.id, token.flanked]));

  isUpdatingFlankedMetadata = true;
  ignoreItemChangesUntil = Date.now() + 500;

  try {
    await OBR.scene.items.updateItems(
      (item) => {
        return (
          flankedById.has(item.id) &&
          isCharacterImage(item) &&
          item.metadata?.[METADATA_KEY]?.[METADATA_FIELDS.isFlanked] !== flankedById.get(item.id)
        );
      },
      (items) => {
        for (const item of items) {
          const metadata = ensureExtensionMetadata(item);
          metadata[METADATA_FIELDS.isFlanked] = flankedById.get(item.id);
        }
      },
    );
  } finally {
    isUpdatingFlankedMetadata = false;
  }
}

async function clearHitboxes() {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) {
    return;
  }

  ignoreItemChangesUntil = Date.now() + 500;
  const hitboxes = await OBR.scene.items.getItems(isFlankWatchHitbox);

  if (hitboxes.length) {
    await OBR.scene.items.deleteItems(hitboxes.map((item) => item.id));
  }
}

function buildTokenHitbox(token) {
  const color = TEAM_COLORS[token.team] ?? TEAM_COLORS[TEAM_DEFAULT];
  const width = token.size.width * gridDpi;
  const height = token.size.height * gridDpi;

  return buildShape()
    .name(`FlankWatch Hitbox: ${token.name}`)
    .layer("DRAWING")
    .position({
      x: token.origin.x - width / 2,
      y: token.origin.y - height / 2,
    })
    .width(width)
    .height(height)
    .fillColor(color)
    .fillOpacity(0.28)
    .strokeColor(color)
    .strokeOpacity(0.9)
    .strokeWidth(3)
    .disableHit(true)
    .locked(true)
    .attachedTo(token.id)
    .metadata({
      [METADATA_KEY]: {
        [METADATA_FIELDS.hitbox]: true,
        [METADATA_FIELDS.hitboxTokenId]: token.id,
      },
    })
    .build();
}

function renderTokens(tokens) {
  updateActiveTab();
  updateTeamCounts(tokens);

  const visibleTokens = tokens.filter((token) => token.team === activeTeam);

  if (!visibleTokens.length) {
    tokenRowsEl.innerHTML = `
      <tr>
        <td colspan="7" class="empty">No ${TEAM_LABELS[activeTeam]} tokens found.</td>
      </tr>
    `;
    return;
  }

  tokenRowsEl.innerHTML = visibleTokens.map(renderTokenRow).join("");
}

function renderTokenRow(token) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(token.name)}</strong>
      </td>
      <td>
        <select data-team-toggle data-token-id="${escapeHtml(token.id)}">
          ${TEAMS.map((team) => {
            return `
              <option value="${team}" ${token.team === team ? "selected" : ""}>
                ${TEAM_LABELS[team]}
              </option>
            `;
          }).join("")}
        </select>
      </td>
      <td>
        <label class="immune-toggle">
          <input
            data-immune-toggle
            data-token-id="${escapeHtml(token.id)}"
            type="checkbox"
            ${token.immune ? "checked" : ""}
          />
        </label>
      </td>
      <td>${renderStatus(token.adjacentToAlly)}</td>
      <td>${renderStatus(token.flanked)}</td>
      <td>${formatCell(token.anchor)}</td>
      <td>${token.size.width}x${token.size.height}</td>
    </tr>
  `;
}

function renderStatus(value) {
  return `
    <span class="status ${value ? "yes" : "no"}">
      ${value ? "Y" : "N"}
    </span>
  `;
}

function updateTeamCounts(tokens) {
  for (const team of TEAMS) {
    const countEl = document.querySelector(`#team-count-${team}`);

    if (countEl) {
      countEl.textContent = String(tokens.filter((token) => token.team === team).length);
    }
  }
}

function updateActiveTab() {
  for (const button of teamTabsEl.querySelectorAll("[data-team-tab]")) {
    button.classList.toggle("active", button.dataset.teamTab === activeTeam);
  }
}

function compareTokenInfo(a, b) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

window.addEventListener("pagehide", () => {
  window.clearTimeout(refreshTimer);
  unsubscribeItems?.();
  unsubscribeGrid?.();
  unsubscribeTheme?.();
});
