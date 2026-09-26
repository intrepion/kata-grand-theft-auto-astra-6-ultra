import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const tireGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.29, 12);
const rimGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.018, 8);
const hubGeometry = new THREE.CylinderGeometry(0.11, 0.11, 0.024, 6);
const rubber = material(0x172331, 0.94);
const glass = material(0x183a51, 0.28, 0.2);
const darkTrim = material(0x22313b, 0.78);
const chrome = material(0xd1ded9, 0.3, 0.48);
const cream = material(0xf3e9d0, 0.6);
const skin = material(0xd59a73, 0.84);
const hair = material(0x292d35, 0.96);
const trousers = material(0x263e54, 0.93);
const shoes = material(0xf4e9d8, 0.87);
const badgeMaterial = material(0xe6be59);
const characterMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.84,
  metalness: 0.04,
  flatShading: true,
});
const headlights = new THREE.MeshStandardMaterial({
  color: 0xfff3bb,
  emissive: 0xffd889,
  emissiveIntensity: 0.7,
  roughness: 0.38,
});
const taillights = new THREE.MeshStandardMaterial({
  color: 0xfb544d,
  emissive: 0xf22c2c,
  emissiveIntensity: 0.6,
  roughness: 0.4,
});
const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x172a33,
  transparent: true,
  opacity: 0.17,
  depthWrite: false,
});

