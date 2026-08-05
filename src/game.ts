import * as THREE from 'three';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

app.innerHTML = `
  <div id="hud">
    <div id="title">THE SHIFTING</div>
    <div id="warning">THE FOG IS LISTENING</div>
    <div id="crosshair"></div>
    <div id="status">${isTouch ? 'LEFT THUMB — move<br>RIGHT SIDE — look<br>RUN — sprint' : 'WASD — move<br>SHIFT — run<br>MOUSE — look'}<br>Do not trust the mirrors.</div>
    <div id="fear"><span></span></div>
  </div>
  <div id="mobile-controls" class="${isTouch ? 'visible' : ''}">
    <div id="stick"><div id="stick-knob"></div></div>
    <button id="run" aria-label="Run">RUN</button>
    <div id="look-zone"></div>
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
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.35 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !isTouch;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xb5bb93, 0x111208, 0.65));

const keys = new Set<string>();
const player = { velocity: new THREE.Vector3(), yaw: 0, pitch: 0, fear: 0, active: false };
const touchMove = new THREE.Vector2();
let touchRunning = false;
let elapsed = 0;
let shiftClock = 0;
let fogEvent = 0;
let bossActive = false;

const colliders: THREE.Box3[] = [];
const chunks = new Map<string, THREE.Group>();
const chunkSize = 12;
const activeRadius = isTouch ? 2 : 3;

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x9c9a6e, roughness: 0.86 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x4e4a31, roughness: 0.94 });
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xb5b18b, roughness: 0.9 });
const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x2d2b1f, roughness: 0.75 });

function seeded(x: number, z: number, salt = 0) {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function addBox(group: THREE.Group, sx: number, sy: number, sz: number, x: number, y: number, z: number, material: THREE.Material, collider = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  group.add(mesh);
  if (collider) {
    mesh.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }
  return mesh;
}

function buildChunk(cx: number, cz: number) {
  const group = new THREE.Group();
  group.position.set(cx * chunkSize, 0, cz * chunkSize);
  const type = Math.floor(seeded(cx, cz) * 5);
  const half = chunkSize / 2;
  const gap = type === 3 ? 4.4 : 3.1;

  addBox(group, chunkSize, 0.18, chunkSize, 0, -0.09, 0, floorMaterial);
  addBox(group, chunkSize, 0.16, chunkSize, 0, 3.55, 0, ceilingMaterial);

  const boundaries: Array<[number, number, number, boolean]> = [
    [-half, 0, 0, true], [half, 0, 0, true], [0, 0, -half, false], [0, 0, half, false],
  ];

  boundaries.forEach(([x, , z, vertical], index) => {
    if (seeded(cx, cz, index + 8) <= 0.16) return;
    const part = (chunkSize - gap) / 2;
    if (vertical) {
      addBox(group, 0.28, 3.5, part, x, 1.75, -(gap + part) / 2, wallMaterial, true);
      addBox(group, 0.28, 3.5, part, x, 1.75, (gap + part) / 2, wallMaterial, true);
    } else {
      addBox(group, part, 3.5, 0.28, -(gap + part) / 2, 1.75, z, wallMaterial, true);
      addBox(group, part, 3.5, 0.28, (gap + part) / 2, 1.75, z, wallMaterial, true);
    }
  });

  if (type === 1 || type === 4) {
    for (let i = 0; i < (type === 4 ? 4 : 2); i++) {
      addBox(group, 0.65, 3.5, 0.65, (seeded(cx, cz, 20 + i) - 0.5) * 7, 1.75, (seeded(cx, cz, 40 + i) - 0.5) * 7, trimMaterial, true);
    }
  }

  if (type === 2) {
    addBox(group, 7.5, 3.1, 0.28, 0, 1.55, 1.7, wallMaterial, true);
    const mirror = addBox(group, 3.4, 2.25, 0.08, 0, 1.7, 1.5, new THREE.MeshPhysicalMaterial({ color: 0x94a09a, metalness: 0.9, roughness: 0.08 }));
    mirror.userData.mirror = true;
  }

  const light = new THREE.PointLight(0xe6e2b6, 1.3, 13, 2.1);
  light.position.set((seeded(cx, cz, 60) - 0.5) * 4, 3.25, (seeded(cx, cz, 61) - 0.5) * 4);
  light.userData.flicker = seeded(cx, cz, 64) > 0.72;
  group.add(light);
  scene.add(group);
  return group;
}

function rebuildColliders() {
  colliders.length = 0;
  for (const group of chunks.values()) {
    group.updateMatrixWorld(true);
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      if (size.y > 1 && obj.material !== ceilingMaterial) colliders.push(new THREE.Box3().setFromObject(obj));
    });
  }
}

function refreshWorld() {
  const cx = Math.floor(camera.position.x / chunkSize);
  const cz = Math.floor(camera.position.z / chunkSize);
  let changed = false;
  for (let x = cx - activeRadius; x <= cx + activeRadius; x++) {
    for (let z = cz - activeRadius; z <= cz + activeRadius; z++) {
      const key = `${x},${z}`;
      if (!chunks.has(key)) { chunks.set(key, buildChunk(x, z)); changed = true; }
    }
  }
  for (const [key, group] of [...chunks]) {
    const [x, z] = key.split(',').map(Number);
    if (Math.abs(x - cx) > activeRadius + 1 || Math.abs(z - cz) > activeRadius + 1) {
      scene.remove(group); chunks.delete(key); changed = true;
    }
  }
  if (changed) rebuildColliders();
}

const creature = new THREE.Group();
const creatureMaterial = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.78 });
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.75, 5, 10), creatureMaterial);
torso.position.y = 1.45; creature.add(torso);
for (const side of [-1, 1]) {
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 1.65, 4, 8), creatureMaterial);
  arm.position.set(side * 0.54, 1.35, 0); arm.rotation.z = side * -0.13; creature.add(arm);
}
const eyes = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.045), new THREE.MeshBasicMaterial({ color: 0xe8e4ca }));
eyes.position.set(0, 2.55, 0.37); creature.add(eyes);
creature.position.set(30, 0, 30); scene.add(creature);

function canMove(next: THREE.Vector3) {
  const body = new THREE.Box3(new THREE.Vector3(next.x - 0.28, 0.15, next.z - 0.28), new THREE.Vector3(next.x + 0.28, 1.82, next.z + 0.28));
  return !colliders.some((box) => box.intersectsBox(body));
}

function shiftMaze() {
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  const candidates = [...chunks.entries()].filter(([, group]) => forward.dot(group.position.clone().sub(camera.position).normalize()) < -0.2 && group.position.distanceTo(camera.position) > 13);
  if (!candidates.length) return;
  const [key, old] = candidates[Math.floor(Math.random() * candidates.length)];
  scene.remove(old); chunks.delete(key);
  const [x, z] = key.split(',').map(Number);
  chunks.set(key, buildChunk(x, z)); rebuildColliders();
}

function updateFog(dt: number) {
  if (!player.active) return;
  fogEvent += dt;
  const warning = document.querySelector<HTMLElement>('#warning');
  if (fogEvent > 34 && !bossActive) {
    bossActive = true; warning?.classList.add('visible');
    creature.position.copy(camera.position).add(new THREE.Vector3(0, -1.65, -34).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw));
  }
  const fog = scene.fog as THREE.FogExp2;
  fog.density += ((bossActive ? 0.105 : 0.035) - fog.density) * Math.min(1, dt * 0.35);
  if (!bossActive) { player.fear = Math.max(0, player.fear - dt * 2.4); return; }
  const toward = camera.position.clone().sub(creature.position); toward.y = 0;
  const distance = toward.length();
  creature.position.add(toward.normalize().multiplyScalar(dt * (distance < 12 ? 2.7 : 1.7)));
  creature.lookAt(camera.position.x, 1.5, camera.position.z);
  player.fear = THREE.MathUtils.clamp(player.fear + dt * Math.max(0.5, 10 / Math.max(distance, 1)), 0, 100);
  if (distance < 1.35) {
    bossActive = false; fogEvent = 0; player.fear = 100;
    creature.position.set(camera.position.x + 40, 0, camera.position.z + 40);
    if (warning) warning.textContent = 'IT REMEMBERED YOU';
    setTimeout(() => warning?.classList.remove('visible'), 1800);
  }
}

function updatePlayer(dt: number) {
  if (!player.active) return;
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, Math.sin(player.yaw));
  const wish = new THREE.Vector3();
  if (keys.has('KeyW')) wish.add(forward);
  if (keys.has('KeyS')) wish.sub(forward);
  if (keys.has('KeyD')) wish.add(right);
  if (keys.has('KeyA')) wish.sub(right);
  wish.addScaledVector(right, touchMove.x).addScaledVector(forward, -touchMove.y);
  const running = keys.has('ShiftLeft') || touchRunning;
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(running ? 5.8 : 3.25);
  player.velocity.lerp(wish, 1 - Math.exp(-dt * 11));
  const next = camera.position.clone().addScaledVector(player.velocity, dt);
  if (canMove(next)) camera.position.copy(next); else player.velocity.multiplyScalar(0.18);
  camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt; shiftClock += dt;
  updatePlayer(dt); refreshWorld(); updateFog(dt);
  if (player.active && shiftClock > 9 + Math.random() * 5) { shiftClock = 0; shiftMaze(); }
  for (const group of chunks.values()) group.traverse((obj) => {
    if (obj instanceof THREE.PointLight && obj.userData.flicker) obj.intensity = Math.sin(elapsed * 22 + obj.position.x) > -0.75 ? 1.25 : 0.08;
    if (obj instanceof THREE.Mesh && obj.userData.mirror) (obj.material as THREE.MeshPhysicalMaterial).emissive.setHex(Math.sin(elapsed * 4 + obj.position.x) > 0.93 ? 0x26303a : 0x000000);
  });
  const fearBar = document.querySelector<HTMLElement>('#fear > span');
  if (fearBar) fearBar.style.width = `${player.fear}%`;
  renderer.render(scene, camera);
}

addEventListener('keydown', (event) => keys.add(event.code));
addEventListener('keyup', (event) => keys.delete(event.code));
addEventListener('mousemove', (event) => {
  if (!player.active || document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= event.movementX * 0.002;
  player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.002, -1.35, 1.35);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.35 : 2)); renderer.setSize(innerWidth, innerHeight);
});

document.querySelector('#enter')?.addEventListener('click', () => {
  player.active = true;
  document.querySelector('#veil')?.classList.add('hidden');
  if (!isTouch) renderer.domElement.requestPointerLock?.();
});
renderer.domElement.addEventListener('click', () => { if (player.active && !isTouch) renderer.domElement.requestPointerLock?.(); });

const stick = document.querySelector<HTMLElement>('#stick');
const knob = document.querySelector<HTMLElement>('#stick-knob');
let stickId: number | null = null;
function setStick(event: PointerEvent) {
  if (!stick || !knob) return;
  const r = stick.getBoundingClientRect();
  let x = event.clientX - (r.left + r.width / 2);
  let y = event.clientY - (r.top + r.height / 2);
  const radius = r.width * 0.34;
  const length = Math.hypot(x, y);
  if (length > radius) { x = x / length * radius; y = y / length * radius; }
  touchMove.set(x / radius, y / radius);
  knob.style.transform = `translate(${x}px, ${y}px)`;
}
stick?.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); setStick(e); });
stick?.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) setStick(e); });
const releaseStick = (e: PointerEvent) => { if (e.pointerId !== stickId) return; stickId = null; touchMove.set(0, 0); if (knob) knob.style.transform = 'translate(0, 0)'; };
stick?.addEventListener('pointerup', releaseStick); stick?.addEventListener('pointercancel', releaseStick);

const lookZone = document.querySelector<HTMLElement>('#look-zone');
let lookId: number | null = null; let lastLookX = 0; let lastLookY = 0;
lookZone?.addEventListener('pointerdown', (e) => { lookId = e.pointerId; lastLookX = e.clientX; lastLookY = e.clientY; lookZone.setPointerCapture(e.pointerId); });
lookZone?.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookId || !player.active) return;
  const dx = e.clientX - lastLookX; const dy = e.clientY - lastLookY;
  lastLookX = e.clientX; lastLookY = e.clientY;
  player.yaw -= dx * 0.0042; player.pitch = THREE.MathUtils.clamp(player.pitch - dy * 0.0037, -1.3, 1.3);
});
const releaseLook = (e: PointerEvent) => { if (e.pointerId === lookId) lookId = null; };
lookZone?.addEventListener('pointerup', releaseLook); lookZone?.addEventListener('pointercancel', releaseLook);

const runButton = document.querySelector<HTMLElement>('#run');
runButton?.addEventListener('pointerdown', (e) => { e.preventDefault(); touchRunning = true; runButton.classList.add('pressed'); });
const stopRun = () => { touchRunning = false; runButton?.classList.remove('pressed'); };
runButton?.addEventListener('pointerup', stopRun); runButton?.addEventListener('pointercancel', stopRun); runButton?.addEventListener('pointerleave', stopRun);

document.addEventListener('contextmenu', (e) => e.preventDefault());
refreshWorld(); animate();
