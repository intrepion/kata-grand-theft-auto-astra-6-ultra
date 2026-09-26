import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceDriving,
  advanceHeat,
  hasLineOfSight,
  isBlocked,
  moveWithCollisions,
  parseSave,
} from "./mechanics.ts";
import type { DrivingState, HeatState, Obstacle } from "./mechanics.ts";

function near(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`,
  );
}

function driveFor(
  state: DrivingState,
  seconds: number,
  throttle: number,
  steering = 0,
  brake = false,
  boost = false,
) {
  for (let frame = 0; frame < seconds * 60; frame++)
    advanceDriving(state, throttle, steering, brake, boost, 1 / 60);
}

describe("building and island collisions", () => {
  const building: Obstacle = { minX: 10, maxX: 20, minZ: 10, maxZ: 20 };

  it("blocks the interior and a radius overlapping a building face", () => {
    assert.equal(isBlocked({ x: 15, z: 15 }, 1, [building], 121), true);
    assert.equal(isBlocked({ x: 9.5, z: 15 }, 1, [building], 121), true);
    assert.equal(isBlocked({ x: 9, z: 15 }, 1, [building], 121), false);
  });

  it("uses a circular footprint at corners rather than an expanded square", () => {
    assert.equal(isBlocked({ x: 9.2, z: 9.2 }, 1, [building], 121), false);
    assert.equal(isBlocked({ x: 9.4, z: 9.4 }, 1, [building], 121), true);
    assert.equal(isBlocked({ x: 20.8, z: 20.8 }, 1, [building], 121), false);
    assert.equal(isBlocked({ x: 20.6, z: 20.6 }, 1, [building], 121), true);
  });

  it("allows island-edge contact and rejects any part of the body crossing it", () => {
    for (const sign of [-1, 1]) {
      assert.equal(isBlocked({ x: sign * 120, z: 0 }, 1, [], 121), false);
      assert.equal(isBlocked({ x: sign * 120.01, z: 0 }, 1, [], 121), true);
      assert.equal(isBlocked({ x: 0, z: sign * 120.01 }, 1, [], 121), true);
    }
  });

  it("prevents a fast vehicle from tunneling through a very thin obstacle", () => {
    const position = { x: 0, z: 0 };
    const thinWall = { minX: 10, maxX: 10.05, minZ: -30, maxZ: 30 };
    const collided = moveWithCollisions(position, 70, 0, 1.1, [thinWall], 121);
    assert.equal(collided, true);
    assert.ok(position.x <= 8.9, `vehicle crossed the wall: ${position.x}`);
    assert.ok(position.x > 8, "vehicle should travel up to the wall");
    assert.equal(isBlocked(position, 1.1, [thinWall], 121), false);
  });

  it("slides along a wall while preserving progress on the free axis", () => {
    const position = { x: 8, z: 0 };
    const wall = { minX: 10, maxX: 15, minZ: -30, maxZ: 30 };
    assert.equal(moveWithCollisions(position, 8, 12, 1, [wall], 121), true);
    assert.ok(position.x <= 9);
    near(position.z, 12);
    assert.equal(isBlocked(position, 1, [wall], 121), false);
  });

  it("moves freely on an open road and reports no collision", () => {
    const position = { x: 0, z: 0 };
    assert.equal(
      moveWithCollisions(position, 0, 70, 1, [building], 121),
      false,
    );
    near(position.x, 0);
    near(position.z, 70);
  });
});

describe("police visibility", () => {
  const buildings: Obstacle[] = [
    { minX: 8, maxX: 24, minZ: 8, maxZ: 24 },
    { minX: -24, maxX: -8, minZ: 8, maxZ: 24 },
  ];

  it("keeps an unobstructed road visible in both directions", () => {
    const north = { x: 0, z: -30 },
      south = { x: 0, z: 60 };
    assert.equal(hasLineOfSight(north, south, buildings), true);
    assert.equal(hasLineOfSight(south, north, buildings), true);
  });

  it("blocks sight through a building and diagonally across its corner", () => {
    assert.equal(
      hasLineOfSight({ x: 0, z: 16 }, { x: 40, z: 16 }, buildings),
      false,
    );
    assert.equal(
      hasLineOfSight({ x: 40, z: 16 }, { x: 0, z: 16 }, buildings),
      false,
    );
    assert.equal(
      hasLineOfSight({ x: 0, z: 0 }, { x: 40, z: 40 }, buildings),
      false,
    );
  });

  it("ignores buildings behind either end of the sight segment", () => {
    assert.equal(
      hasLineOfSight({ x: 0, z: 16 }, { x: 5, z: 16 }, buildings),
      true,
    );
    assert.equal(
      hasLineOfSight({ x: 28, z: 16 }, { x: 40, z: 16 }, buildings),
      true,
    );
  });
});

describe("driving controls", () => {
  it("accelerates forward to a capped cruising speed and boosts beyond it", () => {
    const normal = { speed: 0, angle: 0 };
    driveFor(normal, 5, 1);
    near(normal.speed, 34);
    const boosted = { speed: 0, angle: 0 };
    driveFor(boosted, 5, 1, 0, false, true);
    near(boosted.speed, 48);
    assert.ok(boosted.speed > normal.speed);
  });

  it("brakes before reversing and caps the lower reverse speed", () => {
    const state = { speed: 20, angle: 0 };
    advanceDriving(state, -1, 0, false, false, 0.1);
    assert.ok(
      state.speed > 0 && state.speed < 20,
      "reverse first slows the forward-moving vehicle",
    );
    driveFor(state, 4, -1);
    near(state.speed, -13);
  });

  it("steers in opposite directions when moving forward and in reverse", () => {
    const forward = { speed: 12, angle: 0 };
    const reverse = { speed: -12, angle: 0 };
    advanceDriving(forward, 0, 1, false, false, 0.1);
    advanceDriving(reverse, 0, 1, false, false, 0.1);
    assert.ok(forward.angle > 0);
    assert.ok(reverse.angle < 0);
    near(forward.angle, -reverse.angle);
  });

  it("cannot rotate a stationary car with steering alone", () => {
    const stopped = { speed: 0, angle: 0.75 };
    driveFor(stopped, 1, 0, 1);
    near(stopped.speed, 0);
    near(stopped.angle, 0.75);
  });

  it("slows much faster under the handbrake than under natural coasting", () => {
    const coasting = { speed: 30, angle: 0 };
    const braking = { speed: 30, angle: 0 };
    driveFor(coasting, 1, 0);
    driveFor(braking, 1, 0, 0, true);
    assert.ok(coasting.speed > 10 && coasting.speed < 30);
    assert.ok(braking.speed < 2);
    assert.ok(braking.speed >= 0, "braking must not put the car into reverse");
  });
});

describe("wanted level and escape timing", () => {
  it("requires eight uninterrupted unseen seconds for every wanted star", () => {
    const heat: HeatState = { wanted: 2, hiddenFor: 0, grace: 0 };
    for (let second = 0; second < 7; second++)
      assert.equal(advanceHeat(heat, false, 1), false);
    assert.equal(heat.wanted, 2);
    assert.equal(advanceHeat(heat, false, 1), true);
    assert.equal(heat.wanted, 1);
    for (let second = 0; second < 7; second++)
      assert.equal(advanceHeat(heat, false, 1), false);
    assert.equal(heat.wanted, 1);
    assert.equal(advanceHeat(heat, false, 1), true);
    assert.equal(heat.wanted, 0);
    assert.equal(advanceHeat(heat, false, 100), false);
    assert.equal(heat.wanted, 0);
  });

  it("restarts the escape countdown when an officer sees the player", () => {
    const heat = { wanted: 1, hiddenFor: 7.5, grace: 0 };
    assert.equal(advanceHeat(heat, true, 0.5), false);
    assert.equal(heat.hiddenFor, 0);
    assert.equal(advanceHeat(heat, false, 7.5), false);
    assert.equal(heat.wanted, 1);
    assert.equal(advanceHeat(heat, false, 0.5), true);
    assert.equal(heat.wanted, 0);
  });

  it("does not count time spent in the crime grace period toward an escape", () => {
    const heat = { wanted: 1, hiddenFor: 0, grace: 2 };
    assert.equal(advanceHeat(heat, false, 1), false);
    assert.equal(heat.hiddenFor, 0);
    assert.equal(advanceHeat(heat, false, 1), false);
    assert.equal(heat.grace, 0);
    assert.equal(
      heat.hiddenFor,
      0,
      "the second second was still entirely inside the grace period",
    );
    assert.equal(advanceHeat(heat, false, 7), false);
    assert.equal(heat.wanted, 1);
    assert.equal(advanceHeat(heat, false, 1), true);
  });

  it("counts only the unseen fraction of a step crossing the grace boundary", () => {
    const heat = { wanted: 1, hiddenFor: 0, grace: 0.5 };
    assert.equal(advanceHeat(heat, false, 1), false);
    near(heat.hiddenFor, 0.5);
    assert.equal(heat.wanted, 1);
  });

  it("does not reduce heat while the player stays visible", () => {
    const heat = { wanted: 3, hiddenFor: 0, grace: 0 };
    for (let second = 0; second < 30; second++)
      assert.equal(advanceHeat(heat, true, 1), false);
    assert.equal(heat.wanted, 3);
    assert.equal(heat.hiddenFor, 0);
  });
});

describe("saved progress recovery", () => {
  const defaultSave = { cash: 1200, missionCount: 0 };

  it("recovers safely from missing, truncated, primitive, and invalid JSON saves", () => {
    for (const raw of [
      null,
      "",
      '{"cash":',
      "undefined",
      "null",
      "false",
      "42",
      '"oops"',
      "[]",
    ]) {
      assert.deepEqual(
        parseSave(raw),
        defaultSave,
        `unexpected recovery for ${raw}`,
      );
    }
  });

  it("retains valid progress while recovering a corrupt field independently", () => {
    assert.deepEqual(parseSave('{"cash":2500,"missionCount":"oops"}'), {
      cash: 2500,
      missionCount: 0,
    });
    assert.deepEqual(parseSave('{"cash":"oops","missionCount":4}'), {
      cash: 1200,
      missionCount: 4,
    });
    assert.deepEqual(
      parseSave('{"cash":1e400,"missionCount":null}'),
      defaultSave,
    );
  });

  it("normalizes fractional, negative, and implausibly large numeric progress", () => {
    assert.deepEqual(parseSave('{"cash":2530.9,"missionCount":4.8}'), {
      cash: 2530,
      missionCount: 4,
    });
    assert.deepEqual(parseSave('{"cash":-4,"missionCount":-5}'), {
      cash: 0,
      missionCount: 0,
    });
    assert.deepEqual(parseSave('{"cash":1e20,"missionCount":1e20}'), {
      cash: 999999999,
      missionCount: 99999,
    });
  });
});
