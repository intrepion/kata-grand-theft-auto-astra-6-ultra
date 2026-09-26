import * as THREE from "three";
import "./style.css";
import { createWorld } from "./world";
import { createCar, createPerson, createMarker } from "./models";
import { HUD } from "./hud";
import { GameAudio } from "./audio";
import {
  advanceDriving,
  advanceHeat,
  clamp,
  distance,
  hasLineOfSight,
  isBlocked,
  moveWithCollisions,
  parseSave,
  wrapAngle,
} from "./mechanics";
import type { DrivingState, HeatState, Point } from "./mechanics";

interface Car {
  mesh: THREE.Group;
  state: DrivingState;
  name: string;
  color: number;
  traffic: boolean;
  police: boolean;
  axis: "x" | "z";
  direction: number;
  lane: number;
  cruise: number;
  stolen: boolean;
  collisionCooldown: number;
  waypoint?: Point;
}

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch {
  document.body.innerHTML =
    '<main style="padding:12vh 10vw;font:20px system-ui;background:#f7f4ea;min-height:100vh;color:#202d35"><h1>Vice District</h1><p>This city needs WebGL. Enable hardware acceleration in your browser, then reload to play.</p></main>';
  throw new Error("WebGL is unavailable");
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#70b8bb");
scene.fog = new THREE.Fog("#91bfc0", 190, 410);
scene.add(new THREE.HemisphereLight("#fff4dd", "#6d9197", 2.8));
const sun = new THREE.DirectionalLight("#ffdeb8", 3.2);
sun.position.set(-85, 130, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -170,
  right: 170,
  top: 170,
  bottom: -170,
  near: 0.5,
  far: 350,
});
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.07;
scene.add(sun);
const world = createWorld(scene);
const camera = new THREE.OrthographicCamera(-70, 70, 50, -50, 0.1, 650);
const cameraTarget = world.spawn.clone();
const cameraOffset = new THREE.Vector3(58, 88, 74);

let saved = parseSave(null);
try {
  saved = parseSave(localStorage.getItem("vice-district-save-v1"));
} catch {
  /* Storage may be unavailable in private browser sessions. */
}
let cash = saved.cash;
let missionCount = saved.missionCount;
let missionStep = 0;
let health = 100;
let started = false;
let paused = true;
let gameTime = 0;
let damageCooldown = 0;
let arrestTimer = 0;
let toastCooldown = 0;
let hudTimer = 0;
let activeCar: Car | null = null;
let markerTarget = world.missionPickup.clone();
let deliveryTarget = world.garage.clone();
let routeName = "Sunset Customs";
let pendingReward = 1500;
const heat: HeatState = { wanted: 0, hiddenFor: 0, grace: 0 };
const audio = new GameAudio();
const pressed = new Set<string>();
const player = createPerson(0xf16d45);
player.position.copy(world.spawn);
scene.add(player);
const marker = createMarker(0xffae48);
scene.add(marker);
const garageMarker = createMarker(0x62dfbd);
garageMarker.position.copy(world.garage);
scene.add(garageMarker);
const playerRing = new THREE.Mesh(
  new THREE.RingGeometry(1.05, 1.2, 32),
  new THREE.MeshBasicMaterial({
    color: 0xffe8b0,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  }),
);
playerRing.rotation.x = -Math.PI / 2;
scene.add(playerRing);

