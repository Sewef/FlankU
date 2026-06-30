import "./style.css";
import OBR, { Math2, buildShape } from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "com.flankwatch";
const TEAM_KEY = `${EXTENSION_ID}/team`;
const IMMUNE_KEY = `${EXTENSION_ID}/immune`;
const HITBOX_KEY = `${EXTENSION_ID}/hitbox`;
const HITBOX_TOKEN_KEY = `${EXTENSION_ID}/hitbox-token-id`;
const TEAM_DEFAULT = "default";
const TEAM_1 = "team1";
const TEAM_2 = "team2";
const TEAM_3 = "team3";
const TEAMS = [TEAM_DEFAULT, TEAM_1, TEAM_2, TEAM_3];
const TEAM_LABELS = {
  [TEAM_DEFAULT]: "Ally",
  [TEAM_1]: "Team 1",
  [TEAM_2]: "Team 2",
  [TEAM_3]: "Team 3",
};
const TEAM_COLORS = {
  [TEAM_DEFAULT]: "#2f9e44",
  [TEAM_1]: "#e03131",
  [TEAM_2]: "#1971c2",
  [TEAM_3]: "#f08c00",
};
const TEAM_ALIASES = {
  ally: TEAM_DEFAULT,
  default: TEAM_DEFAULT,
  [TEAM_1]: TEAM_1,
  [TEAM_2]: TEAM_2,
  [TEAM_3]: TEAM_3,
};

let gridDpi = 150;
let gridScale = null;
let unsubscribeItems = null;
let unsubscribeGrid = null;
let unsubscribeTheme = null;
let isUpdatingTeam = false;
let isUpdatingImmune = false;
let isUpdatingHitboxes = false;
let showHitbox = localStorage.getItem(`${EXTENSION_ID}/show-hitbox`) === "true";
let refreshTimer = null;
let ignoreItemChangesUntil = 0;

document.querySelector("#app").innerHTML = `
  <main class="panel">
    <header class="header">
      <div>
        <p class="eyebrow">FlankWatch</p>
        <button id="refresh" type="button">Refresh</button>
        <label class="option-toggle">
          <input id="show-hitbox" type="checkbox" />
          Show Hitbox
        </label>
      </div>
    </header>

    <section class="toolbar" aria-label="Display controls">

    </section>

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
            <th>Immune</th>
            <th>Adjacent Ally</th>
            <th>Flanked</th>
            <th>Position</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody id="token-rows">
          <tr>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
`;

const sceneStateEl = document.querySelector("#scene-state");
const tokenCountEl = document.querySelector("#token-count");
const gridDpiEl = document.querySelector("#grid-dpi");
const gridScaleEl = document.querySelector("#grid-scale");
const tokenRowsEl = document.querySelector("#token-rows");
const showHitboxEl = document.querySelector("#show-hitbox");
const teamTabsEl = document.querySelector(".team-tabs");

let activeTeam = normalizeTeam(localStorage.getItem(`${EXTENSION_ID}/active-team`));

document.querySelector("#refresh").addEventListener("click", refreshTokenPositions);
tokenRowsEl.addEventListener("change", handleTeamChange);
teamTabsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-team-tab]");

  if (!button) {
    return;
  }

  activeTeam = normalizeTeam(button.dataset.teamTab);
  localStorage.setItem(`${EXTENSION_ID}/active-team`, activeTeam);
  updateActiveTab();
  refreshTokenPositions();
});
showHitboxEl.checked = showHitbox;
showHitboxEl.addEventListener("change", async () => {
  showHitbox = showHitboxEl.checked;
  localStorage.setItem(`${EXTENSION_ID}/show-hitbox`, String(showHitbox));

  if (showHitbox) {
    await refreshTokenPositions();
  } else {
    await clearHitboxes();
  }
});

if (OBR.isAvailable) {
  OBR.onReady(setup);
} else {
  if (sceneStateEl) {
    sceneStateEl.textContent = "Preview";
  }
}

