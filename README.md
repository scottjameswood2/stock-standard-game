# Stock Standard: The Game — Phase 1 (The Colac Cup)

A stylised third-person pub-rock party sim about Stock Standard. It runs in any modern browser,
is built with Three.js r170 (vendored in this folder, so there's no CDN or build step), and all
music is synthesised live with WebAudio.

## Run it locally
Any static web server works; it only needs to serve this folder. For example:

```bash
cd stock-standard-game
python3 -m http.server 8000
# open http://localhost:8000
```

You can't open `index.html` straight from disk (`file://`), because ES modules and `.glb`
loading need a server.

## Deploy
- **Replit:** create a new Repl from the "HTML, CSS, JS" template, upload the contents of this
  folder (keep the folder structure) and press Run. Replit serves `index.html` as a static
  site. To publish, use Deploy → Static and set the public directory to `/`.
- **Netlify / Vercel / GitHub Pages / Cloudflare Pages:** drag the folder in, or point the
  service at the repo. There's no build command and the publish directory is the root.
- **Any web host:** upload everything as-is.

## Skipping
Every phase has a **Skip** button (top right): skip load-in, skip soundcheck, skip to the next song (one click; after the last song it goes straight to pack-up), end the set break, skip pack-up, or skip the rest of the burgers. A **Skip to feedback 🍔** button jumps straight to the Feedback Burger Circle from any phase. Songs run about 30–40 seconds each.

Buns, patties and lemons are unlimited, and anyone can throw lemons. Press **V** (or the 🔭 button) to toggle a zoomed-out overview camera.

## Controls
| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Walk / run | WASD, Shift | Left stick |
| Look | Drag mouse, or click to lock the pointer. Wheel zooms. | Right stick |
| Interact / pick up / deliver | E | A |
| Throw (1 bun · 2 patty · 3 lemon) | F | X / LT |
| Cross arms · phone out | C (hold) · P | — |
| Swap bandmate | Tab | Back |
| Ability | Q | B |
| Rhythm lanes | D F J K | LB, LT, RT, RB |
| Solo Skull pour tilt | W / S | D-pad up / down |
| Accept request · stomp setlist | R · Space | Y |
| Pause / settings | Esc | Start |

## What's in Phase 1
- **Lineup of Five:** one member per slot. Dunny can fill bass or drums. Synergies light up
  live. There's an 18% chance someone "pulled out sick" (never Dave Stockman). Click a selected
  member again to play as them. Tab swaps bandmates during free roam.
- **Load-in:** carry gear from the van to the semi. Heavy gear slows you down. *Help a Mate*
  prompts appear when someone's struggling (usually the drummer). The racegoers get in the way.
- **Soundcheck:** Jamie calls each member in turn, and you get plug-in, tune and level
  mini-games on your turn. Touch D F J K / Space during someone else's check and you get
  "ONE AT A TIME!" plus a quieter mix. Shouting Jamie a beer first boosts your channel.
- **The Gig:** two sets as a 4-lane rhythm game. The band plays live, you play your member's
  part, and missed notes drop your part out of the mix.
  - **Crowd Energy:** rises when you nail notes, drops on mistakes.
  - **Request cards:** play a request and the punter shouts the band a round.
  - **Hazards:** a horse race turns the crowd around, the truckie honks, wind blows the setlist
    away (and maybe Dunny's beret), and feedback squeals (Jamie fixes it faster if he likes you).
  - **Abilities:** Dave Young's Climb Anything and Crowd Run (untangle the mic lead), Chris
    White's Into the Crowd (high-fives), Double Trouble when both are out (Scotty must cover),
    Scotty's Solo Skull (any song, once per song) and Solo Extension (overdo it and the patties fly). All special moves work any time during a song, Steve Smart and Dave Stockman's
    Rock Solid, and Ant Lewis's Full Tank.
  - **The Solo Skull:** the closer's 16-bar solo. The singer controls the pour tilt and Scotty's
    note hits set how fast he can gulp. Finish the beer and the solo cleanly for the biggest
    bonus in the game; spill too much and the guitar gets a beer bath.
- **Set break (free roam):**
  - The bar: queues (James Huntersmith sees the shortest), shouts, water and snags.
  - Carrying drinks: they slosh, bumps spill them, and anyone you leave out of a shout sulks.
  - The bookie: bet Mateship on the race.
  - Canapé Stance: stand still, face the waitstaff, arms by your sides, phone away.
  - Canapé runs: remember who's vegetarian.
  - Punters: high-fives, selfies, tips, rounds and skol-offs.
  - Hayden's Lemon Launcher: car alarms, wipers and honks, Lemon Streak, Heat, then security.
  - Rain might hit: tarp the gear.
- **Pack-up:** Buzz makes controls wobbly. Wrap leads over-under (mess it up and the drummer
  fumes), find the glowing lost capo, peel the setlist off the floor and load the van.
- **Feedback Burger Circle:** build a burger for each bandmate and Jamie from feedback chips
  generated from what actually happened.
  - Accurate chips score; decoy chips (things that didn't happen) cost you.
  - A balanced burger, or a classic bun-patty-bun, earns a bonus.
  - All buns gives you **Too Soft**; all patties gives you **Too Harsh**.
  - Burgers taller than 7 collapse.
  - You then receive burgers. Buns become buffs and patties become practice challenges for the
    next gig (saved in your browser).
- **Results & progression:**
  - Stars earn Racecourse reputation and unlock items such as alternate berets and outfits.
  - 13 achievements, including the hidden *When Life Gives You Lemons*, *The Hoverer* and
    *Beret Beat*.

## Project structure
```
index.html             entry (import map → vendor/three)
data/roster.json       ← members, stats, abilities, synergies (tweak freely)
data/songs.json        ← in-game songs, sets, request pool (charts are generated from these)
assets/characters/     13 rigged characters (.glb, 25 animation clips each)
assets/props/          33 props incl. van, car, ute, horse
assets/env/            colac_cup.glb (world + markers + colliders + walkable surfaces)
assets/previews/       preview renders
src/main.js            Game orchestrator and main loop
src/core/              engine, input, audio (SFX), music (band synth and charts), assets
src/scenes/            colacCup.js (world, cars, horses, collision, ground)
src/entities/          actor, band AI, NPCs (crowd, waitstaff, security), player and camera
src/systems/           state (meters, log, achievements, save), interactions, drinks/shouts,
                       throwables, free-roam (bar, bookie, canapés, punters, beret)
src/phases/            the gig-day state machine: loadin, soundcheck, gig (+ rhythm),
                       setbreak, packup, burger, results (index.js lists the order)
src/ui/                HUD, lineup and title, pause, DOM helpers, styles
tools/assetgen/        procedural asset generator (three.js → GLTFExporter); see its README
blender/import_all.py  imports every .glb into Blender and saves a .blend per asset
CONTRACT.md            asset ⇄ game interface (joint names, sockets, clip names, markers)
```

## Where the assets came from
The art style was signed off on a Blender render made through the Blender MCP. Blender
crashed partway through the night and the MCP connection didn't come back, so every Phase 1
asset was generated from code instead: the same chunky shapes, proportions and palette, built
with three.js and exported as real `.glb` files with materials and animations.

To edit them in Blender:
1. Run `blender --python blender/import_all.py`, or open Blender and run the script from the
   Scripting tab.
2. It imports each `.glb` and saves a matching `.blend` next to the script.
3. Export your edits back over the `.glb` in `assets/`, keeping the joint, socket and marker
   names from `CONTRACT.md`.

To regenerate everything from code, see `tools/assetgen/README.md`.

## Performance notes
- **Characters:** each is one vertex-coloured skinned mesh (one draw call) on a shared skeleton
  layout, with fixed bounding spheres for frustum culling.
- **Animation LOD:** far-away punters update their skeletons every 2nd or 4th frame.
- **Textures and lighting:** there are almost no textures (colour is baked into vertex colours)
  and only one shadow-casting sun, which follows the player.
- **Next steps for big crowds:** GPU-instanced skinned crowd (VAT or InstancedMesh with baked
  poses), KTX2 textures and mesh LODs.
- **Debug:** `?ts=4` runs game logic 4× faster.

## Tweaking
- **Stats, abilities and synergies:** edit `data/roster.json`.
- **Members without likeness models yet** (Ant Lewis, Steve Smart, James Huntersmith, Dave
  Stockman): they use a recoloured stand-in (`model` + `tint`) until their Phase 2 models land.
- **Songs:** edit `data/songs.json` (BPM, key, sections, chords). `soloSkull: true` marks the
  Solo Skull song.
- **Difficulty, volume, voice lines:** set from the pause menu (Esc).

## Not yet built (later phases)
- Likeness models for the Phase 2 members
- Pulling a punter on stage
- Online and local 5-player co-op. Phase 1 is solo with AI bandmates; Tab hands control
  between members, and the Solo Skull's two inputs are both yours when you play Scotty or the
  singer.
- The Yarra Valley wedding and the Big Pub Gig
- The combined campaign finale
