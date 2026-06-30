import { formatCell, getAdjacentCells } from "./cells.js";

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

export function isFlanked(token, tokens) {
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

function areAllies(a, b) {
  return a.team === b.team;
}

function areEnemies(a, b) {
  return !areAllies(a, b);
}