async function setup() {
  applyTheme(await OBR.theme.getTheme());
  unsubscribeTheme = OBR.theme.onChange(applyTheme);
  await registerContextMenus();
  await refreshGrid();

  unsubscribeGrid = OBR.scene.grid.onChange(async () => {
    await refreshGrid();
    await refreshTokenPositions();
  });

  OBR.scene.onReadyChange(handleSceneReady);
  handleSceneReady(await OBR.scene.isReady());
}

async function handleSceneReady(ready) {
  if (!ready) {
    if (sceneStateEl) {
      sceneStateEl.textContent = "No scene";
    }
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
  gridScale = await OBR.scene.grid.getScale();
  gridDpiEl && (gridDpiEl.textContent = String(gridDpi));
  gridScaleEl && (gridScaleEl.textContent = gridScale.raw);
}

function applyTheme(theme) {
  const root = document.documentElement;

  root.style.setProperty("--bg", theme.background.default);
  root.style.setProperty("--panel", theme.background.paper);
  root.style.setProperty("--text", theme.text.primary);
  root.style.setProperty("--muted", theme.text.secondary);
  root.style.setProperty("--line", theme.text.disabled);
  root.style.setProperty("--accent", theme.primary.main);
  root.style.setProperty("--accent-contrast", theme.primary.contrastText);
  root.style.setProperty("--secondary", theme.secondary.main);
  root.dataset.themeMode = theme.mode.toLowerCase();
}

async function refreshTokenPositions() {
  if (isUpdatingHitboxes || !(await OBR.scene.isReady())) {
    return;
  }

  await refreshGrid();
  const items = await OBR.scene.items.getItems(isCharacterImage);
  const tokens = await Promise.all(items.map(toTokenCellInfo));
  const tokensWithAdjacency = tokens.map((token) => {
    return {
      ...token,
      adjacentToAlly: isAdjacentToAlly(token, tokens),
      flanked: isFlanked(token, tokens),
    };
  });

  const sortedTokens = tokensWithAdjacency.sort(compareTokenInfo);
  renderTokens(sortedTokens);
  await syncHitboxes(sortedTokens);
}

function scheduleTokenRefresh() {
  if (Date.now() < ignoreItemChangesUntil) {
    return;
  }

  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshTokenPositions, 80);
}

function isCharacterImage(item) {
  return item.type === "IMAGE" && item.layer === "CHARACTER" && item.visible;
}

async function toTokenCellInfo(item) {
  const size = getTokenSizeInCells(item);
  const origin = getTokenGridOrigin(item);
  const snappedOrigin = await snapGridCenter(origin, size);
  const anchor = worldToCell(snappedOrigin);
  const start = getFootprintStart(anchor, size);
  const cells = getFootprintCells(start, size);

  return {
    id: item.id,
    name: item.name || "Unnamed",
    team: getTeam(item),
    immune: isImmune(item),
    position: item.position,
    origin,
    snappedOrigin,
    anchor,
    size,
    cells,
    flankCells: cells,
  };
}

function getTeam(item) {
  return normalizeTeam(item.metadata?.[TEAM_KEY]);
}

function normalizeTeam(team) {
  return TEAM_ALIASES[team] ?? TEAM_DEFAULT;
}

function isImmune(item) {
  return item.metadata?.[IMMUNE_KEY] === true;
}