const cars: Car[] = [];
const policePool: Car[] = [];
const pedestrians: {
  mesh: THREE.Group;
  origin: Point;
  axis: "x" | "z";
  phase: number;
}[] = [];
const carColors = [
  0xf47850, 0x61c8c7, 0xf3d277, 0xe9ece0, 0x456576, 0xb797bb, 0x88a986,
];
const carNames = [
  "Comet GT",
  "Seabreeze",
  "Sunrunner",
  "Patriot Coupe",
  "Nightjar",
  "Boulevard",
  "Palmetto",
];
let seed = 1986;
function random(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

function addCar(
  x: number,
  z: number,
  colorIndex: number,
  traffic = false,
  axis: "x" | "z" = "z",
  direction = 1,
  police = false,
): Car {
  const mesh = createCar(carColors[colorIndex % carColors.length], police);
  mesh.position.set(x, 0.1, z);
  const angle =
    axis === "x" ? (direction * Math.PI) / 2 : direction === 1 ? 0 : Math.PI;
  mesh.rotation.y = angle;
  scene.add(mesh);
  const car: Car = {
    mesh,
    state: { speed: 0, angle },
    name: police ? "VCPD Interceptor" : carNames[colorIndex % carNames.length],
    color: carColors[colorIndex % carColors.length],
    traffic,
    police,
    axis,
    direction,
    lane: axis === "x" ? z : x,
    cruise: 8 + random() * 6,
    stolen: false,
    collisionCooldown: 0,
  };
  cars.push(car);
  return car;
}

const starterCar = addCar(3.5, 9, 0);
markerTarget.copy(starterCar.mesh.position);
addCar(52.5, 27, 1);
addCar(-43.5, -69, 2);
addCar(91.5, -22, 5);
addCar(-100.5, 25, 3);
addCar(44, 82, 6);
for (let i = 0; i < 24; i++) {
  const axis = i % 2 ? "x" : "z";
  const direction = i % 4 < 2 ? 1 : -1;
  const road = [-96, -48, 0, 48, 96][Math.floor(random() * 5)];
  const along = (random() - 0.5) * 225;
  const lane = road + direction * (axis === "z" ? -3.3 : 3.3);
  if (Math.abs(road) < 1 && Math.abs(along) < 21) continue;
  addCar(
    axis === "x" ? along : lane,
    axis === "z" ? along : lane,
    i % 7,
    true,
    axis,
    direction,
  );
}
for (let i = 0; i < 32; i++) {
  const axis = i % 2 ? "x" : "z";
  const road = [-96, -48, 0, 48, 96][Math.floor(random() * 5)];
  const along = Math.floor(random() * 4) * 48 - 77;
  const lane = road + (i % 4 < 2 ? 9.3 : -9.3);
  const origin = {
    x: axis === "x" ? along : lane,
    z: axis === "z" ? along : lane,
  };
  if (isBlocked(origin, 0.5, world.obstacles, world.bounds)) continue;
  const mesh = createPerson([0xffd17a, 0x2d7880, 0xc95b52, 0xf7efda][i % 4]);
  mesh.position.set(origin.x, 0.1, origin.z);
  scene.add(mesh);
  pedestrians.push({ mesh, origin, axis, phase: random() * 6.28 });
}

const hud = new HUD({
  start() {
    started = true;
    paused = false;
    pressed.clear();
    hud.toast("Welcome to Vice District. Walk to the orange car and press E.");
    updateHud();
  },
  togglePause,
  toggleSound: () => audio.toggle(),
  interact,
  reset: () => recover(false),
});

function position(): THREE.Vector3 {
  return activeCar ? activeCar.mesh.position : player.position;
}
function save(): void {
  try {
    localStorage.setItem(
      "vice-district-save-v1",
      JSON.stringify({ cash, missionCount }),
    );
  } catch {
    /* The game remains playable without storage. */
  }
}
function togglePause(): void {
  if (!started) return;
  paused = !paused;
  pressed.clear();
  audio.update(0, false, true);
  updateHud();
}
function addHeat(amount = 1): void {
  heat.wanted = clamp(heat.wanted + amount, 0, 5);
  heat.hiddenFor = 0;
  heat.grace = 3;
}

function interact(): void {
  if (!started || paused) return;
  if (activeCar) {
    if (Math.abs(activeCar.state.speed) > 5) {
      hud.toast("Slow down before leaving the car.");
      return;
    }
    const angle = activeCar.state.angle;
    const exits = [1, -1, 2, -2].map((side) => ({
      x: activeCar!.mesh.position.x + Math.cos(angle) * side * 2.4,
      z: activeCar!.mesh.position.z - Math.sin(angle) * side * 2.4,
    }));
    const exit = exits.find(
      (p) => !isBlocked(p, 0.5, world.obstacles, world.bounds),
    );
    if (!exit) {
      hud.toast("The doors are blocked. Move the car into the street.");
      return;
    }
    player.position.set(exit.x, 0.1, exit.z);
    player.visible = true;
    activeCar.state.speed = 0;
    activeCar = null;
    hud.toast("On foot. Find another ride, or explore the city.");
  } else {
    const nearest = cars
      .filter(
        (c) => !c.police && distance(c.mesh.position, player.position) < 6.2,
      )
      .sort(
        (a, b) =>
          distance(a.mesh.position, player.position) -
          distance(b.mesh.position, player.position),
      )[0];
    if (!nearest) {
      hud.toast("Get closer to a car to take the wheel.");
      return;
    }
    activeCar = nearest;
    activeCar.traffic = false;
    player.visible = false;
    if (!nearest.stolen) {
      nearest.stolen = true;
      addHeat();
      hud.toast("Vehicle acquired. Police are looking for you!", "danger");
    } else hud.toast(`Back in your ${nearest.name}.`);
    if (missionStep === 0) {
      missionStep = 1;
      markerTarget.copy(deliveryTarget);
    }
  }
  updateHud();
}

function recover(busted: boolean): void {
  if (!started) return;
  const fine = busted ? 500 : 250;
  cash = Math.max(0, cash - fine);
  heat.wanted = 0;
  heat.hiddenFor = 0;
  heat.grace = 0;
  health = 100;
  arrestTimer = 0;
  for (const car of cars.filter((c) => c.police)) removeCar(car);
  if (activeCar) {
    activeCar.mesh.position
      .copy(world.garage)
      .add(new THREE.Vector3(3.5, 0.1, 18));
    activeCar.state.speed = 0;
    activeCar.state.angle = 0;
    activeCar.mesh.rotation.y = 0;
    activeCar.stolen = false;
    player.position
      .copy(activeCar.mesh.position)
      .add(new THREE.Vector3(2.5, 0, 0));
    activeCar = null;
  } else player.position.copy(world.spawn);
  player.visible = true;
  missionStep = 0;
  cameraTarget.copy(position());
  pressed.clear();
  save();
  hud.showResult(
    busted ? "Busted." : "Back on the road.",
    `$${fine} ${busted ? "fine" : "recovery fee"} paid. The heat is gone. Take a car to restart your interrupted job.`,
  );
  audio.chime(false);
  updateHud();
}

function removeCar(car: Car): void {
  scene.remove(car.mesh);
  cars.splice(cars.indexOf(car), 1);
  if (car.police) policePool.push(car);
}

function spawnPolice(): void {
  const p = position();
  const roadX = world.roadXs.reduce((a, b) =>
    Math.abs(a - p.x) < Math.abs(b - p.x) ? a : b,
  );
  let z = clamp(p.z + (p.z < 55 ? 56 : -56), -108, 108);
  if (Math.abs(z - p.z) < 30) z = -z;
  let cop = policePool.pop();
  if (cop) {
    cop.mesh.position.set(roadX - 3, 0.1, z);
    cop.mesh.visible = true;
    cop.state = { speed: 0, angle: Math.PI };
    cop.mesh.rotation.y = Math.PI;
    cop.waypoint = undefined;
    cop.collisionCooldown = 0;
    cars.push(cop);
    scene.add(cop.mesh);
  } else cop = addCar(roadX - 3, z, 4, false, "z", -1, true);
  cop.cruise = 16 + heat.wanted * 1.8;
}

function nearestRoad(value: number, roads: number[]): number {
  return roads.reduce((a, b) =>
    Math.abs(a - value) < Math.abs(b - value) ? a : b,
  );
}
function policeWaypoint(car: Car): Point {
  const p = car.mesh.position,
    target = position();
  if (distance(p, target) < 35 && hasLineOfSight(p, target, world.obstacles))
    return target;
  if (car.waypoint && distance(p, car.waypoint) > 3.5) return car.waypoint;
  const x = nearestRoad(p.x, world.roadXs),
    z = nearestRoad(p.z, world.roadZs);
  if (distance(p, { x, z }) > 7) return (car.waypoint = { x, z });
  const options: Point[] = [
    { x: x + 48, z },
    { x: x - 48, z },
    { x, z: z + 48 },
    { x, z: z - 48 },
  ].filter((q) => Math.abs(q.x) <= 96 && Math.abs(q.z) <= 96);
  options.sort((a, b) => distance(a, target) - distance(b, target));
  return (car.waypoint = options[0] ?? { x, z });
}

function updatePolice(dt: number): void {
  let police = cars.filter((c) => c.police);
  if (heat.wanted > 0 && police.length < Math.min(heat.wanted + 1, 5)) {
    spawnPolice();
    police = cars.filter((c) => c.police);
  }
  if (heat.wanted === 0) {
    for (const car of police) {
      car.mesh.visible = false;
      removeCar(car);
    }
    return;
  }
  let seen = false;
  let touching = false;
  for (const car of police) {
    const p = car.mesh.position;
    const d = distance(p, position());
    if (d < 43 && hasLineOfSight(p, position(), world.obstacles)) seen = true;
    const target = policeWaypoint(car);
    const desired = Math.atan2(target.x - p.x, target.z - p.z);
    car.state.angle += clamp(
      wrapAngle(desired - car.state.angle),
      -2.5 * dt,
      2.5 * dt,
    );
    const alignment = Math.max(
      0.18,
      Math.cos(wrapAngle(desired - car.state.angle)),
    );
    car.state.speed =
      Math.min(22, 15 + heat.wanted * 1.3) * alignment * (d < 4 ? 0.3 : 1);
    const hit = moveWithCollisions(
      p,
      Math.sin(car.state.angle) * car.state.speed * dt,
      Math.cos(car.state.angle) * car.state.speed * dt,
      1.45,
      world.obstacles,
      world.bounds,
    );
    if (hit) {
      car.waypoint = undefined;
      car.state.angle += dt * 2;
    }
    car.mesh.rotation.y = car.state.angle;
    for (const name of ["police-red", "police-blue"]) {
      const lamp = car.mesh.getObjectByName(name) as THREE.Mesh | undefined;
      if (lamp)
        lamp.visible =
          Math.sin(gameTime * 15 + (name === "police-red" ? 0 : Math.PI)) >
          -0.2;
    }
    if (d < (activeCar ? 3.8 : 2.6)) {
      touching = true;
      if (activeCar && Math.abs(activeCar.state.speed) > 10 && damage(9))
        return;
    }
    if (d > 165) {
      car.mesh.position.set(
        nearestRoad(position().x, world.roadXs),
        0.1,
        clamp(position().z - 62, -108, 108),
      );
      car.waypoint = undefined;
    }
  }
  if (touching && (!activeCar || Math.abs(activeCar.state.speed) < 5))
    arrestTimer += dt;
  else arrestTimer = Math.max(0, arrestTimer - dt * 2);
  if (arrestTimer > 2.8) {
    recover(true);
    return;
  }
  if (advanceHeat(heat, seen, dt) && heat.wanted === 0) {
    hud.toast("You lost the heat. The streets are yours again.", "success");
    audio.chime();
  }
}

function damage(amount: number): boolean {
  if (damageCooldown > 0) return false;
  health = Math.max(0, health - amount);
  damageCooldown = 0.7;
  canvas.classList.remove("impact");
  void canvas.offsetWidth;
  canvas.classList.add("impact");
  if (health === 0) {
    recover(true);
    return true;
  }
  return false;
}

function updatePlayer(dt: number): void {
  const forward =
    Number(pressed.has("w") || pressed.has("arrowup")) -
    Number(pressed.has("s") || pressed.has("arrowdown"));
  const turn =
    Number(pressed.has("a") || pressed.has("arrowleft")) -
    Number(pressed.has("d") || pressed.has("arrowright"));
  if (activeCar) {
    const car = activeCar;
    advanceDriving(
      car.state,
      forward,
      turn,
      pressed.has(" "),
      pressed.has("shift"),
      dt,
    );
    const oldSpeed = car.state.speed;
    const hit = moveWithCollisions(
      car.mesh.position,
      Math.sin(car.state.angle) * car.state.speed * dt,
      Math.cos(car.state.angle) * car.state.speed * dt,
      1.6,
      world.obstacles,
      world.bounds,
    );
    if (hit) {
      car.state.speed *= -0.24;
      if (Math.abs(oldSpeed) > 12 && damage(Math.abs(oldSpeed) * 0.42)) return;
    }
    car.mesh.rotation.y = car.state.angle;
    for (const other of cars) {
      if (
        other === car ||
        other.police ||
        distance(other.mesh.position, car.mesh.position) > 3.5 ||
        other.collisionCooldown > 0
      )
        continue;
      if (Math.abs(car.state.speed) > 7) {
        if (damage(Math.abs(car.state.speed) * 0.35)) return;
        car.state.speed *= -0.3;
        other.collisionCooldown = 2;
        other.traffic = false;
        addHeat();
        if (toastCooldown <= 0) {
          hud.toast("Hit and run reported. Wanted level increased.", "danger");
          toastCooldown = 5;
        }
      }
    }
    player.position.copy(car.mesh.position);
  } else {
    // Walking is camera-relative, so W always moves toward the top of the screen.
    const dx = -forward * 0.617 - turn * 0.787;
    const dz = -forward * 0.787 + turn * 0.617;
    const length = Math.hypot(dx, dz);
    const speed = pressed.has("shift") ? 11 : 6.5;
    if (length) {
      moveWithCollisions(
        player.position,
        (dx / length) * speed * dt,
        (dz / length) * speed * dt,
        0.48,
        world.obstacles,
        world.bounds,
      );
      player.rotation.y = Math.atan2(dx, dz);
    }
    animatePerson(
      player,
      length ? gameTime * (pressed.has("shift") ? 16 : 11) : 0,
      length ? 0.55 : 0,
    );
  }
  playerRing.visible = !activeCar;
  playerRing.position.set(player.position.x, 0.22, player.position.z);
}

function animatePerson(
  mesh: THREE.Group,
  phase: number,
  magnitude: number,
): void {
  for (const [name, sign] of [
    ["leg-left", 1],
    ["leg-right", -1],
    ["arm-left", -1],
    ["arm-right", 1],
  ] as const) {
    const limb = mesh.getObjectByName(name);
    if (limb) limb.rotation.x = Math.sin(phase) * magnitude * sign;
  }
}

function updateTraffic(dt: number): void {
  for (const car of cars) {
    car.collisionCooldown = Math.max(0, car.collisionCooldown - dt);
    if (!car.traffic || car === activeCar || car.police) continue;
    const p = car.mesh.position;
    const ahead = {
      x: p.x + (car.axis === "x" ? car.direction * 7 : 0),
      z: p.z + (car.axis === "z" ? car.direction * 7 : 0),
    };
    const blocked =
      cars.some(
        (other) => other !== car && distance(other.mesh.position, ahead) < 4,
      ) ||
      (!activeCar && distance(player.position, ahead) < 3);
    if (!blocked) p[car.axis] += car.cruise * car.direction * dt;
    if (p[car.axis] > 119) p[car.axis] = -119;
    if (p[car.axis] < -119) p[car.axis] = 119;
  }
  for (const ped of pedestrians) {
    const stride = Math.sin(gameTime * 0.25 + ped.phase) * 9;
    const next = { ...ped.origin, [ped.axis]: ped.origin[ped.axis] + stride };
    if (!isBlocked(next, 0.45, world.obstacles, world.bounds)) {
      ped.mesh.position.set(next.x, 0.1, next.z);
      const dir = Math.cos(gameTime * 0.25 + ped.phase) > 0 ? 1 : -1;
      ped.mesh.rotation.y =
        ped.axis === "x" ? (dir * Math.PI) / 2 : dir > 0 ? 0 : Math.PI;
      animatePerson(ped.mesh, gameTime * 7 + ped.phase, 0.3);
    }
    if (activeCar && distance(ped.mesh.position, activeCar.mesh.position) < 4) {
      // Citizens step away from the roadway; there is no gore or pedestrian combat.
      ped.mesh.position.x +=
        (ped.mesh.position.x > activeCar.mesh.position.x ? 1 : -1) * 3 * dt;
    }
  }
}

function updateMission(): void {
  if (missionStep === 0) {
    const nearest = cars
      .filter((c) => !c.police)
      .sort(
        (a, b) =>
          distance(a.mesh.position, player.position) -
          distance(b.mesh.position, player.position),
      )[0];
    if (nearest) markerTarget.copy(nearest.mesh.position);
  }
  if (missionStep === 1 && heat.wanted === 0) {
    missionStep = 2;
    hud.toast(`All clear. Bring your ride to ${routeName}.`);
  }
  if (missionStep === 2 && heat.wanted > 0) missionStep = 1;
  if (
    missionStep === 2 &&
    activeCar &&
    distance(position(), deliveryTarget) < 9 &&
    Math.abs(activeCar.state.speed) < 4
  ) {
    cash += pendingReward;
    missionCount++;
    health = 100;
    hud.showResult(
      "Job complete.",
      `$${pendingReward.toLocaleString()} earned. Your next delivery is marked on the map.`,
    );
    audio.chime();
    save();
    const destinations = [
      { x: 96, z: 73, name: "Ocean Drive" },
      { x: -96, z: 26, name: "Marina Bay" },
      { x: 48, z: -78, name: "Northside" },
      { x: 0, z: 91, name: "Palm Promenade" },
      { x: -48, z: -79, name: "Sunset Customs" },
    ];
    const next = destinations[(missionCount - 1) % destinations.length];
    deliveryTarget.set(next.x, 0, next.z);
    markerTarget.copy(deliveryTarget);
    routeName = next.name;
    pendingReward = Math.min(3000, 750 + missionCount * 250);
    missionStep = 2;
  }
  marker.position.copy(markerTarget);
  marker.position.y = Math.sin(gameTime * 2.6) * 0.35;
  marker.rotation.y = gameTime * 0.65;
  garageMarker.visible = missionStep === 0;
  garageMarker.rotation.y = -gameTime * 0.4;
}

function district(): string {
  const p = position();
  if (p.x < -66) return "MARINA BAY";
  if (p.x > 65) return "OCEAN DRIVE";
  if (p.z < -47) return "NORTHSIDE";
  if (p.z > 53) return "PALM PROMENADE";
  return "DOWNTOWN";
}
function updateHud(): void {
  const seenText =
    heat.hiddenFor > 0
      ? `Stay out of sight · ${Math.ceil(8 - heat.hiddenFor)}s until the heat drops.`
      : "Outrun the patrols and hide behind buildings.";
  let text =
    missionStep === 0
      ? "Find a ride. Walk to a nearby car and press E to take the wheel."
      : missionStep === 1
        ? seenText
        : `Drive to ${routeName} and stop inside the golden marker. Reward: $${pendingReward.toLocaleString()}.`;
  if (arrestTimer > 0.5)
    text = "Police are closing in. Move now to avoid being busted!";
  hud.update({
    cash,
    wanted: heat.wanted,
    speed: activeCar ? Math.abs(activeCar.state.speed) * 3.6 : 0,
    vehicle: activeCar?.name ?? "ON FOOT",
    health,
    missionTitle:
      missionStep === 0
        ? "Borrowed wheels"
        : missionStep === 1
          ? "Lose the heat"
          : missionCount
            ? "Special delivery"
            : "Make the drop",
    missionText: text,
    missionStep,
    district: district(),
    onFoot: !activeCar,
    paused,
    missionCount,
    reward: pendingReward,
  });
}

const map = document.querySelector<HTMLCanvasElement>("#minimap")!;
const mapCtx = map.getContext("2d")!;
const mapSize = 256;
map.width = map.height = mapSize * 2;
const mapBackground = document.createElement("canvas");
mapBackground.width = mapBackground.height = mapSize * 2;
const mapBg = mapBackground.getContext("2d")!;
const toMap = (value: number) => ((value + 139) / 278) * mapSize;
function buildMap(): void {
  const c = mapBg;
  c.scale(2, 2);
  c.fillStyle = "#77b7b9";
  c.fillRect(0, 0, 256, 256);
  c.fillStyle = "#ced4c2";
  c.fillRect(toMap(-125), toMap(-125), (250 / 278) * 256, (250 / 278) * 256);
  c.strokeStyle = "#f2eee0";
  c.lineWidth = 11;
  for (const r of world.roadXs) {
    c.beginPath();
    c.moveTo(toMap(r), toMap(-124));
    c.lineTo(toMap(r), toMap(124));
    c.stroke();
  }
  for (const r of world.roadZs) {
    c.beginPath();
    c.moveTo(toMap(-124), toMap(r));
    c.lineTo(toMap(124), toMap(r));
    c.stroke();
  }
  c.fillStyle = "#a6b3a5";
  for (const o of world.obstacles)
    c.fillRect(
      toMap(o.minX),
      toMap(o.minZ),
      ((o.maxX - o.minX) / 278) * 256,
      ((o.maxZ - o.minZ) / 278) * 256,
    );
}
buildMap();
function drawMap(): void {
  const c = mapCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(mapBackground, 0, 0);
  c.scale(2, 2);
  const p = position();
  if (missionStep > 0) {
    c.beginPath();
    c.strokeStyle = "#ee8752";
    c.lineWidth = 2.4;
    c.setLineDash([3, 3]);
    c.moveTo(toMap(p.x), toMap(p.z));
    const roadX = nearestRoad(p.x, world.roadXs),
      roadZ = nearestRoad(markerTarget.z, world.roadZs);
    c.lineTo(toMap(roadX), toMap(p.z));
    c.lineTo(toMap(roadX), toMap(roadZ));
    c.lineTo(toMap(markerTarget.x), toMap(roadZ));
    c.lineTo(toMap(markerTarget.x), toMap(markerTarget.z));
    c.stroke();
    c.setLineDash([]);
  }
  c.fillStyle = "#e78343";
  c.beginPath();
  c.arc(toMap(markerTarget.x), toMap(markerTarget.z), 5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#fff5d5";
  c.lineWidth = 2;
  c.stroke();
  for (const car of cars.filter((car) => car.police)) {
    c.fillStyle = Math.sin(gameTime * 8) > 0 ? "#e45b5b" : "#588dcb";
    c.beginPath();
    c.arc(
      toMap(car.mesh.position.x),
      toMap(car.mesh.position.z),
      3.5,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  c.save();
  c.translate(toMap(p.x), toMap(p.z));
  c.rotate(-(activeCar?.state.angle ?? player.rotation.y));
  c.shadowColor = "#273b3f";
  c.shadowBlur = 3;
  c.fillStyle = "#253d43";
  c.strokeStyle = "#fff9e9";
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(0, 7);
  c.lineTo(-5, -5);
  c.lineTo(0, -2);
  c.lineTo(5, -5);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}

const validKeys = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  " ",
  "shift",
  "e",
  "r",
  "escape",
  "p",
]);
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.matches("input,textarea,select")) return;
  const key = e.key.toLowerCase();
  if (!validKeys.has(key)) return;
  if (key === " " && (e.target as HTMLElement)?.closest("button")) return;
  e.preventDefault();
  if (e.repeat && ["e", "r", "escape", "p"].includes(key)) return;
  if (key === "escape" || key === "p") togglePause();
  else if (key === "e") interact();
  else if (key === "r" && started && !paused) recover(false);
  else if (!paused) pressed.add(key);
});
window.addEventListener("keyup", (e) => pressed.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  pressed.clear();
  if (started && !paused) togglePause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && started && !paused) togglePause();
});
for (const button of document.querySelectorAll<HTMLElement>("[data-control]")) {
  const key =
    button.dataset.control === "space" ? " " : button.dataset.control!;
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!paused) pressed.add(key);
    button.setPointerCapture(e.pointerId);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, () => pressed.delete(key));
}

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  const height = window.innerWidth < 700 ? 110 : 100;
  camera.left = (-height * aspect) / 2;
  camera.right = (height * aspect) / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
