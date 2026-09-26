import * as THREE from "three";

export type Obstacle = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export interface CityWorld {
  obstacles: Obstacle[];
  roadXs: number[];
  roadZs: number[];
  bounds: number;
  spawn: THREE.Vector3;
  garage: THREE.Vector3;
  missionPickup: THREE.Vector3;
}

type Part = {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  color: THREE.Color;
};

/** A small, deliberately hand-composed island, with instancing for its street details. */
export function createWorld(scene: THREE.Scene): CityWorld {
  const obstacles: Obstacle[] = [];
  const roads = [-96, -48, 0, 48, 96];
  const batches = new Map<
    string,
    {
      geometry: THREE.BufferGeometry;
      parts: Part[];
      roughness: number;
      metalness: number;
    }
  >();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const cone = new THREE.ConeGeometry(0.5, 1, 5);
  const sphere = new THREE.IcosahedronGeometry(0.5, 1);
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, -0.8, 0.2, 1.8, 0, 0.55, 2.6, 0, 0, 0, 0, 0.55, 2.6, 0.8, 0.2,
        1.8, -0.8, 0.2, 1.8, 0, -0.6, 4.4, 0, 0.55, 2.6, 0, 0.55, 2.6, 0, -0.6,
        4.4, 0.8, 0.2, 1.8,
      ],
      3,
    ),
  );
  leafGeometry.computeVertexNormals();

  function part(
    kind: string,
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string | number,
    ry = 0,
    rz = 0,
  ) {
    if (!batches.has(kind))
      batches.set(kind, { geometry, parts: [], roughness: 0.88, metalness: 0 });
    batches
      .get(kind)!
      .parts.push({
        position: new THREE.Vector3(x, y, z),
        scale: new THREE.Vector3(sx, sy, sz),
        rotation: new THREE.Euler(0, ry, rz),
        color: new THREE.Color(color),
      });
  }
  function cube(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string | number,
    ry = 0,
  ) {
    part("boxes", box, x, y, z, sx, sy, sz, color, ry);
  }
  function cyl(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string | number,
  ) {
    part("cylinders", cylinder, x, y, z, sx, sy, sz, color);
  }
  function solid(x: number, z: number, w: number, d: number) {
    obstacles.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }
  let randomState = 32197;
  function random() {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  // The shallow sea and sand-colored sea wall form a readable edge to the island.
  cube(0, -1.4, 0, 1600, 1, 1600, "#298b9a");
  cube(0, -0.65, 0, 258, 1.1, 258, "#b8d1bd");
  cube(0, -0.3, 0, 252, 0.75, 252, "#decba6");
  cube(0, 0, 0, 244, 0.35, 244, "#465860");
  for (const x of [-124, 124]) {
    cube(x, 0.05, 0, 5.4, 0.4, 251, "#ede0c2");
    cube(x + Math.sign(x) * 2.5, 0.12, 0, 0.5, 0.8, 254, "#d7bda2");
  }
  for (const z of [-124, 124]) {
    cube(0, 0.05, z, 251, 0.4, 5.4, "#ede0c2");
    cube(0, 0.12, z + Math.sign(z) * 2.5, 254, 0.8, 0.5, "#d7bda2");
  }
  // Faint facets keep the water lively without a distracting animated shader.
  for (let i = 0; i < 100; i++) {
    const x = (random() - 0.5) * 650;
    const z = (random() - 0.5) * 650;
    if (Math.abs(x) < 131 && Math.abs(z) < 131) continue;
    cube(x, -0.865, z, 3 + random() * 11, 0.025, 0.18, "#5ea9ad");
  }

  // Every lot has its own raised sidewalk, leaving uninterrupted driving lanes.
  const centers = [-72, -24, 24, 72];
  for (const x of centers)
    for (const z of centers) {
      cube(x, 0.2, z, 34, 0.45, 34, "#eee0ca");
      cube(x, 0.435, z, 31.8, 0.035, 31.8, "#ddcdb8");
      for (let n = -14; n <= 14; n += 4) {
        cube(x + n, 0.46, z - 16.3, 0.035, 0.02, 1.4, "#c7bdaa");
        cube(x + n, 0.46, z + 16.3, 0.035, 0.02, 1.4, "#c7bdaa");
        cube(x - 16.3, 0.46, z + n, 1.4, 0.02, 0.035, "#c7bdaa");
        cube(x + 16.3, 0.46, z + n, 1.4, 0.02, 0.035, "#c7bdaa");
      }
    }
  // Waterfront promenade, outside the last set of streets.
  for (const side of [-1, 1]) {
    cube(side * 114, 0.19, 0, 21, 0.43, 241, "#d8cdb7");
    cube(0, 0.19, side * 114, 207, 0.43, 21, "#d8cdb7");
    cube(side * 121, 0.425, 0, 1.1, 0.03, 241, "#b2c0ac");
    cube(0, 0.425, side * 121, 241, 0.03, 1.1, "#b2c0ac");
  }

  // Dashes stop before junctions, making the crosswalks and road geometry clear.
  for (const road of roads) {
    for (let p = -119; p <= 119; p += 6) {
      if (roads.some((intersection) => Math.abs(p - intersection) < 10))
        continue;
      for (const offset of [-0.24, 0.24]) {
        cube(road + offset, 0.19, p, 0.11, 0.035, 2.7, "#e5bc65");
        cube(p, 0.19, road + offset, 2.7, 0.035, 0.11, "#e5bc65");
      }
    }
    for (const crossing of roads) {
      for (let stripe = -5.3; stripe < 6; stripe += 1.75)
        for (const direction of [-1, 1]) {
          cube(
            road + stripe,
            0.195,
            crossing + direction * 9.2,
            0.83,
            0.035,
            2.1,
            "#dddace",
          );
          cube(
            road + direction * 9.2,
            0.195,
            crossing + stripe,
            2.1,
            0.035,
            0.83,
            "#dddace",
          );
        }
    }
  }

  function palm(x: number, z: number, height = 6.8) {
    part(
      "trunks",
      cylinder,
      x,
      height / 2 + 0.5,
      z,
      0.43,
      height,
      0.43,
      "#a88466",
      0,
      0.075,
    );
    for (let n = 0; n < 6; n++) {
      part(
        "leaves",
        leafGeometry,
        x - (height * 0.075) / 2,
        height + 0.25,
        z,
        0.94,
        0.85,
        0.94,
        n % 2 ? "#548d63" : "#397b60",
        (n * Math.PI) / 3 + x * 0.1,
      );
    }
    part(
      "crowns",
      sphere,
      x - 0.2,
      height + 0.18,
      z,
      0.8,
      0.75,
      0.8,
      "#67805a",
    );
    cyl(x, 0.53, z, 1.2, 0.15, 1.2, "#baaf93");
  }
  function shrub(x: number, z: number, radius = 1.2) {
    part(
      "shrubs",
      sphere,
      x,
      radius / 2 + 0.5,
      z,
      radius * 2,
      radius,
      radius * 2,
      "#82a679",
    );
  }
  function bench(x: number, z: number, rotation = 0) {
    cube(x, 0.94, z, 2.3, 0.22, 0.72, "#ac7358", rotation);
    const direction = new THREE.Vector3(0, 0, -0.32).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotation,
    );
    cube(
      x + direction.x,
      1.35,
      z + direction.z,
      2.3,
      0.75,
      0.16,
      "#ac7358",
      rotation,
    );
    for (const side of [-1, 1]) {
      const leg = new THREE.Vector3(side * 0.8, 0, 0).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rotation,
      );
      cube(x + leg.x, 0.64, z + leg.z, 0.14, 0.6, 0.65, "#465d60", rotation);
    }
  }
  function streetlight(x: number, z: number, rotation = 0) {
    cyl(x, 3.2, z, 0.16, 5.7, 0.16, "#556668");
    const end = new THREE.Vector3(0, 0, 1.35).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotation,
    );
    cube(
      x + end.x * 0.5,
      6.1,
      z + end.z * 0.5,
      0.12,
      0.12,
      1.6,
      "#556668",
      rotation,
    );
    cube(x + end.x, 6.04, z + end.z, 0.68, 0.2, 1.05, "#d6dfc3", rotation);
  }
  function textSign(
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    color = "#f5ebd3",
    background = "#326b74",
    horizontal = false,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = background;
    context.fillRect(0, 0, 512, 128);
    context.fillStyle = color;
    context.font = "bold 61px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 256, 69, 470);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    sign.position.set(x, y, z);
    if (horizontal) sign.rotation.x = -Math.PI / 2;
    sign.castShadow = true;
    scene.add(sign);
  }

  const walls = [
    "#f0d1b1",
    "#eab6a5",
    "#e9d9bb",
    "#c9d8c5",
    "#dda99f",
    "#efdecb",
    "#a6c7bd",
  ];
  const roofs = ["#7e9a97", "#4c7e83", "#799396", "#a98579"];
  function building(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: string,
    roof: string,
    style = 0,
  ) {
    solid(x, z, w + 0.35, d + 0.35);
    cube(x, h / 2 + 0.47, z, w, h, d, color);
    cube(x, 0.81, z, w + 0.35, 0.55, d + 0.35, "#c5b6a4");
    cube(x, h + 0.65, z, w + 0.5, 0.46, d + 0.5, "#f3dfc2");
    cube(x, h + 0.92, z, w - 0.9, 0.15, d - 0.9, roof);
    // Art-deco horizontal bands and recessed dark blue windows.
    const floors = Math.max(1, Math.floor((h - 1) / 3));
    for (let floor = 0; floor < floors; floor++) {
      const y = 2.1 + floor * 3;
      const windowHeight = floor === 0 ? 1.65 : 1.35;
      const windowColor = floor === 0 ? "#456c74" : "#63898e";
      for (const side of [-1, 1]) {
        for (let wx = -w / 2 + 1.6; wx < w / 2 - 0.7; wx += 2.6) {
          cube(
            x + wx,
            y,
            z + side * (d / 2 + 0.025),
            1.25,
            windowHeight,
            0.055,
            windowColor,
          );
          cube(
            x + wx,
            y - windowHeight / 2 - 0.09,
            z + side * (d / 2 + 0.11),
            1.52,
            0.14,
            0.25,
            "#f4dfc0",
          );
        }
        for (let wz = -d / 2 + 1.6; wz < d / 2 - 0.7; wz += 2.6) {
          cube(
            x + side * (w / 2 + 0.025),
            y,
            z + wz,
            0.055,
            windowHeight,
            1.25,
            windowColor,
          );
        }
      }
      if (floor > 0 && floor % 2 === 1)
        cube(x, y - 1.18, z, w + 0.18, 0.16, d + 0.18, "#e9cfb1");
    }
    // Doors and striped sun shades make the low-level streets more legible.
    cube(x + w * 0.24, 1.55, z + d / 2 + 0.035, 1.3, 2.15, 0.08, "#355b63");
    if (style === 1 || h < 9) {
      for (let stripe = 0; stripe < 7; stripe++) {
        cube(
          x - w * 0.27 + stripe * w * 0.09,
          3.48,
          z + d / 2 + 0.72,
          w * 0.095,
          0.23,
          1.35,
          stripe % 2 ? "#f3deba" : "#d88679",
        );
      }
    }
    cube(x - w * 0.23, h + 1.24, z - d * 0.21, 2.2, 0.64, 1.5, "#b4c1b4");
    for (const delta of [-0.6, 0.6])
      cyl(
        x - w * 0.23 + delta,
        h + 1.61,
        z - d * 0.21,
        0.72,
        0.13,
        0.72,
        "#6b8887",
      );
    if (h > 17) {
      cube(x, h + 1.8, z, w * 0.43, 1.9, d * 0.43, color);
      cube(x, h + 2.81, z, w * 0.47, 0.19, d * 0.47, "#ead5b6");
      cyl(x + 1, h + 4, z, 0.12, 2.4, 0.12, "#7d8b88");
    }
  }

  function plaza(x: number, z: number, fountain: boolean) {
    cube(x, 0.47, z, 29.4, 0.08, 29.4, "#d7d6b8");
    cube(x, 0.52, z, 5, 0.05, 29.7, "#ecdfc5");
    cube(x, 0.52, z, 29.7, 0.05, 5, "#ecdfc5");
    for (const dx of [-9, 9])
      for (const dz of [-9, 9]) {
        cube(x + dx, 0.58, z + dz, 9.4, 0.19, 9.4, "#88a67a");
        palm(x + dx, z + dz, 6.5 + random());
        shrub(x + dx - 2.1, z + dz + 2.4, 1.2);
        shrub(x + dx + 2.0, z + dz + 1.9, 0.9);
      }
    if (fountain) {
      cyl(x, 0.7, z, 8, 0.4, 8, "#f0dfc2");
      cyl(x, 0.96, z, 7.1, 0.15, 7.1, "#62b9bd");
      cyl(x, 1.3, z, 1.8, 0.9, 1.8, "#e9cfb0");
      cyl(x, 1.8, z, 4.2, 0.3, 4.2, "#e9cfb0");
      cyl(x, 1.98, z, 3.7, 0.08, 3.7, "#8ed2d0");
      cyl(x, 2.65, z, 0.48, 1.3, 0.48, "#a9e0d7");
      part("fountain", sphere, x, 3.34, z, 0.8, 0.7, 0.8, "#b3e6de");
      solid(x, z, 6.6, 6.6);
    } else {
      cube(x, 0.61, z, 11, 0.18, 11, "#d49980");
      cyl(x, 1.9, z, 1.5, 2.5, 1.5, "#dcc7a6");
      part("sculpture", cone, x, 4.15, z, 3.7, 3.2, 3.7, "#427e7b", 0.4);
      solid(x, z, 2, 2);
    }
    bench(x - 5.3, z + 4.6, -Math.PI / 2);
    bench(x + 5.3, z - 4.6, Math.PI / 2);
    bench(x + 4.4, z + 12.6);
    bench(x - 4.4, z - 12.6, Math.PI);
  }

  for (const x of centers)
    for (const z of centers) {
      if (x === 24 && z === 24) {
        plaza(x, z, true);
        continue;
      }
      if (x === -72 && z === 72) {
        plaza(x, z, false);
        continue;
      }
      if (x === -72 && z === -72) {
        building(x - 1, z - 5, 25, 16, 5.1, "#8aafa2", "#567e81", 1);
        cube(x - 1, 2.5, z + 3.1, 15.5, 3.4, 0.08, "#516d71");
        for (let gate = 0; gate < 6; gate++)
          cube(x - 1, 1.18 + gate * 0.52, z + 3.16, 15, 0.07, 0.04, "#92a89d");
        textSign(
          "AUTO SERVICE",
          x - 1,
          5.0,
          z + 3.3,
          16,
          2.4,
          "#f4e5c7",
          "#3d797b",
        );
        cube(x, 0.47, z + 10, 23, 0.04, 9.8, "#88918a");
        for (const bay of [-8, 0, 8])
          cube(x + bay, 0.51, z + 10, 0.14, 0.03, 7.7, "#e8dfbd");
        palm(x - 14, z + 13.6, 6.8);
        continue;
      }
      if (x === 72 && z === 72) {
        // A low pink motel with a turquoise pool, visible from the opening scene.
        building(x - 6, z, 11, 25, 6.2, "#e4aaa0", "#668d90", 1);
        building(x + 6, z - 9, 12, 7, 4.2, "#f0c9ad", "#668d90");
        cube(x + 7.2, 0.51, z + 4.1, 10, 0.14, 14, "#f2ddbf");
        cube(x + 7.2, 0.61, z + 4.1, 7.5, 0.06, 11.5, "#54b6c0");
        cube(x + 7.2, 0.65, z + 4.1, 0.11, 0.025, 10.5, "#a2d8d2");
        palm(x + 13.1, z + 12.7, 6.5);
        textSign(
          "PALM MOTEL",
          x - 6,
          6.7,
          z + 12.65,
          10.6,
          1.8,
          "#f6e8cb",
          "#ae706f",
        );
        continue;
      }
      const low = z > 0 || (x === 24 && z === -24);
      const layouts = [
        [
          [-7.6, -6.7, 12.5, 14],
          [7.2, 5.6, 12.2, 16],
        ],
        [
          [0, -7.8, 26, 11],
          [-7.3, 6.8, 12, 13],
          [7.6, 6.8, 11, 13],
        ],
        [
          [-7.7, 0, 11.5, 26],
          [7.0, -6.8, 12, 12],
          [7.0, 7.0, 12, 12],
        ],
      ];
      const layout = layouts[Math.floor(random() * layouts.length)];
      for (const [dx, dz, w, d] of layout) {
        const height = low
          ? 4.7 + Math.floor(random() * 3) * 2.8
          : 8.8 + Math.floor(random() * 6) * 2.8;
        building(
          x + dx,
          z + dz,
          w,
          d,
          height,
          walls[Math.floor(random() * walls.length)],
          roofs[Math.floor(random() * roofs.length)],
          random() > 0.5 ? 1 : 0,
        );
      }
      palm(x - 14.8, z + 14.8, 6.6 + random());
      if (!low) palm(x + 14.7, z - 14.7, 7.2);
    }

  // Landmark lettering faces the player as they head into the downtown district.
  textSign("VICE DISTRICT", 20, 11.0, -65.8, 18.7, 2.8, "#ffebce", "#bf8179");
  cube(20, 10.95, -66.0, 19.2, 3.2, 0.28, "#bc887c");
  textSign("OCEAN DRIVE", 111.7, 0.48, 33, 13, 3.2, "#718f88", "#d8cdb7", true);
  textSign("PALM PLAZA", 24, 0.56, 37.6, 11, 2.1, "#799184", "#ecdfc5", true);

  for (const x of centers)
    for (const z of centers) {
      streetlight(x + 15.9, z + 11.4, Math.PI / 2);
      if ((x + z) % 96 === 0) streetlight(x - 15.9, z - 11.4, -Math.PI / 2);
      // Bins and utility cabinets remain small street dressing, with clear paths.
      cube(x + 14.9, 0.98, z - 13.4, 0.76, 1.05, 0.76, "#6a9289");
      cube(x + 14.9, 1.54, z - 13.4, 0.84, 0.13, 0.84, "#435d5b");
    }
  for (let p = -112; p <= 112; p += 16) {
    for (const side of [-1, 1]) {
      palm(side * 116.8, p, 6.5 + random() * 1.5);
      if (Math.abs(p) < 110) palm(p, side * 117, 6.5 + random() * 1.5);
    }
  }
  for (let p = -106; p <= 106; p += 24) {
    bench(120.2, p, -Math.PI / 2);
    bench(p, 120, 0);
    streetlight(-120, p, -Math.PI / 2);
  }

  // Small piers, sailboats, and buoys extend the view beyond the playable island.
  for (const z of [-69, -38, -7]) {
    cube(134, 0.12, z, 20, 0.5, 3.8, "#b89372");
    for (let x = 126; x < 145; x += 2)
      cube(x, 0.39, z, 0.09, 0.025, 3.8, "#8d7761");
    for (const side of [-1, 1])
      for (const x of [128, 143])
        cyl(x, -0.05, z + side * 1.5, 0.45, 2.2, 0.45, "#84715e");
    cube(138, -0.37, z + 5.9, 9.2, 1.1, 3.7, "#f3e6c9");
    cube(138, 0.32, z + 5.9, 4.6, 0.9, 2.8, "#e0bf97");
    cube(138, 0.84, z + 5.9, 3.8, 0.16, 2.65, "#4d8892");
    cyl(138, 3.78, z + 5.9, 0.1, 7, 0.1, "#e2d4b7");
  }
  for (let n = 0; n < 11; n++) {
    const x = 157 + random() * 7;
    const z = -90 + n * 18;
    cyl(x, -0.48, z, 0.85, 0.8, 0.85, n % 2 ? "#e59f7e" : "#dfdbc0");
  }

  for (const [kind, batch] of batches) {
    const material = new THREE.MeshStandardMaterial({
      roughness: batch.roughness,
      metalness: batch.metalness,
      side: kind === "leaves" ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.InstancedMesh(
      batch.geometry,
      material,
      batch.parts.length,
    );
    batch.parts.forEach((instance, i) => {
      quaternion.setFromEuler(instance.rotation);
      matrix.compose(instance.position, quaternion, instance.scale);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, instance.color);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  return {
    obstacles,
    roadXs: [...roads],
    roadZs: [...roads],
    bounds: 121,
    spawn: new THREE.Vector3(5, 0.5, 12),
    garage: new THREE.Vector3(-48, 0.3, -79),
    missionPickup: new THREE.Vector3(48, 0.3, 25),
  };
}
