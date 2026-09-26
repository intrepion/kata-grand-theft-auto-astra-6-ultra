export interface Point {
  x: number;
  z: number;
}
export interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function isBlocked(
  p: Point,
  radius: number,
  obstacles: Obstacle[],
  bounds: number,
): boolean {
  if (Math.abs(p.x) + radius > bounds || Math.abs(p.z) + radius > bounds)
    return true;
  return obstacles.some((o) => {
    const x = clamp(p.x, o.minX, o.maxX);
    const z = clamp(p.z, o.minZ, o.maxZ);
    return (p.x - x) ** 2 + (p.z - z) ** 2 < radius ** 2;
  });
}

/** Axis-separated movement allows sliding along a wall without crossing it. */
export function moveWithCollisions(
  position: Point,
  dx: number,
  dz: number,
  radius: number,
  obstacles: Obstacle[],
  bounds: number,
): boolean {
  let collided = false;
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(dx, dz) / Math.max(radius * 0.5, 0.2)),
  );
  for (let i = 0; i < steps; i++) {
    const nextX = { x: position.x + dx / steps, z: position.z };
    if (!isBlocked(nextX, radius, obstacles, bounds)) position.x = nextX.x;
    else collided = true;
    const nextZ = { x: position.x, z: position.z + dz / steps };
    if (!isBlocked(nextZ, radius, obstacles, bounds)) position.z = nextZ.z;
    else collided = true;
  }
  return collided;
}

export function hasLineOfSight(
  a: Point,
  b: Point,
  obstacles: Obstacle[],
): boolean {
  return !obstacles.some((o) => {
    let tMin = 0,
      tMax = 1;
    for (const [axis, min, max] of [
      ["x", o.minX, o.maxX],
      ["z", o.minZ, o.maxZ],
    ] as const) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 0.00001) {
        if (a[axis] < min || a[axis] > max) return false;
      } else {
        const t1 = (min - a[axis]) / delta;
        const t2 = (max - a[axis]) / delta;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
        if (tMin > tMax) return false;
      }
    }
    return true;
  });
}

export interface DrivingState {
  speed: number;
  angle: number;
}
export function advanceDriving(
  state: DrivingState,
  throttle: number,
  steering: number,
  brake: boolean,
  boost: boolean,
  dt: number,
): void {
  const maxSpeed = boost ? 48 : 34;
  if (throttle !== 0) {
    const reversing =
      Math.sign(throttle) !== Math.sign(state.speed) &&
      Math.abs(state.speed) > 1;
    state.speed += throttle * (reversing ? 35 : boost ? 23 : 17) * dt;
  } else state.speed *= Math.exp(-0.65 * dt);
  if (brake) state.speed *= Math.exp(-3.2 * dt);
  state.speed = clamp(state.speed, -13, maxSpeed);
  if (Math.abs(state.speed) < 0.08) state.speed = 0;
  const grip = clamp(Math.abs(state.speed) / 8, 0, 1);
  state.angle +=
    steering * (brake ? 2.7 : 1.7) * grip * Math.sign(state.speed || 1) * dt;
  state.angle = wrapAngle(state.angle);
}

export interface HeatState {
  wanted: number;
  hiddenFor: number;
  grace: number;
}
export function advanceHeat(
  heat: HeatState,
  seen: boolean,
  dt: number,
): boolean {
  if (heat.wanted === 0) return false;
  const previousGrace = heat.grace;
  heat.grace = Math.max(0, heat.grace - dt);
  if (seen) heat.hiddenFor = 0;
  else {
    if (previousGrace > 0) heat.hiddenFor = 0;
    heat.hiddenFor += Math.max(0, dt - previousGrace);
  }
  if (heat.hiddenFor >= 8) {
    heat.wanted = Math.max(0, heat.wanted - 1);
    heat.hiddenFor = 0;
    return true;
  }
  return false;
}

export interface SaveData {
  cash: number;
  missionCount: number;
}
export function parseSave(raw: string | null): SaveData {
  try {
    const data: unknown = JSON.parse(raw || "{}");
    if (typeof data !== "object" || !data)
      return { cash: 1200, missionCount: 0 };
    const save = data as Partial<SaveData>;
    return {
      cash:
        typeof save.cash === "number" && Number.isFinite(save.cash)
          ? clamp(Math.floor(save.cash), 0, 999999999)
          : 1200,
      missionCount:
        typeof save.missionCount === "number" &&
        Number.isFinite(save.missionCount)
          ? clamp(Math.floor(save.missionCount), 0, 99999)
          : 0,
    };
  } catch {
    return { cash: 1200, missionCount: 0 };
  }
}
