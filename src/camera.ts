import * as THREE from "three";
import { clamp, wrapAngle } from "./mechanics.ts";

interface CameraObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY?: number;
}

interface CameraSubject {
  position: THREE.Vector3;
  heading: number;
  driving: boolean;
  speed: number;
  moving: boolean;
}

const CAMERA_RADIUS = 0.2;
const WALL_GAP = 0.04;

/** A close shoulder camera on foot, with a self-centering vehicle chase view. */
export class ThirdPersonCamera {
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 650);

  private viewYaw = Math.PI;
  private pitchOffset = 0;
  private zoomFactor = 1;
  private sinceOrbit = Infinity;
  private driving = false;
  private driveBlend = 0;
  private enteringVehicle = false;
  private recenterHeading: number | null = null;
  private boomLength = Infinity;
  private readonly pivot = new THREE.Vector3();
  private readonly boom = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(private readonly obstacles: CameraObstacle[]) {}

  get yaw(): number {
    return this.viewYaw;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  reset(position: THREE.Vector3, heading: number, driving = false): void {
    this.viewYaw = wrapAngle(heading);
    this.pitchOffset = 0;
    this.sinceOrbit = Infinity;
    this.driving = driving;
    this.driveBlend = driving ? 1 : 0;
    this.enteringVehicle = false;
    this.recenterHeading = null;
    this.boomLength = Infinity;
    this.update({ position, heading, driving, speed: 0, moving: false }, 0);
  }

  recenter(heading: number): void {
    this.recenterHeading = wrapAngle(heading);
    this.pitchOffset = 0;
  }

  orbit(dx: number, dy: number): void {
    this.viewYaw = wrapAngle(this.viewYaw - dx * 0.004);
    const basePitch = THREE.MathUtils.lerp(0.267, 0.327, this.driveBlend);
    this.pitchOffset =
      clamp(basePitch + this.pitchOffset - dy * 0.003, 0.1, 0.48) - basePitch;
    this.sinceOrbit = 0;
    this.enteringVehicle = false;
    this.recenterHeading = null;
  }

  zoom(delta: number): void {
    this.zoomFactor = clamp(
      this.zoomFactor * Math.exp(clamp(delta, -1000, 1000) * 0.001),
      0.74,
      1.5,
    );
  }

  movement(forward: number, left: number): { x: number; z: number } {
    const magnitude = Math.hypot(forward, left);
    if (magnitude === 0) return { x: 0, z: 0 };
    const scale = 1 / Math.max(1, magnitude);
    return {
      x:
        (Math.sin(this.viewYaw) * forward + Math.cos(this.viewYaw) * left) *
        scale,
      z:
        (Math.cos(this.viewYaw) * forward - Math.sin(this.viewYaw) * left) *
        scale,
    };
  }

  update(subject: CameraSubject, dt: number): void {
    const step = clamp(dt, 0, 0.1);
    this.sinceOrbit += step;
    if (subject.driving !== this.driving) {
      this.enteringVehicle = subject.driving;
      this.recenterHeading = null;
      this.driving = subject.driving;
    }

    const shouldFollowCar =
      subject.driving &&
      (this.enteringVehicle || (subject.moving && this.sinceOrbit > 1.6));
    const heading =
      this.recenterHeading ?? (shouldFollowCar ? subject.heading : null);
    if (heading !== null) {
      const difference = wrapAngle(heading - this.viewYaw);
      this.viewYaw = wrapAngle(
        this.viewYaw + difference * (1 - Math.exp(-step * 4.5)),
      );
      if (Math.abs(difference) < 0.001) {
        this.viewYaw = wrapAngle(heading);
        this.enteringVehicle = false;
        this.recenterHeading = null;
      }
    }

    this.driveBlend = THREE.MathUtils.lerp(
      this.driveBlend,
      subject.driving ? 1 : 0,
      1 - Math.exp(-step * 5),
    );
    const distance =
      THREE.MathUtils.lerp(7.3, 11.2, this.driveBlend) * this.zoomFactor;
    const pitch = clamp(
      THREE.MathUtils.lerp(0.267, 0.327, this.driveBlend) + this.pitchOffset,
      0.1,
      0.48,
    );
    const shoulder =
      0.65 *
      (1 - this.driveBlend) *
      clamp((this.camera.aspect - 0.85) / 0.8, 0, 1);
    const sin = Math.sin(this.viewYaw),
      cos = Math.cos(this.viewYaw);
    this.pivot.copy(subject.position);
    this.pivot.y += THREE.MathUtils.lerp(1.4, 1.2, this.driveBlend);
    this.boom.set(
      -sin * distance - cos * shoulder,
      Math.tan(pitch) * distance,
      -cos * distance + sin * shoulder,
    );

    const fullLength = this.boom.length();
    const clearFraction = this.clearFraction(this.pivot, this.boom);
    const allowedLength =
      clearFraction === 1
        ? fullLength
        : Math.max(0, fullLength * clearFraction - WALL_GAP);
    // Contract immediately. Only the clear boom length eases back out; a world-space
    // position lerp would cut through building corners when the player orbits.
    this.boomLength =
      allowedLength < this.boomLength
        ? allowedLength
        : THREE.MathUtils.lerp(
            this.boomLength,
            allowedLength,
            1 - Math.exp(-step * 3),
          );
    const boomScale = this.boomLength / fullLength;
    this.camera.position.copy(this.pivot).addScaledVector(this.boom, boomScale);

    const lookAhead = THREE.MathUtils.lerp(0.9, 1.8, this.driveBlend);
    // Matching shoulder offsets keeps horizontal camera direction aligned with
    // camera-relative walking while placing the character just left of center.
    this.target.set(
      this.pivot.x + sin * lookAhead - cos * shoulder * boomScale,
      this.pivot.y,
      this.pivot.z + cos * lookAhead + sin * shoulder * boomScale,
    );
    this.camera.lookAt(this.target);
    const fov = THREE.MathUtils.lerp(
      58,
      62 + clamp(Math.abs(subject.speed) / 48, 0, 1) * 5,
      this.driveBlend,
    );
    if (Math.abs(this.camera.fov - fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  /** Sweep the camera's radius along the boom against each building's 3D bounds. */
  private clearFraction(start: THREE.Vector3, delta: THREE.Vector3): number {
    let nearest = 1;
    for (const obstacle of this.obstacles) {
      let enter = 0,
        leave = nearest;
      let intersects = true;
      for (const [origin, direction, min, max] of [
        [
          start.x,
          delta.x,
          obstacle.minX - CAMERA_RADIUS,
          obstacle.maxX + CAMERA_RADIUS,
        ],
        [
          start.y,
          delta.y,
          -Infinity,
          (obstacle.maxY ?? Infinity) + CAMERA_RADIUS,
        ],
        [
          start.z,
          delta.z,
          obstacle.minZ - CAMERA_RADIUS,
          obstacle.maxZ + CAMERA_RADIUS,
        ],
      ]) {
        if (Math.abs(direction) < 1e-9) {
          if (origin < min || origin > max) {
            intersects = false;
            break;
          }
        } else {
          const first = (min - origin) / direction;
          const second = (max - origin) / direction;
          enter = Math.max(enter, Math.min(first, second));
          leave = Math.min(leave, Math.max(first, second));
          if (enter > leave) {
            intersects = false;
            break;
          }
        }
      }
      if (intersects) nearest = Math.min(nearest, enter);
    }
    return nearest;
  }
}
