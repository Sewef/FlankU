import OBR from "@owlbear-rodeo/sdk";

import "./context-menu.css";

import { METADATA_FIELDS, TEAMS, TEAM_COLORS, TEAM_LABELS, normalizeTeam } from "./constants.js";
import { ensureExtensionMetadata, isFlankableImage } from "./items.js";
import { applyTheme } from "./theme.js";

document.querySelector("#context-menu").innerHTML = `
  <section class="context-menu-panel">
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
    <p id="context-menu-message">Choose a team for the selected token(s).</p>
  </section>
`;

const menuEl = document.querySelector("#context-menu");
const messageEl = document.querySelector("#context-menu-message");
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
    const metadata = ensureExtensionMetadata(item);
    metadata[METADATA_FIELDS.team] = normalizeTeam(button.dataset.team);
  });
});

immuneToggleEl.addEventListener("change", async () => {
  await updateSelectedTokens((item) => {
    const metadata = ensureExtensionMetadata(item);

    if (immuneToggleEl.checked) {
      metadata[METADATA_FIELDS.immune] = true;
    } else {
      delete metadata[METADATA_FIELDS.immune];
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
    (item) => ids.includes(item.id) && isFlankableImage(item, true),
    (items) => {
      for (const item of items) {
        update(item);
      }
    },
  );

  messageEl.textContent = `${ids.length} token(s) updated.`;
}
