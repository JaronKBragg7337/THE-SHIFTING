// Mobile-only joystick direction correction.
// Capture the stick before game.ts receives it and translate touch direction
// into the same keyboard movement semantics used by desktop controls.

const activeKeys = new Set<string>();
let activePointer: number | null = null;

function emit(code: string, down: boolean) {
  const currentlyDown = activeKeys.has(code);
  if (down === currentlyDown) return;
  if (down) activeKeys.add(code);
  else activeKeys.delete(code);
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
}

function clearMovement() {
  for (const code of [...activeKeys]) emit(code, false);
}

function applyStick(event: PointerEvent, stick: HTMLElement) {
  const rect = stick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = rect.width * 0.34;

  let x = event.clientX - centerX;
  let y = event.clientY - centerY;
  const length = Math.hypot(x, y);
  if (length > radius && length > 0) {
    x = (x / length) * radius;
    y = (y / length) * radius;
  }

  const nx = x / radius;
  const ny = y / radius;
  const deadzone = 0.22;

  // Screen up = forward, screen left = left.
  emit('KeyW', ny < -deadzone);
  emit('KeyS', ny > deadzone);
  emit('KeyA', nx < -deadzone);
  emit('KeyD', nx > deadzone);

  const knob = document.querySelector<HTMLElement>('#stick-knob');
  if (knob) knob.style.transform = `translate(${x}px, ${y}px)`;
}

function isStickTarget(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && !!target.closest('#stick');
}

document.addEventListener('pointerdown', (event) => {
  if (!isStickTarget(event.target)) return;
  const stick = (event.target as HTMLElement).closest<HTMLElement>('#stick');
  if (!stick) return;
  activePointer = event.pointerId;
  event.preventDefault();
  event.stopImmediatePropagation();
  applyStick(event, stick);
}, true);

document.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer) return;
  const stick = document.querySelector<HTMLElement>('#stick');
  if (!stick) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  applyStick(event, stick);
}, true);

function release(event: PointerEvent) {
  if (event.pointerId !== activePointer) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  activePointer = null;
  clearMovement();
  const knob = document.querySelector<HTMLElement>('#stick-knob');
  if (knob) knob.style.transform = 'translate(0, 0)';
}

document.addEventListener('pointerup', release, true);
document.addEventListener('pointercancel', release, true);
window.addEventListener('blur', clearMovement);
