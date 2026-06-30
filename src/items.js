import { METADATA_FIELDS, METADATA_KEY, normalizeTeam } from "./constants.js";

export function isCharacterImage(item) {
  return item.type === "IMAGE" && item.layer === "CHARACTER" && item.visible;
}

export function getTeam(item) {
  return normalizeTeam(getExtensionMetadata(item)?.[METADATA_FIELDS.team]);
}

export function isImmune(item) {
  return getExtensionMetadata(item)?.[METADATA_FIELDS.immune] === true;
}

export function ensureMetadata(item) {
  if (!item.metadata) {
    item.metadata = {};
  }
}

export function getExtensionMetadata(item) {
  return item.metadata?.[METADATA_KEY];
}

export function ensureExtensionMetadata(item) {
  ensureMetadata(item);

  if (!item.metadata[METADATA_KEY]) {
    item.metadata[METADATA_KEY] = {};
  }

  return item.metadata[METADATA_KEY];
}

export function isFlankWatchHitbox(item) {
  return getExtensionMetadata(item)?.[METADATA_FIELDS.hitbox] === true;
}
