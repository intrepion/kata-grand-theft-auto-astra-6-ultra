import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { ThirdPersonCamera } from "./camera.ts";

const position = new THREE.Vector3(0, 0.1, 0);
const subject = (heading = Math.PI, driving = false, moving = false) => ({
  position,
  heading,
  driving,
  moving,
  speed: moving ? 20 : 0,
});

function settle(camera: ThirdPersonCamera, state = subject(), seconds = 3) {
  for (let frame = 0; frame < seconds * 60; frame++)
    camera.update(state, 1 / 60);
}

function near(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`,
  );
}

describe("third-person camera", () => {
  it("starts behind the player at street level with perspective projection", () => {
    const rig = new ThirdPersonCamera([]);
    rig.reset(position, Math.PI);
    rig.resize(1600, 900);
    assert.equal(rig.camera.isPerspectiveCamera, true);
    near(rig.camera.aspect, 1600 / 900);
    near(rig.camera.fov, 58);
    assert.ok(rig.camera.position.z > 6 && rig.camera.position.z < 9);
    assert.ok(rig.camera.position.y > 3 && rig.camera.position.y < 4);
    const body = position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const projected = body.project(rig.camera);
    assert.ok(Math.abs(projected.x) < 0.25);
    assert.ok(projected.y > -0.8 && projected.y < 0);
  });

  it("moves left and forward relative to the actual camera after orbiting", () => {
    const rig = new ThirdPersonCamera([]);
    rig.reset(position, Math.PI);
    rig.orbit(290, 0);
    settle(rig);
    const forward = rig.camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
      rig.camera.quaternion,
    );
    const walkForward = rig.movement(1, 0);
    const walkLeft = rig.movement(0, 1);
    near(walkForward.x, forward.x);
    near(walkForward.z, forward.z);
    near(walkLeft.x, -right.x);
    near(walkLeft.z, -right.z);
    near(Math.hypot(...Object.values(rig.movement(1, 1))), 1);
    assert.deepEqual(rig.movement(0, 0), { x: 0, z: 0 });
    near(rig.yaw, Math.PI - 290 * 0.004);
  });

  it("centers the character in portrait view and restores the desktop shoulder", () => {
    const rig = new ThirdPersonCamera([]);
    rig.reset(position, Math.PI);
    rig.resize(411, 683);
    rig.update(subject(), 1 / 60);
    const body = position.clone().add(new THREE.Vector3(0, 0.9, 0));
    near(body.clone().project(rig.camera).x, 0);
    rig.resize(1600, 900);
    settle(rig);
    const desktopX = body.project(rig.camera).x;
    assert.ok(desktopX < -0.05 && desktopX > -0.25);
  });

  it("bounds zoom and vertical orbit to a useful non-overhead view", () => {
    const rig = new ThirdPersonCamera([]);
    rig.reset(position, Math.PI);
    for (const direction of [-1, 1]) {
      rig.orbit(0, direction * 1e7);
      rig.zoom(direction * 1e7);
      settle(rig);
      const horizontal = Math.hypot(
        rig.camera.position.x,
        rig.camera.position.z,
      );
      const height = rig.camera.position.y - position.y - 1.4;
      assert.ok(horizontal >= 5 && horizontal < 13);
      assert.ok(height > 0 && height / horizontal < 0.6);
    }
  });

  it("re-centers behind the car smoothly and waits before resuming after orbit", () => {
    const rig = new ThirdPersonCamera([]);
    rig.reset(position, Math.PI);
    rig.update(subject(Math.PI / 2, true, true), 1 / 60);
    assert.ok(rig.yaw > Math.PI / 2 && rig.yaw < Math.PI);
    settle(rig, subject(Math.PI / 2, true, true));
    assert.ok(rig.camera.position.x < -10);
    assert.ok(Math.abs(rig.camera.position.z) < 0.1);
    assert.ok(rig.camera.fov > 62);
    rig.orbit(180, 0);
    const orbitYaw = rig.yaw;
    settle(rig, subject(Math.PI / 2, true, true), 1);
    near(rig.yaw, orbitYaw);
    settle(rig, subject(Math.PI / 2, true, true), 4);
    near(rig.yaw, Math.PI / 2, 0.01);
  });

  it("preserves the current view when exiting a vehicle and explicitly recenters", () => {
    const rig = new ThirdPersonCamera([]);
    rig.reset(position, Math.PI / 2, true);
    rig.orbit(200, 0);
    const exitYaw = rig.yaw;
    settle(rig, subject(Math.PI, false));
    near(rig.yaw, exitYaw);
    rig.recenter(Math.PI);
    settle(rig);
    near(rig.yaw, Math.PI, 0.01);
  });

  it("contracts before a building wall and eases outward after it clears", () => {
    const wall = { minX: -20, maxX: 20, minZ: 3, maxZ: 6, maxY: 20 };
    const rig = new ThirdPersonCamera([wall]);
    rig.reset(position, Math.PI);
    settle(rig);
    assert.ok(rig.camera.position.z < 2.8);
    assert.ok(rig.camera.position.z > 2);
    const clearState = {
      ...subject(),
      position: new THREE.Vector3(30, 0.1, 0),
    };
    rig.update(clearState, 1 / 60);
    assert.ok(rig.camera.position.distanceTo(clearState.position) < 6);
    settle(rig, clearState);
    assert.ok(rig.camera.position.z > 7);
  });

  it("uses building height so the camera can see over low obstacles", () => {
    const lowWall = { minX: -20, maxX: 20, minZ: 3, maxZ: 6, maxY: 0.5 };
    const rig = new ThirdPersonCamera([lowWall]);
    rig.reset(position, Math.PI);
    settle(rig);
    assert.ok(rig.camera.position.z > 7);
  });

  it("does not pass its camera position through a building corner while orbiting", () => {
    const wall = { minX: 2, maxX: 5, minZ: 2, maxZ: 5, maxY: 20 };
    const rig = new ThirdPersonCamera([wall]);
    rig.reset(position, Math.PI);
    for (let frame = 0; frame < 180; frame++) {
      rig.orbit(-5, 0);
      rig.update(subject(), 1 / 60);
      const p = rig.camera.position;
      const insideExpandedWall =
        p.x > 1.8 && p.x < 5.2 && p.z > 1.8 && p.z < 5.2;
      assert.equal(
        insideExpandedWall,
        false,
        `camera entered the wall at ${p.toArray()}`,
      );
    }
  });
});
