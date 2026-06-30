import { Math2 } from "@owlbear-rodeo/sdk";

import { getTeam, isImmune } from "./items.js";

export async function toTokenCellInfo(item, gridDpi, snapPosition) {
  const size = getTokenSizeInCells(item, gridDpi);
  const origin = getTokenGridOrigin(item, gridDpi);
  const snappedOrigin = await snapGridCenter(origin, size, snapPosition);
  const anchor = worldToCell(snappedOrigin, gridDpi);
  const start = getFootprintStart(anchor, size);
  const cells = getFootprintCells(start, size);

  return {
    id: item.id,
    name: item.name || "Unnamed",
    team: getTeam(item),
    immune: isImmune(item),
    position: item.position,
    origin,
    snappedOrigin,
    anchor,
    size,
    cells,
    flankCells: cells,
  };
}

export function getTokenSizeInCells(item, gridDpi) {
  const dimensions = getImageSceneDimensions(item, gridDpi);

  return {
    width: Math.max(1, Math.round(dimensions.width / gridDpi)),
    height: Math.max(1, Math.round(dimensions.height / gridDpi)),
  };
}

export function getImageSceneDimensions(item, gridDpi) {
  const dpiScale = gridDpi / item.grid.dpi;

  return {
    width: Math.abs(item.image.width * dpiScale * item.scale.x),
    height: Math.abs(item.image.height * dpiScale * item.scale.y),
  };
}

export function getTokenGridOrigin(item, gridDpi) {
  let center = { x: 0, y: 0 };

  center = Math2.add(
    center,
    Math2.multiply(
      {
        x: item.image.width,
        y: item.image.height,
      },
      0.5,
    ),
  );
  center = Math2.subtract(center, item.grid.offset);
  center = Math2.multiply(center, gridDpi / item.grid.dpi);
  center = Math2.multiply(center, item.scale);
  center = Math2.rotate(center, { x: 0, y: 0 }, item.rotation);

  return Math2.add(center, item.position);
}

export function worldToCell(position, gridDpi) {
  return {
    x: snapGridAnchorToCell(position.x, gridDpi),
    y: snapGridAnchorToCell(position.y, gridDpi),
  };
}

function snapGridAnchorToCell(value, gridDpi) {
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

async function snapGridCenter(position, size, snapPosition) {
  const useCorners = size.width % 2 === 0 || size.height % 2 === 0;
  const useCenter = !useCorners;

  return snapPosition(position, 1, useCorners, useCenter);
}
