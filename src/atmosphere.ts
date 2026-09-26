import * as THREE from "three";

/** A coastal horizon that gives the street camera somewhere to look. */
export function createAtmosphere(scene: THREE.Scene): void {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(520, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        zenith: { value: new THREE.Color("#75bad7") },
        horizon: { value: new THREE.Color("#f6e5c9") },
        underside: { value: new THREE.Color("#accbc8") },
        cloudColor: { value: new THREE.Color("#ffefdb") },
        sunColor: { value: new THREE.Color("#fff6dd") },
        sunDirection: {
          value: new THREE.Vector3(-0.82, 0.32, 0.48).normalize(),
        },
      },
      vertexShader: `
        varying vec3 skyDirection;
        void main() {
          skyDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 underside;
        uniform vec3 cloudColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        varying vec3 skyDirection;

        float hash(vec2 point) {
          return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 point) {
          vec2 cell = floor(point);
          vec2 f = fract(point);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
            mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x),
            f.y
          );
        }
        void main() {
          vec3 direction = normalize(skyDirection);
          float elevation = max(direction.y, 0.0);
          vec3 color = mix(horizon, zenith, pow(elevation, 0.48));
          color = mix(color, underside, 1.0 - smoothstep(-0.16, 0.02, direction.y));

          // Broad, still wisps keep the sky calm while leaving blue between them.
          vec2 cloudPoint = direction.xz / max(direction.y + 0.22, 0.06);
          cloudPoint = cloudPoint * vec2(1.8, 3.6) + vec2(8.1, 2.7);
          float cloud = noise(cloudPoint) * 0.65
            + noise(cloudPoint * 2.1) * 0.25
            + noise(cloudPoint * 4.3) * 0.1;
          cloud = smoothstep(0.59, 0.76, cloud)
            * smoothstep(0.035, 0.18, direction.y)
            * (1.0 - smoothstep(0.44, 0.75, direction.y));
          color = mix(color, cloudColor, cloud * 0.55);

          float sunAlignment = max(dot(direction, sunDirection), 0.0);
          float glow = pow(sunAlignment, 32.0) * 0.13;
          float disc = smoothstep(0.99960, 0.99973, sunAlignment);
          color = mix(color, sunColor, min(glow + disc, 1.0));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  sky.name = "coastal-sky";
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  // Following the camera prevents the sky sphere meeting the far plane at the coast.
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
  };
  scene.add(sky);

  const distantLand = new THREE.Group();
  distantLand.name = "distant-coast";
  const ridgeMaterial = new THREE.MeshBasicMaterial({ color: "#779d9b" });
  const ridgeShape = new THREE.Shape();
  ridgeShape.moveTo(-235, -1.3);
  for (const [x, y] of [
    [-226, 3],
    [-203, 9],
    [-177, 12],
    [-154, 25],
    [-139, 21],
    [-116, 37],
    [-94, 27],
    [-64, 23],
    [-38, 14],
    [-10, 18],
    [16, 10],
    [46, 12],
    [66, 5],
    [98, 7],
    [126, 1],
  ])
    ridgeShape.lineTo(x, y);
  ridgeShape.lineTo(141, -1.3);
  ridgeShape.closePath();
  const ridge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(ridgeShape, { depth: 28, bevelEnabled: false }),
    ridgeMaterial,
  );
  ridge.position.set(-292, 0, -20);
  ridge.rotation.y = Math.PI / 2;
  distantLand.add(ridge);

  // A distant mainland skyline uses one draw call and no shadow-map work.
  const skylineParts: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    y: number;
  }[] = [];
  let randomState = 83012;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  for (let n = 0; n < 28; n++) {
    const x = -155 + n * 11.4;
    const z = -264 - random() * 31;
    const w = 7 + random() * 9;
    const d = 8 + random() * 10;
    const h = 10 + random() * 27 + Math.max(0, 1 - Math.abs(x - 24) / 75) * 25;
    skylineParts.push({ x, z, w, d, h, y: h / 2 - 0.8 });
    if (n % 3 === 0) {
      skylineParts.push({
        x,
        z,
        w: w * 0.56,
        d: d * 0.65,
        h: 5,
        y: h + 1.7,
      });
    }
  }
  const skyline = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: "#72979b" }),
    skylineParts.length,
  );
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  skylineParts.forEach((part, index) => {
    position.set(part.x, part.y, part.z);
    scale.set(part.w, part.h, part.d);
    matrix.compose(position, rotation, scale);
    skyline.setMatrixAt(index, matrix);
    color.setScalar(0.9 + random() * 0.16);
    skyline.setColorAt(index, color);
  });
  skyline.computeBoundingSphere();
  distantLand.add(skyline);
  scene.add(distantLand);
}
