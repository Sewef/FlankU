export function formatCell(cell) {
  return `${cell.x},${cell.y}`;
}

export function getAdjacentCells(cells) {
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
