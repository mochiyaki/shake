# San Francisco Earthquake Simulator

An interactive 3D earthquake prediction simulator for the San Francisco Bay Area, rendered entirely in the browser with **Three.js**. The project lives in a single self-contained file (`index.html`) with no build step — open it and it runs.

![screenshot](https://raw.githubusercontent.com/mochiyaki/shake/master/quake_hayward.png)

## earthquake prediction simulator - SeismicAlert
https://earthquake-prediction-simulator-40258272502.us-west2.run.app/

## earthquake simulator - San Francisco historical records walkaround
https://mochiyaki.github.io/app5/

```
┌──────────────────────────────────────────────────────────────────┐
│                          index.html                              │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│   │   HTML /   │  │   CSS UI   │  │  Three.js  │  │  Web Audio │ │
│   │  Markup    │  │   (HUD)    │  │   Scene    │  │   Engine   │ │
│   └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
│                                                                  │
│   Boot  →  Load Scenario  →  Animate Loop  →  Render Frame       │
└──────────────────────────────────────────────────────────────────┘
```

## earthquake house simulator - QUAKE-SIM v4.0
https://earthquake-house-simulator-40258272502.us-west2.run.app

---

## Overview

The simulator models the San Francisco Bay Area as a procedurally generated heightfield projected from real longitude/latitude coordinates, then visualises four historically-grounded earthquake scenarios as propagating seismic waves, ground shaking, and Modified Mercalli Intensity (MMI) heatmaps.

It is a single-file, zero-dependency (besides a CDN-hosted Three.js) application. Everything — terrain, faults, buildings, audio — is generated procedurally in the browser.

---

## Features

* **3D Bay Area terrain** — 180×160 vertex heightfield built from a procedural DEM covering ~79 × 72 km of real geography (Pacific Ocean, SF Bay, Marin Hills, Peninsula, East Bay, Diablo Range).
* **Four earthquake scenarios**:
  * M 6.9 — 1989 Loma Prieta
  * M 7.9 — Northern San Andreas ("The Big One")
  * M 7.0 — Hayward Fault
  * M 6.5 — Calaveras Fault
* **Three propagating wavefronts** — P-wave, S-wave, and surface wave rendered as expanding rings with per-frame ground displacement.
* **MMI intensity heatmap** — 40×40 grid of cells coloured by PGA-derived intensity across the entire map.
* **Procedural city skylines** — Instanced building meshes for Downtown SF, SOMA, Oakland, San Jose, Hayward.
* **Cinematic director camera** — Auto-tour keyframes with smooth interpolation; user can take over with mouse and resume.
* **Web Audio synthesis** — Ambient drone, sub-bass, surface-wave rumble, P-wave thump, S-wave boom, aftershock crackle. All synthesised at runtime — no audio files.
* **HUD panels** — Title, scenario picker, legend, live seismograph telemetry, caption bar, timeline scrubber, speed control.

---

## Architecture

```
                        ┌────────────────────────────────────────┐
                        │            Browser Window              │
                        │                                        │
   ┌─────────┐          │   ┌──────────────────────────────┐     │
   │  User   │  click ──┼──►│  DOM HUD Layer (z=6,7,8)     │     │
   │ Input   │          │   │  • Title    • Scenarios      │     │
   │(mouse,  │  drag  ──┼──►│  • Legend   • Telemetry      │     │
   │ buttons)│          │   │  • Caption  • Controls       │     │
   └─────────┘          │   │  • Boot     • Resume hint    │     │
                        │   └──────────────────────────────┘     │
                        │              ▲ │                       │
                        │              │ ▼ events                │
                        │   ┌──────────────────────────────┐     │
                        │   │      ES Module (index.html)  │     │
                        │   │                              │     │
                        │   │  §1 Geography  §2 Setup      │     │
                        │   │  §3 Terrain    §4 Faults     │     │
                        │   │  §5 Landmarks  §6 Buildings  │     │
                        │   │  §7 Scenarios  §8 Waves      │     │
                        │   │  §9 Heatmap    §10 State     │     │
                        │   │  §10b Audio    §11 Director  │     │
                        │   │  §12 Loader    §13 Shake     │     │
                        │   │  §14 Phases    §15 Telemetry │     │
                        │   │  §16 Director  §17 UI        │     │
                        │   │  §18 Loop      §19 Resize    │     │
                        │   │  §20 Boot                    │     │
                        │   └──────────────────────────────┘     │
                        │         ▲                ▼             │
                        │   ┌──────────┐    ┌──────────────┐     │
                        │   │ Three.js │    │  Web Audio   │     │
                        │   │ r160 CDN │    │     API      │     │
                        │   └──────────┘    └──────────────┘     │
                        │                                        │
                        └────────────────────────────────────────┘
```

### Layer Model

The DOM is split into fixed z-stacked layers:

| z-index | Layer       | Purpose                                              |
|---------|-------------|------------------------------------------------------|
| 0       | `#scene`    | WebGL canvas (Three.js renderer)                     |
| 2       | `#labels`   | CSS2DRenderer DOM overlay (city / fault / epicenter labels) |
| 6       | HUD panels  | Title, scenarios, legend, telemetry, caption        |
| 7       | `#controls` | Timeline scrubber + play button                      |
| 8       | `#resume`   | "Resume simulation" pill (shown after user override) |
| 50      | `#boot`     | Loading screen (auto-removed after first frame)      |
| 60      | `#err`      | Fatal-error overlay (shown if a module throws)       |

---

## Project Structure

This project is intentionally a single file. There is no `package.json`, no `node_modules`, no bundler.

```
.
├── index.html      # entire application — HTML, CSS, and ES module JS
└── README.md       # this file
```

### Single-file organisation

`index.html` is structured as 20 numbered sections, each delimited by a banner comment:

| §  | Section              | Responsibility                                                  |
|----|----------------------|------------------------------------------------------------------|
| 1  | Geography            | BBOX constants, lng/lat → world-XY, `elevation(lng, lat)`        |
| 2  | Three.js Setup       | Scene, camera, WebGLRenderer, CSS2DRenderer, OrbitControls, lights |
| 3  | Terrain Mesh         | PlaneGeometry, per-vertex elevation, per-vertex HSL colours      |
| 4  | Fault Lines          | San Andreas, Hayward, Calaveras, San Gregorio polylines + glow   |
| 5  | Landmarks / Cities   | Places array, CSS2D labels, per-place distance cache             |
| 6  | Buildings            | `addCityCenter()` — InstancedMesh skylines                      |
| 7  | Scenarios            | Four pre-defined earthquake presets                              |
| 8  | Wave Visualisation   | P / S / surface rings, epicenter tower                          |
| 9  | MMI Heatmap          | 40×40 InstancedMesh grid; coloured by PGA-derived MMI           |
| 10 | Simulation State     | `sim` object, `epiToWorld()`, `pgaAt()`, `pgaToMMI()`, `mmiColor()` |
| 10b| Audio Engine         | Web Audio API — ambient drone, surface rumble, P/S/aftershock cues |
| 11 | Director Camera      | Keyframe table + lerp helpers                                   |
| 12 | Load Scenario        | Resets sim, positions epicenter, recomputes heatmap, primes audio |
| 13 | Per-frame Shake      | `shakeTerrain()` (wavefront-gated) and `shakeBuildings()`       |
| 14 | Phase Logic          | `currentPhase()`, caption show/hide                              |
| 15 | Telemetry            | Live Phase / Magnitude / Elapsed / MMI / PGA readouts           |
| 16 | Director Driver      | Camera interpolation with user-override detection               |
| 17 | UI Wiring            | Button / progress / speed / audio handlers                       |
| 18 | Animation Loop       | `animate()` — requestAnimationFrame driver                       |
| 19 | Resize               | Responsive camera + renderer resize                             |
| 20 | Boot                 | First render, then fade `#boot`, auto-load Loma Prieta          |

---

## Workflow

### Boot sequence

```
   Page loads
       │
       ▼
   importmap resolves "three" → unpkg CDN
       │
       ▼
   ES module script executes (top-down)
       │
       ├── §1  Build BBOX and elevation() function
       ├── §2  Create scene, camera, renderer, controls, lights
       ├── §3  Build terrain mesh + vertex colours
       ├── §4  Add fault polylines + fault labels
       ├── §5  Add place labels, init placeDists cache
       ├── §6  Build procedural building skylines
       ├── §7  Define SCENARIOS object (4 presets)
       ├── §8  Create wave rings + epicenter group
       ├── §9  Create heatmap InstancedMesh
       ├── §10 Define sim state, pgaAt(), pgaToMMI(), mmiColor()
       ├── §10b Define Audio module (no init yet — needs user gesture)
       ├── §11 Define DIRECTOR keyframes
       └── §20 Render once → requestAnimationFrame
                │
                ▼
           Fade out #boot overlay, remove from DOM
                │
                ▼
           loadScenario('loma_prieta')  ◄── auto-start
                │
                ▼
           animate() loop begins
```

### Per-frame animation loop

```
   requestAnimationFrame ──► animate(dt)
                                 │
                                 ├── if sim.playing:
                                 │       sim.time += dt * sim.speed
                                 │       shakeTerrain()           ← wavefront-gated displacement
                                 │       shakeBuildings()         ← sinusoidal jitter
                                 │       updateTelemetry()        ← MMI / PGA at downtown SF
                                 │       setProgress(sim.time)    ← scrubber fill
                                 │       updateAudio()            ← per-place cues + rumble
                                 │       maybe showCaption(phase) ← on phase change
                                 │
                                 ├── pulse epicenter ring & beam
                                 ├── updateDirector(dt)           ← auto camera, unless override
                                 ├── controls.update()            ← damping
                                 ├── renderer.render(scene, cam)
                                 └── labelRenderer.render(scene, cam) ← CSS2D labels
```

### Earthquake simulation per scenario

```
   loadScenario(key)
       │
       ├── sim.scenario ← SCENARIOS[key]
       ├── sim.time ← 0, sim.playing ← true
       │
       ├── Position epicenter (tower + ring origin) from s.epicenter [lng, lat]
       │     lng/lat → u,v via lngLatToXY()
       │     u,v    → world (x,z) via BBOX × WORLD_W/H
       │     y      ← elevation(lng, lat) × EXAG + offset
       │
       ├── Update heatmap geometry to current map scale
       ├── Update heatmap colours: for each cell compute
       │     dist3D = √(distKm² + depthKm²)
       │     pga    = pgaAt(M, dist3D)
       │     mmi    = pgaToMMI(pga)
       │     colour = mmiColor(mmi)
       │
       ├── Update telemetry HUD: M, epicenter, phase, MMI, PGA
       ├── Show first phase caption
       │
       ├── Audio.reset()  → Audio.startSurface()
       │     brown noise → bandpass(60 Hz) → WaveShaper(tanh)
       │     + 4.3 Hz LFO for shudder
       │
       ├── Recompute per-place distances from epicenter (km)
       │
       └── Build aftershock schedule:
             n = 3 + floor(M − 5)  events in 55–90 s window,
             intensity decaying each event
```

### Wavefront model

The simulator uses three concentric wavefronts, each expanding at a different velocity:

| Wave    | Velocity (world units / sim-s) | Real-world approx. | Visualisation            | Audio                |
|---------|--------------------------------|--------------------|---------------------------|----------------------|
| P-wave  | 6.0                            | ~6 km/s            | Cyan ring, narrow pulse   | Short "thump"        |
| S-wave  | 3.5                            | ~3.5 km/s          | Coral ring, larger pulse  | Loud "boom"          |
| Surface | 3.0                            | ~3 km/s            | Teal ring, broad pulse    | Continuous rumble    |

For each terrain vertex we compute `dist = |XZ − epicenterXZ|`. A pulse window (e.g. `|dist − pFront| < 1.5`) gates a vertical displacement scaled by `M / 7` and a distance-decay term.

### PGA → MMI mapping

PGA (peak ground acceleration) is computed per cell via a simplified Boore/Joyner attenuation:

```
log₁₀(PGA) = 0.25·M − 1.2·log₁₀(R) − 0.6     (PGA in g, R = hypocentral distance in km)
```

Then a piecewise lookup converts PGA to Modified Mercalli Intensity (I–X), which maps to a 5-stop colour ramp (green → yellow → orange → red → dark red).

---

## Scenarios

| Key                | Magnitude | Epicenter (lng, lat)        | Depth | Rupture | Notes                          |
|--------------------|-----------|------------------------------|-------|---------|---------------------------------|
| `loma_prieta`      | 6.9       | −121.638, 37.040             | 18 km | 40 km   | Historical — 1989 World Series  |
| `san_andreas_north`| 7.9       | −122.40, 37.75               | 10 km | 470 km  | "The Big One" — worst-case     |
| `hayward`          | 7.0       | −122.18, 37.74               | 12 km | 80 km   | Most likely scenario for East Bay |
| `calaveras`        | 6.5       | −121.82, 37.55               |  8 km | 30 km   | Southern East Bay / Silicon Valley |

Each scenario defines 5 timed *phases* that drive the caption bar and an implicit `currentPhase()` lookup for the telemetry "Phase" field.

---

## HUD Reference

| Element             | Purpose                                                                |
|---------------------|-------------------------------------------------------------------------|
| Title panel         | Project name, credit, audio toggle                                       |
| Scenarios panel     | Four scenario buttons (active state highlighted)                       |
| Legend              | Colour swatches for waves, terrain types, MMI bands                    |
| Seismograph panel   | Live Phase / Magnitude / Epicenter / Elapsed / Local MMI / PGA est.    |
| Caption             | Auto-appears at each phase boundary (auto-hides 8 s later)             |
| Controls            | Play / pause, scrubbable progress bar with phase markers, speed toggle |
| Resume pill         | Re-enables director camera after the user grabs it                     |

---

## Running

This is a single static file. No build, no install. Serve it over HTTP (ES modules + importmap require a server origin):

```bash
# Python (any version)
python3 -m http.server 8000

# Node.js
npx serve .

# Or just open directly if your browser allows file:// modules
```

Then visit `http://localhost:8000/`.

The boot screen shows for ~1 frame, then the Loma Prieta scenario auto-loads.

### Requirements

* Modern browser with WebGL 2 and ES module support.
* Three.js **r160** loaded from `https://unpkg.com/three@0.160.0/`.
* Audio requires a user gesture to unlock (browsers' autoplay policy). Click the 🔇 Audio button to enable.

---

## Technical Notes

* **Vertical exaggeration** is `EXAG = 0.06` so 1000 m peaks render as 60 world units — readable from the default camera.
* **World scale** — 1 world unit ≈ 0.5 km at the chosen BBOX. The plane is 200 × 178 units.
* **Mesh resolution** — terrain uses a `180 × 160` vertex grid; heatmap uses `40 × 40` instanced quads; buildings use `InstancedMesh` per city.
* **Performance** — vertex normals on the terrain are recomputed every other frame only when shake changes are present (`shakeNormalsDirty` toggle).
* **No external assets** — terrain, faults, buildings, audio are all procedural. The only network fetch is the Three.js ES module from unpkg.
* **Determinism** — the elevation function is deterministic; building placement uses seeded pseudo-random per city (`seed * 9301 + 49297` LCG), so the same city always generates the same skyline.

---

## Possible Extensions

* Real DEM data (e.g. USGS SRTM tiles) instead of the procedural heightfield.
* Real fault geometry from the USGS Quaternary Fault database.
* Tom Parker / Bay Area velocity model for more accurate wave propagation.
* Per-cell liquefaction / landslide susceptibility overlay.
* Export current scenario as a short MP4 / GIF replay.
