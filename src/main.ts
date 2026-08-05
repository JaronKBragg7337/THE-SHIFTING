import * as THREE from 'three';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <div id="hud">
    <div id="title">THE SHIFTING</div>
    <div id="warning">THE FOG IS LISTENING</div>
    <div id="crosshair"></div>
    <div id="status">WASD — move<br>SHIFT — run<br>MOUSE — look<br>Do not trust the mirrors.</div>
    <div id="fear"><span></span></div>
  </div>
  <div id="veil">
    <div class="panel">
      <h1>THE SHIFTING</h1>
      <p>The halls rebuild themselves when they are not being watched. Keep moving. Fog means something larger has entered your sector.</p>
      <button id="enter">ENTER THE MAZE</button>
    </div>
  </div>
`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d09);
scene.fog = new THREE.FogExp2(0x11140e, 0.035);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 140);
camera.position.set(0, 1.65, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

const ambient = new THREE.HemisphereLight(0xb5bb93, 0x111208, 0.5);
scene.add(ambient);

const player = {
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  fear: 0,
  locked: false,
};

const keys = new Set<string>();
const raycaster = new THREE.Raycaster();
const colliders: THREE.Box3[] = [];
const chunks = new Map<string, THREE.Group>();
const chunkSize = 12;
const activeRadius = 3;
let elapsed = 0;
let shiftClock = 0;
let fogEvent = 0;
let bossActive = false;

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x9c9a6e, roughness: 0.86, metalness: 0.02 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x4e4a31, roughness: 0.94 });
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xb5b18b, roughness: 0.9 });
const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x2d2b1f, roughness: 0.75 });

function seeded(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function addBox(group: THREE.Group, size: THREE.Vector3, position: THREE.Vector3, material: THREE.Material, collider = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (collider) {
    mesh.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }
  return mesh;
}

function buildChunk(cx: number, cz: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(cx * chunkSize, 0, cz * chunkSize);
  const type = Math.floor(seeded(cx, cz) * 5);

  addBox(group, new THREE.Vector3(chunkSize, 0.18, chunkSize), new THREE.Vector3(0, -0.09, 0), floorMaterial);
  addBox(group, new THREE.Vector3(chunkSize, 0.16, chunkSize), new THREE.Vector3(0, 3.55, 0), ceilingMaterial);

  const walls: Array<[number, number, number, number]> = [];
  const half = chunkSize / 2;
  const gap = type === 3 ? 4.4 : 3.1;

  walls.push([-half, 1.75, 0, chunkSize], [half, 1.75, 0, chunkSize]);
  walls.push([0, 1.75, -half, chunkSize], [0, 1.75, half, chunkSize]);

  walls.forEach(([x, y, z, length], index) => {
    const vertical = index < 2;
    const open = seeded(cx, cz, index + 8) > 0.2;
    if (open) {
      const part = (length - gap) / 2;
      if (vertical) {
        addBox(group, new THREE.Vector3(0.28, 3.5, part), new THREE.Vector3(x, y, -(gap + part) / 2), wallMaterial, true);
        addBox(group, new THREE.Vector3(0.28, 3.5, part), new THREE.Vector3(x, y, (gap + part) / 2), wallMaterial, true);
      } else {
        addBox(group, new THREE.Vector3(part, 3.5, 0.28), new THREE.Vector3(-(gap + part) / 2, y, z), wallMaterial, true);
        addBox(group, new THREE.Vector3(part, 3.5, 0.28), new THREE.Vector3((gap + part) / 2, y, z), wallMaterial, true);
      }
    }
  });

  if (type === 1 || type === 4) {
    const pillarCount = type === 4 ? 4 : 2;
    for (let i = 0; i < pillarCount; i++) {
      const px = (seeded(cx, cz, 20 + i) - 0.5) * 7;
      const pz = (seeded(cx, cz, 40 + i) - 0.5) * 7;
      addBox(group, new THREE.Vector3(0.65, 3.5, 0.65), new THREE.Vector3(px, 1.75, pz), trimMaterial, true);
    }
  }

  if (type === 2) {
    addBox(group, new THREE.Vector3(7.5, 3.1, 0.28), new THREE.Vector3(0, 1.55, 1.7), wallMaterial, true);
    const mirror = addBox(group, new THREE.Vector3(3.4, 2.25, 0.08), new THREE.Vector3(0, 1.7, 1.5), new THREE.MeshPhysicalMaterial({ color: 0x94a09a, metalness: 0.85, roughness: 0.08, transmission: 0.05 }));
    mirror.userData.mirror = true;
  }

  const light = new THREE.PointLight(0xe6e2b6, 1.25, 13, 2.1);
  light.position.set((seeded(cx, cz, 60) - 0.5) * 4, 3.25, (seeded(cx, cz, 61) - 0.5) * 4);
  light.castShadow = seeded(cx, cz, 62) > 0.65;
  group.add(light);

  const fixture = addBox(group, new THREE.Vector3(2.6, 0.08, 0.28), new THREE.Vector3(light.position.x, 3.42, light.position.z), ceilingMaterial);
  fixture.userData.flicker = seeded(cx, cz, 64) > 0.72;
  light.userData.flicker = fixture.userData.flicker;

  scene.add(group);
  return group;
}

function refreshWorld() {
  const cx = Math.floor(camera.position.x / chunkSize);
  const cz = Math.floor(camera.position.z / chunkSize);
  for (let x = cx - activeRadius; x <= cx + activeRadius; x++) {
    for (let z = cz - activeRadius; z <= cz + activeRadius; z++) {
      const key = `${x},${z}`;
      if (!chunks.has(key)) chunks.set(key, buildChunk(x, z));
    }
  }
  for (const [key, group] of chunks) {
    const [x, z] = key.split(',').map(Number);
    if (Math.abs(x - cx) > activeRadius + 1 || Math.abs(z - cz) > activeRadius + 1) {
      scene.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
      chunks.delete(key);
    }
  }
}

const creature = new THREE.Group();
const creatureMaterial = new THREE.MeshStandardMaterial({ color: 0x080908, roughness: 0.75 });
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.75, 5, 10), creatureMaterial);
torso.position.y = 1.45;
creature.add(torso);
for (const side of [-1, 1]) {
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 1.65, 4, 8), creatureMaterial);
  arm.position.set(side * 0.54, 1.35, 0);
  arm.rotation.z = side * -0.13;
  creature.add(arm);
}
const eyes = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.045), new THREE.MeshBasicMaterial({ color: 0xe8e4ca }));
eyes.position.set(0, 2.55, 0.37);
creature.add(eyes);
creature.position.set(30, 0, 30);
scene.add(creature);

function canMove(next: THREE.Vector3): boolean {
  const body = new THREE.Box3(
    new THREE.Vector3(next.x - 0.28, 0.15, next.z - 0.28),
    new THREE.Vector3(next.x + 0.28, 1.82, next.z + 0.28),
  );
  return !colliders.some((box) => box.intersectsBox(body));
}

function shiftUnobservedChunk() {
  const candidates = [...chunks.entries()].filter(([, group]) => {
    const to = group.position.clone().sub(camera.position).normalize();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    return forward.dot(to) < -0.15 && group.position.distanceTo(camera.position) > 12;
  });
  if (!candidates.length) return;
  const [key, old] = candidates[Math.floor(Math.random() * candidates.length)];
  scene.remove(old);
  chunks.delete(key);
  colliders.length = 0;
  for (const group of chunks.values()) {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry.type === 'BoxGeometry' && obj.material !== floorMaterial && obj.material !== ceilingMaterial) {
        const box = new THREE.Box3().setFromObject(obj);
        if (box.getSize(new THREE.Vector3()).y > 1) colliders.push(box);
      }
    });
  }
  const [x, z] = key.split(',').map(Number);
  chunks.set(key, buildChunk(x + (Math.random() > 0.5 ? 1 : -1), z));
}

function updateFog(dt: number) {
  fogEvent += dt;
  const warning = document.querySelector('#warning');
  if (fogEvent > 34 && !bossActive) {
    bossActive = true;
    warning?.classList.add('visible');
    creature.position.copy(camera.position).add(new THREE.Vector3(0, -1.65, -34).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw));
  }
  const fog = scene.fog as THREE.FogExp2;
  const target = bossActive ? 0.105 : 0.035;
  fog.density += (target - fog.density) * Math.min(1, dt * 0.35);
  if (bossActive) {
    const toward = camera.position.clone().sub(creature.position);
    toward.y = 0;
    const distance = toward.length();
    creature.position.add(toward.normalize().multiplyScalar(dt * (distance < 12 ? 2.7 : 1.7)));
    creature.lookAt(camera.position.x, 1.5, camera.position.z);
    player.fear = THREE.MathUtils.clamp(player.fear + dt * Math.max(0.5, 10 / Math.max(distance, 1)), 0, 100);
    if (distance < 1.35) {
      bossActive = false;
      fogEvent = 0;
      player.fear = 100;
      creature.position.set(camera.position.x + 40, 0, camera.position.z + 40);
      warning!.textContent = 'IT REMEMBERED YOU';
      setTimeout(() => warning?.classList.remove('visible'), 1800);
    }
  } else {
    player.fear = Math.max(0, player.fear - dt * 2.4);
  }
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  shiftClock += dt;

  if (player.locked) {
    const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const wish = new THREE.Vector3();
    if (keys.has('KeyW')) wish.add(forward);
    if (keys.has('KeyS')) wish.sub(forward);
    if (keys.has('KeyD')) wish.add(right);
    if (keys.has('KeyA')) wish.sub(right);
    const speed = keys.has('ShiftLeft') ? 5.8 : 3.25;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    player.velocity.lerp(wish, 1 - Math.exp(-dt * 11));
    const next = camera.position.clone().addScaledVector(player.velocity, dt);
    if (canMove(next)) camera.position.copy(next);
    else player.velocity.multiplyScalar(0.25);

    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }

  refreshWorld();
  if (shiftClock > 8 + Math.random() * 6) {
    shiftClock = 0;
    shiftUnobservedChunk();
  }

  for (const group of chunks.values()) {
    group.traverse((obj) => {
      if (obj instanceof THREE.PointLight && obj.userData.flicker) {
        obj.intensity = Math.sin(elapsed * 22 + obj.position.x) > -0.75 ? 1.25 : 0.08;
      }
      if (obj instanceof THREE.Mesh && obj.userData.mirror) {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const watched = raycaster.intersectObject(obj).length > 0;
        const mat = obj.material as THREE.MeshPhysicalMaterial;
        mat.emissive.setHex(watched && seeded(Math.floor(elapsed), 7) > 0.84 ? 0x303842 : 0x000000);
      }
    });
  }

  updateFog(dt);
  const fearBar = document.querySelector<HTMLElement>('#fear > span');
  if (fearBar) fearBar.style.width = `${player.fear}%`;
  renderer.render(scene, camera);
}

addEventListener('keydown', (event) => keys.add(event.code));
addEventListener('keyup', (event) => keys.delete(event.code));
addEventListener('mousemove', (event) => {
  if (!player.locked) return;
  player.yaw -= event.movementX * 0.002;
  player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.002, -1.35, 1.35);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

document.addEventListener('pointerlockchange', () => {
  player.locked = document.pointerLockElement === renderer.domElement;
});

document.querySelector('#enter')?.addEventListener('click', () => {
  document.querySelector('#veil')?.classList.add('hidden');
  renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('click', () => {
  if (!player.locked) renderer.domElement.requestPointerLock();
});

refreshWorld();
animate();
