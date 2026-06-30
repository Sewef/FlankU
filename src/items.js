import { IMMUNE_KEY, TEAM_KEY, normalizeTeam } from "./constants.js";

export function isCharacterImage(item) {
  return item.type === "IMAGE" && item.layer === "CHARACTER" && item.visible;
}

export function getTeam(item) {
  return normalizeTeam(item.metadata?.[TEAM_KEY]);
}

export function isImmune(item) {
  return item.metadata?.[IMMUNE_KEY] === true;
}

export function ensureMetadata(item) {
  if (!item.metadata) {
    item.metadata = {};
  }
}
