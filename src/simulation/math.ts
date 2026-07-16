import type { Vec3 } from "./types";

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
export const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
export const scale = (a: Vec3, amount: number): Vec3 => ({
  x: a.x * amount,
  y: a.y * amount,
  z: a.z * amount,
});
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const size = length(a);
  return size > 0.0001 ? scale(a, 1 / size) : vec(0, 0, 1);
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function distanceToSegment(point: Vec3, start: Vec3, end: Vec3): number {
  const line = sub(end, start);
  const lineLengthSq = line.x ** 2 + line.y ** 2 + line.z ** 2;
  if (lineLengthSq === 0) return distance(point, start);
  const pointOffset = sub(point, start);
  const t = clamp(
    (pointOffset.x * line.x + pointOffset.y * line.y + pointOffset.z * line.z) /
      lineLengthSq,
    0,
    1,
  );
  return distance(point, add(start, scale(line, t)));
}

export const formatDistance = (metres: number): string =>
  metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.round(metres)} m`;

export const formatSpeed = (speed: number): string =>
  `${Math.round(speed)} m/s`;
