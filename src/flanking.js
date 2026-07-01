import { formatCell, getAdjacentCells } from "./cells.js";
import { RULESET_DND, RULESET_PTU } from "./constants.js";

export function isAdjacentToAlly(token, tokens) {
  const adjacentCells = getAdjacentCells(token.flankCells);

  return tokens.some((other) => {
    return (
      other.id !== token.id &&
      areAllies(token, other) &&
      other.flankCells.some((cell) => adjacentCells.has(formatCell(cell)))
    );
  });
}

export function isFlanked(token, tokens, ruleset = RULESET_PTU) {
  if (token.immune) {
    return false;
  }

  if (ruleset === RULESET_DND) {
    return isFlankedDnd(token, tokens);
  }

  return isFlankedPtu(token, tokens);
}

function isFlankedPtu(token, tokens) {
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

function isFlankedDnd(token, tokens) {
  const candidates = tokens
    .filter((other) => other.id !== token.id && areEnemies(token, other))
    .filter((enemy) => getOccupiedAdjacentCells(enemy, token).length > 0)
    .map((enemy) => {
      return {
        enemy,
        region: getTokenRegionAroundTarget(enemy, token),
      };
    })
    .filter((candidate) => isOuterRegion(candidate.region));

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];

      if (areAllies(a.enemy, b.enemy) && areOppositeRegions(a.region, b.region)) {
        return true;
      }
    }
  }

  return false;
}

function getRequiredFlankContacts(token) {
  const longestSide = Math.max(token.size.width, token.size.height);

  if (longestSide >= 1 && longestSide <= 4) {
    return longestSide + 1;
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

function getTokenRegionAroundTarget(token, target) {
  const tokenCenter = getCellsCenter(token.flankCells);
  const targetBounds = getCellsBounds(target.flankCells);

  return {
    x: getAxisRegion(tokenCenter.x, targetBounds.minX - 0.5, targetBounds.maxX + 0.5),
    y: getAxisRegion(tokenCenter.y, targetBounds.minY - 0.5, targetBounds.maxY + 0.5),
  };
}

function getCellsCenter(cells) {
  const bounds = getCellsBounds(cells);

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function getCellsBounds(cells) {
  return cells.reduce(
    (bounds, cell) => {
      return {
        minX: Math.min(bounds.minX, cell.x),
        maxX: Math.max(bounds.maxX, cell.x),
        minY: Math.min(bounds.minY, cell.y),
        maxY: Math.max(bounds.maxY, cell.y),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function getAxisRegion(value, min, max) {
  if (value < min) {
    return -1;
  }

  if (value > max) {
    return 1;
  }

  return 0;
}

function isOuterRegion(region) {
  return region.x !== 0 || region.y !== 0;
}

function areOppositeRegions(a, b) {
  return a.x === -b.x && a.y === -b.y && isOuterRegion(a) && isOuterRegion(b);
}

function areAllies(a, b) {
  return a.team === b.team;
}

function areEnemies(a, b) {
  return !areAllies(a, b);
}