function material(color: number, roughness = 0.62, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(...position);
  object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(
  parent: THREE.Object3D,
  mat: THREE.Material,
  position: [number, number, number],
  size: [number, number, number],
) {
  return mesh(parent, boxGeometry, mat, position, size);
}

type Section = { z: number; width: number; bottom: number; top: number };

function loft(sections: Section[]) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const section of sections) {
    const { z, width: w, bottom: b, top: t } = section;
    positions.push(-w, b, z, w, b, z, w, t, z, -w, t, z);
  }
  indices.push(0, 3, 2, 0, 2, 1);
  for (let i = 0; i < sections.length - 1; i++) {
    const start = i * 4;
    for (let edge = 0; edge < 4; edge++) {
      const a = start + edge;
      const b = start + ((edge + 1) % 4);
      const c = b + 4;
      const d = a + 4;
      indices.push(a, b, c, a, c, d);
    }
  }
  const last = (sections.length - 1) * 4;
  indices.push(last, last + 1, last + 2, last, last + 2, last + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function barBetween(
  parent: THREE.Object3D,
  mat: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  width: number,
) {
  const center = a.clone().add(b).multiplyScalar(0.5);
  const bar = box(
    parent,
    mat,
    [center.x, center.y, center.z],
    [width, a.distanceTo(b), width],
  );
  bar.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  return bar;
}

function groundShadow(parent: THREE.Object3D, x: number, z: number) {
  const shadow = mesh(
    parent,
    new THREE.CircleGeometry(1, 24),
    shadowMaterial,
    [0, 0.015, 0],
    [x, z, 1],
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  return shadow;
}

/** Bake static local transforms while retaining independent animation pivots. */
function mergeStaticParts(
  parent: THREE.Group,
  colorMaterial?: THREE.MeshStandardMaterial,
) {
  const batches = new Map<
    string,
    {
      material: THREE.Material;
      sources: THREE.Mesh[];
      geometries: THREE.BufferGeometry[];
      castShadow: boolean;
      receiveShadow: boolean;
    }
  >();
  for (const child of [...parent.children]) {
    if (child instanceof THREE.Group) {
      mergeStaticParts(child, colorMaterial);
      continue;
    }
    if (
      !(child instanceof THREE.Mesh) ||
      Array.isArray(child.material) ||
      child.name.startsWith("police-")
    )
      continue;
    const sourceMaterial = child.material;
    const useVertexColors =
      colorMaterial &&
      sourceMaterial instanceof THREE.MeshStandardMaterial &&
      !sourceMaterial.transparent;
    const targetMaterial = useVertexColors ? colorMaterial : sourceMaterial;
    const key = `${targetMaterial.uuid}:${child.castShadow}:${child.receiveShadow}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = {
        material: targetMaterial,
        sources: [],
        geometries: [],
        castShadow: child.castShadow,
        receiveShadow: child.receiveShadow,
      };
      batches.set(key, batch);
    }
    child.updateMatrix();
    const geometry = child.geometry.clone();
    geometry.deleteAttribute("uv");
    geometry.clearGroups();
    geometry.applyMatrix4(child.matrix);
    if (useVertexColors) {
      const color = sourceMaterial.color;
      const colors = new Float32Array(
        geometry.getAttribute("position").count * 3,
      );
      for (let offset = 0; offset < colors.length; offset += 3) {
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    batch.sources.push(child);
    batch.geometries.push(geometry);
  }
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometries, false);
    if (!geometry) throw new Error("Unable to merge model geometry.");
    for (const source of batch.sources) parent.remove(source);
    for (const sourceGeometry of batch.geometries) sourceGeometry.dispose();
    const merged = mesh(parent, geometry, batch.material);
    merged.castShadow = batch.castShadow;
    merged.receiveShadow = batch.receiveShadow;
  }
}

/** A compact coupe, facing +Z. Its origin rests on the road surface. */
export function createCar(color: number, police = false): THREE.Group {
  const car = new THREE.Group();
  const paint = material(police ? 0x21303c : color, 0.4, 0.16);
  const upperPaint = police ? cream : paint;
  groundShadow(car, 1.33, 2.51);

  mesh(
    car,
    loft([
      { z: -2.4, width: 1.01, bottom: 0.5, top: 0.98 },
      { z: -1.93, width: 1.14, bottom: 0.48, top: 1.13 },
      { z: 1.64, width: 1.14, bottom: 0.48, top: 1.13 },
      { z: 2.4, width: 1.02, bottom: 0.57, top: 0.97 },
    ]),
    paint,
  );
  box(car, darkTrim, [0, 0.48, 0], [1.9, 0.13, 4.35]);

  // The sloped glazing is a separate volume with painted pillars and roof.
  mesh(
    car,
    loft([
      { z: -1.38, width: 0.92, bottom: 1.09, top: 1.11 },
      { z: -0.75, width: 0.8, bottom: 1.09, top: 1.7 },
      { z: 0.56, width: 0.8, bottom: 1.09, top: 1.7 },
      { z: 1.13, width: 0.94, bottom: 1.09, top: 1.12 },
    ]),
    glass,
  );
  box(car, upperPaint, [0, 1.735, -0.1], [1.68, 0.105, 1.4]);
  box(car, upperPaint, [0, 1.145, -1.7], [1.94, 0.065, 0.49]);
  box(car, paint, [0, 1.14, 1.59], [1.95, 0.045, 0.8]);

  for (const side of [-1, 1]) {
    barBetween(
      car,
      upperPaint,
      new THREE.Vector3(side * 0.8, 1.71, 0.57),
      new THREE.Vector3(side * 0.955, 1.1, 1.15),
      0.07,
    );
    barBetween(
      car,
      upperPaint,
      new THREE.Vector3(side * 0.8, 1.7, -0.74),
      new THREE.Vector3(side * 0.935, 1.1, -1.39),
      0.1,
    );
    box(car, upperPaint, [side * 0.813, 1.4, -0.34], [0.045, 0.61, 0.085]);
    box(car, upperPaint, [side * 1.147, 0.94, -0.17], [0.025, 0.32, 1.55]);
    box(car, chrome, [side * 1.169, 1.015, -0.56], [0.045, 0.048, 0.23]);
    box(car, darkTrim, [side * 1.153, 0.67, -0.02], [0.026, 0.075, 3.8]);
    box(car, paint, [side * 1.07, 1.19, 0.76], [0.31, 0.16, 0.23]);
    box(car, glass, [side * 1.085, 1.195, 0.639], [0.25, 0.115, 0.015]);

    for (const z of [-1.54, 1.52]) {
      const tire = mesh(car, tireGeometry, rubber, [side * 1.075, 0.46, z]);
      tire.rotation.z = Math.PI / 2;
      const rim = mesh(car, rimGeometry, chrome, [side * 1.226, 0.46, z]);
      rim.rotation.z = Math.PI / 2;
      const hub = mesh(car, hubGeometry, darkTrim, [side * 1.239, 0.46, z]);
      hub.rotation.z = Math.PI / 2;
    }
    box(car, headlights, [side * 0.727, 0.873, 2.403], [0.48, 0.185, 0.025]);
    box(car, taillights, [side * 0.77, 0.867, -2.412], [0.43, 0.16, 0.026]);
  }

  box(car, darkTrim, [0, 0.76, 2.414], [0.7, 0.14, 0.03]);
  box(car, chrome, [0, 0.62, 2.398], [1.89, 0.075, 0.1]);
  box(car, chrome, [0, 0.61, -2.406], [1.9, 0.075, 0.09]);
  box(car, cream, [0, 0.766, -2.428], [0.34, 0.145, 0.017]);
  box(car, darkTrim, [-0.79, 0.475, -2.39], [0.19, 0.1, 0.18]);

  if (police) {
    box(car, darkTrim, [0, 1.842, -0.05], [1.31, 0.08, 0.34]);
    for (const [x, beaconColor, name] of [
      [-0.37, 0xff405a, "police-red"],
      [0.37, 0x42a4ff, "police-blue"],
    ] as const) {
      const beaconMaterial = new THREE.MeshStandardMaterial({
        color: beaconColor,
        emissive: beaconColor,
        emissiveIntensity: 0.8,
        roughness: 0.25,
      });
      const beacon = box(
        car,
        beaconMaterial,
        [x, 1.965, -0.05],
        [0.48, 0.19, 0.29],
      );
      beacon.name = name;
    }
    for (const side of [-1, 1]) {
      const badge = mesh(
        car,
        new THREE.CylinderGeometry(0.13, 0.13, 0.025, 6),
        badgeMaterial,
        [side * 1.17, 0.965, 0.03],
      );
      badge.rotation.z = Math.PI / 2;
    }
  } else {
    // Twin subtle hood vents make the little silhouette read as a sports coupe.
    box(car, darkTrim, [-0.54, 1.167, 1.35], [0.15, 0.012, 0.37]);
    box(car, darkTrim, [0.54, 1.167, 1.35], [0.15, 0.012, 0.37]);
  }
  mergeStaticParts(car);
  return car;
}

/** Limbs have hip/shoulder pivots for a simple procedural walk cycle. */
export function createPerson(color: number): THREE.Group {
  const person = new THREE.Group();
  const jacket = material(color, 0.88);
  groundShadow(person, 0.42, 0.31);

  box(person, jacket, [0, 1.11, 0], [0.49, 0.61, 0.3]);
  box(person, cream, [0, 1.18, 0.154], [0.085, 0.34, 0.015]);
  box(person, darkTrim, [0, 0.84, 0], [0.46, 0.07, 0.3]);
  box(person, skin, [0, 1.48, 0], [0.16, 0.19, 0.17]);
  box(person, skin, [0, 1.665, 0.015], [0.32, 0.34, 0.31]);
  box(person, hair, [0, 1.833, -0.005], [0.35, 0.105, 0.33]);
  box(person, hair, [0, 1.716, -0.139], [0.33, 0.2, 0.055]);
  box(person, darkTrim, [0, 1.699, 0.179], [0.3, 0.065, 0.032]);
  box(person, skin, [0, 1.623, 0.19], [0.075, 0.064, 0.075]);

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "left" : "right";
    const leg = new THREE.Group();
    leg.name = `leg-${suffix}`;
    leg.position.set(side * 0.133, 0.83, 0);
    person.add(leg);
    box(leg, trousers, [0, -0.315, 0], [0.19, 0.64, 0.23]);
    box(leg, shoes, [0, -0.734, 0.055], [0.215, 0.18, 0.36]);

    const arm = new THREE.Group();
    arm.name = `arm-${suffix}`;
    arm.position.set(side * 0.329, 1.347, 0);
    person.add(arm);
    box(arm, jacket, [0, -0.179, 0], [0.165, 0.39, 0.22]);
    box(arm, skin, [0, -0.438, 0.015], [0.145, 0.16, 0.17]);
  }
  mergeStaticParts(person, characterMaterial);
  jacket.dispose();
  return person;
}

/** A destination pin with a quiet footprint and a bright, faceted arrow. */
export function createMarker(color: number): THREE.Group {
  const marker = new THREE.Group();
  const beacon = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.23,
    roughness: 0.45,
    flatShading: true,
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = mesh(
    marker,
    new THREE.RingGeometry(1.35, 1.48, 48),
    ringMaterial,
    [0, 0.032, 0],
  );
  ring.rotation.x = -Math.PI / 2;
  const innerRing = mesh(
    marker,
    new THREE.RingGeometry(0.35, 0.45, 32),
    ringMaterial,
    [0, 0.035, 0],
  );
  innerRing.rotation.x = -Math.PI / 2;
  const arrow = mesh(
    marker,
    new THREE.ConeGeometry(0.6, 0.85, 4),
    beacon,
    [0, 3.65, 0],
  );
  arrow.rotation.z = Math.PI;
  arrow.rotation.y = Math.PI / 4;
  const shaft = box(marker, beacon, [0, 4.21, 0], [0.4, 0.68, 0.4]);
  shaft.rotation.y = Math.PI / 4;
  mergeStaticParts(marker);
  return marker;
}