updateHud();
updateMission();
let previous = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - previous) / 1000, 0.04);
  previous = now;
  if (!paused) {
    gameTime += dt;
    damageCooldown = Math.max(0, damageCooldown - dt);
    toastCooldown = Math.max(0, toastCooldown - dt);
    updatePlayer(dt);
    if (!paused) {
      updateTraffic(dt);
      updatePolice(dt);
    }
    if (!paused) updateMission();
  } else if (!started) {
    gameTime += dt;
    marker.rotation.y = gameTime * 0.65;
    marker.position.y = Math.sin(gameTime * 2.6) * 0.35;
  }
  const p = position();
  const look = new THREE.Vector3(p.x, p.y, p.z);
  if (activeCar)
    look.add(
      new THREE.Vector3(
        Math.sin(activeCar.state.angle),
        0,
        Math.cos(activeCar.state.angle),
      ).multiplyScalar(activeCar.state.speed * 0.2),
    );
  cameraTarget.lerp(look, 1 - Math.exp(-dt * 3));
  camera.position.copy(cameraTarget).add(cameraOffset);
  camera.lookAt(cameraTarget);
  audio.update(activeCar?.state.speed ?? 0, !!activeCar, paused);
  hudTimer += dt;
  if (hudTimer > 0.09) {
    updateHud();
    drawMap();
    hudTimer = 0;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The development server can expose deterministic controls for browser integration tests.
// This branch is removed from production builds by Vite.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("test")) {
  Object.assign(window, {
    __vice: {
      snapshot: () => ({
        started,
        paused,
        cash,
        missionCount,
        missionStep,
        health,
        wanted: heat.wanted,
        onFoot: !activeCar,
        x: position().x,
        z: position().z,
        speed: activeCar?.state.speed ?? 0,
        drawCalls: renderer.info.render.calls,
      }),
      teleport: (x: number, z: number) => {
        position().set(x, 0.1, z);
        if (activeCar) activeCar.state.speed = 0;
      },
      clearHeat: () => {
        heat.wanted = 0;
      },
      setHealth: (value: number) => {
        health = value;
      },
      destination: () => ({ x: deliveryTarget.x, z: deliveryTarget.z }),
    },
  });
}
