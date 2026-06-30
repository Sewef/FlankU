import OBR from "@owlbear-rodeo/sdk";

import "./team-menu.css";

import { IMMUNE_KEY, TEAM_KEY, TEAMS, TEAM_COLORS, TEAM_LABELS, normalizeTeam } from "./constants.js";
import { ensureMetadata, isCharacterImage } from "./items.js";
import { applyTheme } from "./theme.js";

document.querySelector("#team-menu").innerHTML = `
  <section class="team-menu-panel">
    ${TEAMS.map((team) => {
      return `
        <button type="button" data-team="${team}" style="--team-color: ${TEAM_COLORS[team]}">
          <span aria-hidden="true"></span>
          ${TEAM_LABELS[team]}
        </button>
      `;
    }).join("")}
    <label class="immune-control">
      <input id="immune-toggle" type="checkbox" />
      Immune to flank
    </label>
    <p id="team-menu-message">Choose a team for the selected token(s).</p>
  </section>
`;

const menuEl = document.querySelector("#team-menu");
const messageEl = document.querySelector("#team-menu-message");
const immuneToggleEl = document.querySelector("#immune-toggle");

if (OBR.isAvailable) {
  OBR.onReady(async () => {
    applyTheme(await OBR.theme.getTheme());
    OBR.theme.onChange(applyTheme);
  });
}

menuEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-team]");

  if (!button) {
    return;
  }

  await updateSelectedTokens((item) => {
    item.metadata[TEAM_KEY] = normalizeTeam(button.dataset.team);
  });
});

immuneToggleEl.addEventListener("change", async () => {
  await updateSelectedTokens((item) => {
    if (immuneToggleEl.checked) {
      item.metadata[IMMUNE_KEY] = true;
    } else {
      delete item.metadata[IMMUNE_KEY];
    }
  });
});

async function updateSelectedTokens(update) {
  const ids = await OBR.player.getSelection();

  if (!ids?.length) {
    messageEl.textContent = "No selected token.";
    return;
  }

  await OBR.scene.items.updateItems(
    (item) => ids.includes(item.id) && isCharacterImage(item),
    (items) => {
      for (const item of items) {
        ensureMetadata(item);
        update(item);
      }
    },
  );

  messageEl.textContent = `${ids.length} token(s) updated.`;
}
