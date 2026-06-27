# Agent Office Prototype

Teamly-style agent workspace prototype with a real Three.js room, orbit camera, animated agents, task states, roster controls, and live activity.

## Run

```bash
npx http-server . -p 4173
```

Then open:

```txt
http://127.0.0.1:4173
```

## Assets

The downloaded 3D character reference pack is Kenney Blocky Characters.

- Source: https://kenney.nl/assets/blocky-characters
- License: Creative Commons Zero, CC0
- Local license copy: `assets/kenney/License.txt`

## Implementation Notes

- `app.js` uses `OrbitControls`, so the room can be rotated, panned, and zoomed.
- Agents are procedural blocky rigs with separate head, face, arms, and legs.
- Agent states drive walking gait, hand motion, blinking, mouth movement, bobbing, bubbles, and activity.
- This is a live 3D version of the same product idea Teamly uses visually. Teamly's production site uses pre-rendered PNG/WEBM sprites, while this prototype uses code-driven Three.js rigs for controllable animation.
