# THE SHIFTING

A first-person infinite-maze horror prototype built with Three.js, Vite, and TypeScript.

The maze is not a static level. It streams modular sectors around the player, mutates unobserved space, uses mirrors as unreliable information, escalates fog before a major pursuer manifests, and treats navigation itself as the primary threat.

## Current playable slice

- First-person WASD movement, mouse look, sprinting, and collision
- Procedurally streamed maze sectors
- Unobserved-path mutation
- Multiple room structures, pillars, openings, lighting, and flickering fixtures
- Mirrors with unstable visual behavior
- Fear meter and atmospheric HUD
- Timed fog escalation
- Initial boss/pursuer manifestation and chase
- Desktop browser support

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Design direction

The central rule is:

> uncertainty → pattern recognition → apparent understanding → rule violation → panic

Future systems should preserve causal horror rather than uncontrolled randomness. The maze may deceive players, but each encounter should still have discoverable behavior.

## Next implementation targets

1. Replace basic collision reconstruction with owned chunk collider registration and disposal.
2. Add deterministic room-graph persistence so returning routes can mutate without losing important locations.
3. Build real planar mirror rendering and reflection-only entities.
4. Add audio, footsteps, breathing, directional pursuit cues, and silence events.
5. Add interaction, doors, keys, carried objects, markings, and dropped-item persistence.
6. Add death/restart flow and sector objectives.
7. Add touch controls and performance scaling for mobile.
8. Add automated build checks through GitHub Actions.
