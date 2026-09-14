# Asteroids

Browser arcade Asteroids built with React + Vite. No backend. High scores persist in IndexedDB.

## Run

```bash
npm install
npm run dev
```

## Crew (local multiplayer)

Same origin, two tabs. Host authority. Shared 5 lives (extras at 10k). No friendly fire.

```
/?mp=1&role=host
/?mp=1&role=player&room=local
```

Menu has a Crew (local) button. TeemCare Channel wiring is documented in `docs/channel-asteroids-adapter.md`.


- `A` / `D` or arrows: rotate
- `W` or up: thrust
- `Space`: fire (once per second)
- `H`: hyperspace
- `P`: pause
- `M`: mute
