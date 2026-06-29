import OBR from "@owlbear-rodeo/sdk";

import "./team-menu.css";

const EXTENSION_ID = "com.flankwatch";
const TEAM_KEY = `${EXTENSION_ID}/team`;
const IMMUNE_KEY = `${EXTENSION_ID}/immune`;
const TEAM_ALLY = "ally";
const TEAM_1 = "team1";
const TEAM_2 = "team2";
const TEAM_3 = "team3";

const TEAMS = [
  { id: TEAM_ALLY, label: "Ally", color: "#2f9e44" },
  { id: TEAM_1, label: "Team 1", color: "#e03131" },
  { id: TEAM_2, label: "Team 2", color: "#1971c2" },
  { id: TEAM_3, label: "Team 3", color: "#f08c00" },
];

document.querySelector("#team-menu").innerHTML = `
  <section class="team-menu-panel">
    ${TEAMS.map((team) => {
      return `
        <button type="button" data-team="${team.id}" style="--team-color: ${team.color}">
          <span aria-hidden="true"></span>
          ${team.label}
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

const messageEl = document.querySelector("#team-menu-message");
const immuneToggleEl = document.querySelector("#immune-toggle");

document.querySelector("#team-menu").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-team]");

  if (!button) {
    return;
  }

  const ids = await OBR.player.getSelection();

  if (!ids?.length) {
    messageEl.textContent = "No selected token.";
    return;
  }

  await setTeam(ids, button.dataset.team);
  messageEl.textContent = `${ids.length} token(s) updated.`;
});

immuneToggleEl.addEventListener("change", async () => {
  const ids = await OBR.player.getSelection();

  if (!ids?.length) {
    messageEl.textContent = "No selected token.";
    return;
  }

  await setImmune(ids, immuneToggleEl.checked);
  messageEl.textContent = `${ids.length} token(s) updated.`;
});

async function setTeam(ids, team) {
  await OBR.scene.items.updateItems(
    (item) => ids.includes(item.id) && item.type === "IMAGE" && item.layer === "CHARACTER",
    (items) => {
      for (const item of items) {
        if (team === TEAM_ALLY) {
          delete item.metadata[TEAM_KEY];
        } else {
          item.metadata[TEAM_KEY] = team;
        }
      }
    },
  );
}

async function setImmune(ids, immune) {
  await OBR.scene.items.updateItems(
    (item) => ids.includes(item.id) && item.type === "IMAGE" && item.layer === "CHARACTER",
    (items) => {
      for (const item of items) {
        if (immune) {
          item.metadata[IMMUNE_KEY] = true;
        } else {
          delete item.metadata[IMMUNE_KEY];
        }
      }
    },
  );
}
