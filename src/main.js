import "./style.css";
import OBR, { buildShape } from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "com.flankwatch";
const TEAM_KEY = `${EXTENSION_ID}/team`;
const HITBOX_KEY = `${EXTENSION_ID}/hitbox`;
const HITBOX_TOKEN_KEY = `${EXTENSION_ID}/hitbox-token-id`;
const TEAM_ALLY = "ally";
const TEAM_ENEMY = "enemy";

let gridDpi = 150;
let gridScale = null;
let unsubscribeItems = null;
let unsubscribeGrid = null;
let isUpdatingTeam = false;
let isUpdatingHitboxes = false;
let showHitbox = localStorage.getItem(`${EXTENSION_ID}/show-hitbox`) === "true";
let refreshTimer = null;
let ignoreItemChangesUntil = 0;

document.querySelector("#app").innerHTML = `
  <main class="panel">
    <header class="header">
      <div>
        <p class="eyebrow">FlankWatch</p>
        <h1>Token Cells</h1>
      </div>
      <span id="scene-state" class="badge">Offline</span>
    </header>

    <section class="summary" aria-label="Grid summary">
      <div>
        <span id="token-count">0</span>
        <small>tokens</small>
      </div>
      <div>
        <span id="grid-dpi">-</span>
        <small>grid dpi</small>
      </div>
      <div>
        <span id="grid-scale">-</span>
        <small>scale</small>
      </div>
    </section>

    <section class="toolbar" aria-label="Display controls">
      <button id="refresh" type="button">Refresh</button>
      <label class="option-toggle">
        <input id="show-hitbox" type="checkbox" />
        Show Hitbox
      </label>
    </section>

    <section class="token-list" aria-label="Token cell positions">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Ally</th>
            <th>Adjacent Ally</th>
            <th>Flanked</th>
            <th>Anchor</th>
            <th>Size</th>
            <th>Cells</th>
          </tr>
        </thead>
        <tbody id="token-rows">
          <tr>
            <td colspan="7" class="empty">Open an Owlbear Rodeo scene to start.</td>
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

document.querySelector("#refresh").addEventListener("click", refreshTokenPositions);
tokenRowsEl.addEventListener("change", handleTeamChange);
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
  sceneStateEl.textContent = "Preview";
}

async function setup() {
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
    sceneStateEl.textContent = "No scene";
    unsubscribeItems?.();
    unsubscribeItems = null;
    renderTokens([]);
    await clearHitboxes();
    return;
  }

  sceneStateEl.textContent = "Online";
  unsubscribeItems?.();
  unsubscribeItems = OBR.scene.items.onChange(scheduleTokenRefresh);
  await refreshTokenPositions();
}

async function refreshGrid() {
  gridDpi = await OBR.scene.grid.getDpi();
  gridScale = await OBR.scene.grid.getScale();
  gridDpiEl.textContent = String(gridDpi);
  gridScaleEl.textContent = gridScale.raw;
}

async function refreshTokenPositions() {
  if (isUpdatingHitboxes || !(await OBR.scene.isReady())) {
    return;
  }

  await refreshGrid();
  const items = await OBR.scene.items.getItems(isCharacterImage);
  const tokens = items.map(toTokenCellInfo);
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

function toTokenCellInfo(item) {
  const size = getTokenSizeInCells(item);
  const origin = getTokenGridOrigin(item);
  const anchor = worldToCell(origin);
  const start = getFootprintStart(anchor, size);
  const cells = getFootprintCells(start, size);
  const alternateCells = getAlternateFootprintCells(anchor, start, size);

  return {
    id: item.id,
    name: item.name || "Unnamed",
    team: getTeam(item),
    position: item.position,
    origin,
    anchor,
    size,
    cells,
    flankCells: mergeCells(cells, alternateCells),
  };
}

function getTeam(item) {
  return item.metadata?.[TEAM_KEY] === TEAM_ALLY ? TEAM_ALLY : TEAM_ENEMY;
}

async function handleTeamChange(event) {
  const checkbox = event.target.closest("[data-team-toggle]");

  if (!checkbox || isUpdatingTeam) {
    return;
  }

  const id = checkbox.dataset.tokenId;
  const team = checkbox.checked ? TEAM_ALLY : TEAM_ENEMY;
  isUpdatingTeam = true;

  try {
    await OBR.scene.items.updateItems(
      (item) => item.id === id && isCharacterImage(item),
      (items) => {
        for (const item of items) {
          item.metadata[TEAM_KEY] = team;
        }
      },
    );
    await refreshTokenPositions();
  } finally {
    isUpdatingTeam = false;
  }
}

function getTokenSizeInCells(item) {
  return {
    width: getImageGridSize(item.image.width, item.grid.dpi, item.scale.x),
    height: getImageGridSize(item.image.height, item.grid.dpi, item.scale.y),
  };
}

function getImageGridSize(imagePixels, imageGridDpi, scale = 1) {
  return Math.max(1, Math.round((imagePixels / imageGridDpi) * Math.abs(scale || 1)));
}

function getTokenGridOrigin(item) {
  return {
    x: item.position.x + (item.grid.offset?.x ?? 0),
    y: item.position.y + (item.grid.offset?.y ?? 0),
  };
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

function getAlternateFootprintCells(anchor, start, size) {
  if (size.width % 2 !== 0 && size.height % 2 !== 0) {
    return [];
  }

  const alternateStart = {
    x: size.width % 2 === 0 ? anchor.x : start.x,
    y: size.height % 2 === 0 ? anchor.y : start.y,
  };

  if (alternateStart.x === start.x && alternateStart.y === start.y) {
    return [];
  }

  return getFootprintCells(alternateStart, size);
}

function mergeCells(...cellGroups) {
  const cellsByKey = new Map();

  for (const cells of cellGroups) {
    for (const cell of cells) {
      cellsByKey.set(formatCell(cell), cell);
    }
  }

  return [...cellsByKey.values()];
}

function isAdjacentToAlly(token, tokens) {
  const adjacentCells = getAdjacentCells(token.flankCells);
  return tokens.some((other) => {
    return (
      other.id !== token.id &&
      other.team === token.team &&
      other.flankCells.some((cell) => adjacentCells.has(formatCell(cell)))
    );
  });
}

function isFlanked(token, tokens) {
  const requiredContacts = getRequiredFlankContacts(token);

  if (!requiredContacts) {
    return false;
  }

  const candidates = tokens
    .filter((other) => other.id !== token.id && other.team !== token.team)
    .map((enemy) => {
      return {
        enemy,
        contacts: getOccupiedAdjacentCellCount(enemy, token),
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

function getOccupiedAdjacentCellCount(attacker, target) {
  const adjacentCells = getAdjacentCells(target.flankCells);
  const occupiedCells = new Set(target.flankCells.map(formatCell));

  return attacker.flankCells.filter((cell) => {
    const key = formatCell(cell);
    return adjacentCells.has(key) || occupiedCells.has(key);
  }).length;
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
    const canUse = selected.every((other) => !areTokensAdjacent(other.enemy, candidate.enemy));

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
  const color = token.team === TEAM_ALLY ? "#2f9e44" : "#e03131";
  const width = token.size.width * gridDpi;
  const height = token.size.height * gridDpi;

  return [
    buildShape()
      .name(`FlankWatch Hitbox: ${token.name}`)
      .layer("DRAWING")
      .position({
        x: token.position.x - width / 2,
        y: token.position.y - height / 2,
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
      .metadata({
        [HITBOX_KEY]: true,
        [HITBOX_TOKEN_KEY]: token.id,
      })
      .build(),
  ];
}

function renderTokens(tokens) {
  tokenCountEl.textContent = String(tokens.length);

  if (!tokens.length) {
    tokenRowsEl.innerHTML = `
      <tr>
        <td colspan="7" class="empty">No visible character tokens found.</td>
      </tr>
    `;
    return;
  }

  tokenRowsEl.innerHTML = tokens
    .map((token) => {
      return `
        <tr>
          <td>
            <strong>${escapeHtml(token.name)}</strong>
            <small>${escapeHtml(token.id)}</small>
          </td>
          <td>
            <label class="team-toggle">
              <input
                data-team-toggle
                data-token-id="${escapeHtml(token.id)}"
                type="checkbox"
                ${token.team === TEAM_ALLY ? "checked" : ""}
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
          <td>${token.cells.map(formatCell).join(" ")}</td>
        </tr>
      `;
    })
    .join("");
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
});