async function registerContextMenus() {
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/team-menu`,
    icons: [
      {
        icon: "/icon.svg",
        label: "FlankWatch",
        filter: { min: 1 },
      },
    ],
    embed: {
      url: "/team-menu.html",
      height: 150,
    },
  });
}

async function handleTeamChange(event) {
  const control = event.target.closest("[data-team-toggle]");
  const immuneToggle = event.target.closest("[data-immune-toggle]");

  if (immuneToggle) {
    if (isUpdatingImmune) {
      return;
    }

    await setImmune([immuneToggle.dataset.tokenId], immuneToggle.checked);
    return;
  }

  if (!control || isUpdatingTeam) {
    return;
  }

  const id = control.dataset.tokenId;
  const team = control.value;
  await setTeam([id], team);
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
          ensureMetadata(item);
          item.metadata[TEAM_KEY] = team;
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
          ensureMetadata(item);
          if (immune) {
            item.metadata[IMMUNE_KEY] = true;
          } else {
            delete item.metadata[IMMUNE_KEY];
          }
        }
      },
    );
    await refreshTokenPositions();
  } finally {
    isUpdatingImmune = false;
  }
}

function getTokenSizeInCells(item) {
  const dimensions = getImageSceneDimensions(item);

  return {
    width: Math.max(1, Math.round(dimensions.width / gridDpi)),
    height: Math.max(1, Math.round(dimensions.height / gridDpi)),
  };
}

function getImageSceneDimensions(item) {
  const dpiScale = gridDpi / item.grid.dpi;

  return {
    width: Math.abs(item.image.width * dpiScale * item.scale.x),
    height: Math.abs(item.image.height * dpiScale * item.scale.y),
  };
}

function getTokenGridOrigin(item) {
  let center = { x: 0, y: 0 };

  center = Math2.add(
    center,
    Math2.multiply(
      {
        x: item.image.width,
        y: item.image.height,
      },
      0.5,
    ),
  );
  center = Math2.subtract(center, item.grid.offset);
  center = Math2.multiply(center, gridDpi / item.grid.dpi);
  center = Math2.multiply(center, item.scale);
  center = Math2.rotate(center, { x: 0, y: 0 }, item.rotation);

  return Math2.add(center, item.position);
}

function worldToCell(position) {
  return {
    x: snapGridAnchorToCell(position.x),
    y: snapGridAnchorToCell(position.y),
  };
}

function snapGridAnchorToCell(value) {
  const halfTieEpsilon = 0.000001;
  return Math.floor(value / gridDpi + 0.5 - halfTieEpsilon);
}

function getFootprintStart(anchor, size) {
  return {
    x: anchor.x - Math.floor(size.width / 2),
    y: anchor.y - Math.floor(size.height / 2),
  };
}

function getFootprintCells(start, size) {
  const cells = [];

  for (let y = start.y; y < start.y + size.height; y += 1) {
    for (let x = start.x; x < start.x + size.width; x += 1) {
      cells.push({ x, y });
    }
  }

  return cells;
}

function isAdjacentToAlly(token, tokens) {
  const adjacentCells = getAdjacentCells(token.flankCells);
  return tokens.some((other) => {
    return (
      other.id !== token.id &&
      areAllies(token, other) &&
      other.flankCells.some((cell) => adjacentCells.has(formatCell(cell)))
    );
  });
}

async function snapGridCenter(position, size) {
  const useCorners = size.width % 2 === 0 || size.height % 2 === 0;
  const useCenter = !useCorners;

  return OBR.scene.grid.snapPosition(position, 1, useCorners, useCenter);
}

function isFlanked(token, tokens) {
  if (token.immune) {
    return false;
  }

  const requiredContacts = getRequiredFlankContacts(token);

  if (!requiredContacts) {
    return false;
  }

  const candidates = tokens
    .filter((other) => other.id !== token.id && areEnemies(token, other))
    .map((enemy) => {
      const contactCells = getOccupiedAdjacentCells(enemy, token);

      return {
        enemy,
        contactCells,
        contacts: contactCells.length,
      };
    })
    .filter((candidate) => candidate.contacts > 0);

  if (candidates.length < 2) {
    return false;
  }

  return hasValidFlankSet(candidates, requiredContacts);
}

function getRequiredFlankContacts(token) {
  const longestSide = Math.max(token.size.width, token.size.height);

  if (longestSide === 1) {
    return 2;
  }

  if (longestSide === 2) {
    return 3;
  }

  if (longestSide === 3) {
    return 4;
  }

  if (longestSide === 4) {
    return 5;
  }

  return null;
}

function getOccupiedAdjacentCells(attacker, target) {
  const adjacentCells = getAdjacentCells(target.flankCells);
  const contactCellsByKey = new Map();

  for (const cell of attacker.flankCells) {
    const key = formatCell(cell);

    if (adjacentCells.has(key)) {
      contactCellsByKey.set(key, cell);
    }
  }

  return [...contactCellsByKey.values()];
}

function hasValidFlankSet(candidates, requiredContacts, selected = [], contactTotal = 0, index = 0) {
  if (selected.length >= 2 && contactTotal >= requiredContacts) {
    return true;
  }

  if (index >= candidates.length) {
    return false;
  }

  for (let i = index; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const canUse = selected.every((other) => {
      return !areAllies(other.enemy, candidate.enemy) || !areTokensAdjacent(other.enemy, candidate.enemy);
    });

    if (
      canUse &&
      hasValidFlankSet(
        candidates,
        requiredContacts,
        [...selected, candidate],
        contactTotal + candidate.contacts,
        i + 1,
      )
    ) {
      return true;
    }
  }

  return false;
}

function areTokensAdjacent(a, b) {
  const adjacentCells = getAdjacentCells(a.flankCells);
  return b.flankCells.some((cell) => adjacentCells.has(formatCell(cell)));
}

function areAllies(a, b) {
  return a.team === b.team;
}

function areEnemies(a, b) {
  return !areAllies(a, b);
}

function ensureMetadata(item) {
  if (!item.metadata) {
    item.metadata = {};
  }
}

function getAdjacentCells(cells) {
  const occupied = new Set(cells.map(formatCell));
  const adjacent = new Set();

  for (const cell of cells) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }

        const neighbor = { x: cell.x + dx, y: cell.y + dy };
        const key = formatCell(neighbor);

        if (!occupied.has(key)) {
          adjacent.add(key);
        }
      }
    }
  }

  return adjacent;
}

function compareTokenInfo(a, b) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function updateActiveTab() {
  for (const button of teamTabsEl.querySelectorAll("[data-team-tab]")) {
    button.classList.toggle("active", button.dataset.teamTab === activeTeam);
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
    const shapesToAdd = tokens.flatMap(buildTokenHitboxes);

    if (shapesToAdd.length) {
      await OBR.scene.items.addItems(shapesToAdd);
    }
  } finally {
    isUpdatingHitboxes = false;
  }
}

async function clearHitboxes() {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) {
    return;
  }

  ignoreItemChangesUntil = Date.now() + 500;
  const hitboxes = await getHitboxes();

  if (hitboxes.length) {
    await OBR.scene.items.deleteItems(hitboxes.map((item) => item.id));
  }
}

async function getHitboxes() {
  return OBR.scene.items.getItems((item) => item.metadata?.[HITBOX_KEY] === true);
}

function buildTokenHitboxes(token) {
  const color = TEAM_COLORS[token.team] ?? TEAM_COLORS[TEAM_DEFAULT];
  const width = token.size.width * gridDpi;
  const height = token.size.height * gridDpi;

  return [
    buildShape()
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
        [HITBOX_KEY]: true,
        [HITBOX_TOKEN_KEY]: token.id,
      })
      .build(),
  ];
}

function renderTokens(tokens) {
  tokenCountEl && (tokenCountEl.textContent = String(tokens.length));
  updateActiveTab();
  updateTeamCounts(tokens);
  const visibleTokens = tokens.filter((token) => token.team === activeTeam);

  if (!visibleTokens.length) {
    tokenRowsEl.innerHTML = `
      <tr>
        <td colspan="8" class="empty">No ${TEAM_LABELS[activeTeam]} tokens found.</td>
      </tr>
    `;
    return;
  }

  tokenRowsEl.innerHTML = visibleTokens
    .map((token) => {
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
          <td>
            <span class="status ${token.adjacentToAlly ? "yes" : "no"}">
              ${token.adjacentToAlly ? "Yes" : "No"}
            </span>
          </td>
          <td>
            <span class="status ${token.flanked ? "yes" : "no"}">
              ${token.flanked ? "Yes" : "No"}
            </span>
          </td>
          <td>${formatCell(token.anchor)}</td>
          <td>${token.size.width}x${token.size.height}</td>
        </tr>
      `;
    })
    .join("");
}

function updateTeamCounts(tokens) {
  for (const team of TEAMS) {
    const countEl = document.querySelector(`#team-count-${team}`);

    if (countEl) {
      countEl.textContent = String(tokens.filter((token) => token.team === team).length);
    }
  }
}

function formatCell(cell) {
  return `${cell.x},${cell.y}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("pagehide", () => {
  window.clearTimeout(refreshTimer);
  unsubscribeItems?.();
  unsubscribeGrid?.();
  unsubscribeTheme?.();
});
