export const EXTENSION_ID = "com.flankwatch";

export const TEAM_KEY = `${EXTENSION_ID}/team`;
export const IMMUNE_KEY = `${EXTENSION_ID}/immune`;
export const HITBOX_KEY = `${EXTENSION_ID}/hitbox`;
export const HITBOX_TOKEN_KEY = `${EXTENSION_ID}/hitbox-token-id`;

export const TEAM_DEFAULT = "default";
export const TEAM_1 = "team1";
export const TEAM_2 = "team2";
export const TEAM_3 = "team3";

export const TEAMS = [TEAM_DEFAULT, TEAM_1, TEAM_2, TEAM_3];

export const TEAM_LABELS = {
  [TEAM_DEFAULT]: "Ally",
  [TEAM_1]: "Team 1",
  [TEAM_2]: "Team 2",
  [TEAM_3]: "Team 3",
};

export const TEAM_COLORS = {
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

export function normalizeTeam(team) {
  return TEAM_ALIASES[team] ?? TEAM_DEFAULT;
}
