# Frostborn — 15-Level Redesign Proposal

**Status:** Draft, awaiting approval. No code to change until you sign off.

## Design pillars (apply to all 15 levels)

1. **Every level has its own map** — different setting, different silhouette. No reuse of the current square palisade. Reference the Whiteout-ad scenarios in `FrostbornGame/ad-refs/levels.md`.
2. **Production chains are the loop** — fishing, hunting→butcher→grinder, logs→lumber mill→planks, supply sleds. Resources feed buildings, buildings feed the goal.
3. **Workers man stations** — a station idles when empty, produces when manned. Assign by tapping a survivor and then a station, or walk a survivor onto the station tile.
4. **The camp grows** — tents hold a fixed number of survivors (6). Rescuing more than a tent can hold forces a cabin build. Cabins hold 12.
5. **One new mechanic per level**, each one reusing all earlier mechanics. Combat is side pressure, not the point: ≤ 1 in 3 levels (L3 / L6 / L10 / L14 / L15 = 5 of 15).
6. **Shared global tuning** stays: fire fuel, cold meter, warmup grace. Each level tweaks its own balance JSON — nothing structural is touched after a mechanic ships.

---

## Station + building inventory (used across levels)

Each station is a single sprite that accepts a worker. Underlined items are new; the rest already exist.

| Station / Building | Produces | Needs worker? | Input | First introduced |
|---|---|---|---|---|
| Campfire (fire) | heat / anti-freeze | no (player + workers feed) | wood logs | L1 |
| Tent | shelter for 6 survivors | no | 100 coins | L1 |
| Tree (chop point) | 1 log every `treeLogCooldownMs` | yes (hero or worker) | — | L1 |
| __Ice hole__ | 1 raw fish every 6 s | yes | — | L4 |
| __Fish cleaning table__ | 1 clean fish per raw | yes | raw fish | L5 |
| __Cook pot__ | 1 cooked food per clean fish / raw meat | yes | clean fish OR raw meat | L5 |
| __Lumber mill__ | 2 planks per 3 logs | yes | logs | L7 |
| __Cabin__ | shelter for 12 survivors | no | 20 planks + 80 coins | L8 |
| __Hunting trail marker__ | spawns a stag/boar every 45 s | no (hero kills) | — | L10 |
| __Butcher table__ | 2 raw meat per animal carcass | yes | carcass | L10 |
| __Meat grinder (conveyor)__ | 3 ground meat per 2 raw meat | yes | raw meat | L11 |
| __Supply sled stop__ | 200 coins payout every 90 s | yes (loader) | 10 ground meat + 5 planks | L12 |
| __Watchtower__ | spots wolves from 3× range, slows them in arc | yes (lookout) | 15 planks | L14 |

New art needed (not currently in the atlas): ice hole, fish-clean table, cook pot, lumber mill, cabin, hunting trail marker, butcher table, meat grinder, supply sled, watchtower. All can start as placeholder iso cubes until the ad-sheet imports land — gameplay before polish.

---

## Per-level design

### L1 — First Spark

- **Setting:** Ad ref "Starter Base Tutorial (Minimal Build)". Small clearing, one survivor frozen next to a dead pine, one tree, one fire. No walls.
- **Map sketch:**

  ```
     .   T   .
       ⛺?      ← pad lit
     F       ← fire
       🧊       ← one frozen survivor
  ```
  F = fire, T = tree, ⛺? = tent pad outline.

- **Goal chain:** thaw 1 survivor → chop logs → build tent (70 coins).
- **New mechanic:** everything baseline — joystick, fire feeding, thaw, build.
- **Stations / buildings:** 1 tree, 1 tent pad.
- **Assets:** existing (campfire, tent, tree, hero, survivor).
- **Target time:** 2–3 min.

---

### L2 — Logs & Hands

- **Setting:** Slightly larger clearing with 3 trees, a stone ring campsite, broken crate.
- **Map sketch:**

  ```
     T   T   T
      ⛺?  📦
         F
       🧊 🧊 🧊
  ```
  📦 = broken crate (decor).

- **Goal chain:** thaw 3 survivors → build tent → the 3 become **workers**. Workers chop the 3 trees on cooldown.
- **New mechanic:** survivors convert to workers that man the trees. Tapping a survivor and then a tree reassigns them.
- **Stations / buildings:** 3 trees, 1 tent, 3 ring slots (first ring-thaw level).
- **Assets:** existing + crate decor (already in atlas).
- **Target time:** 3–4 min.

---

### L3 — Howl in the Dark *(combat 1/5)*

- **Setting:** Ad ref "Resource Raid / Gathering Run" — open path through pines, no palisade.
- **Map sketch:**

  ```
       T  T     T
         F
      ⛺?        🐺←
       🧊🧊
           🧊
  ```

- **Goal chain:** thaw 3 → build tent → **hunt 2 scout wolves** (first combat).
- **New mechanic:** combat with the hero's axe + the chop animation we just fixed. Wolves charge from off-camera.
- **Stations / buildings:** same as L2; no new building.
- **Assets:** existing (wolf atlas, hero chop anim already in atlas).
- **Target time:** 4–5 min.

---

### L4 — Ice Holes

- **Setting:** Ad ref "Coastal Fishing Base" — a half-frozen lake fills the south of the map. A short pier out onto the ice with 2 drilled holes.
- **Map sketch:**

  ```
       T  T     T
         F  ⛺?
      🧊🧊    (camp north)
     ═══════════════ shore
       ❄ ❄         (ice holes on pier)
         🌊           (open water)
  ```
  ❄ = ice hole station, ═ = pier tiles.

- **Goal chain:** thaw 3 → build tent → **fish 6 raw fish** from the ice holes (station-based).
- **New mechanic:** ice-hole fishing station. A worker stands on it to produce 1 fish / 6 s. Station idles when empty.
- **Stations / buildings:** 2 ice holes, 1 tent, trees.
- **Assets:** new → ice hole sprite, pier tile, water tile, raw fish item.
- **Target time:** 5–6 min.

---

### L5 — Clean & Cook

- **Setting:** Fishing camp expanded. Add a wooden cleaning table and a small cook pot between the fire and the shore.
- **Map sketch:**

  ```
       T  T
         F  ⛺?
         🪓  🥘        (butcher-style table + pot)
      🧊🧊🧊
     ═══════
       ❄ ❄
  ```

- **Goal chain:** thaw 4 → fish 4 raw → **clean 4 at the table → cook 4 at the pot** → serve 4 cooked meals.
- **New mechanic:** two-step chain. Raw fish → clean fish → cooked food. Each station needs a worker.
- **Stations / buildings:** cleaning table, cook pot.
- **Assets:** new → cleaning table, cook pot. Food icon.
- **Target time:** 6–7 min.

---

### L6 — Something Under the Ice *(combat 2/5)*

- **Setting:** Fishing camp with a cracked ice sheet. Ad ref "Coastal Fishing Base (Shark Threat)".
- **Map sketch:**

  ```
       F  ⛺?
      🪓 🥘
     ═════════
      ❄    ❄
         🦈           (frost shark lurking under ice)
  ```

- **Goal chain:** fish 6 → cook 4 → **kill the frost shark** (breaches 3 times, must be hit each time).
- **New mechanic:** boss encounter at a fishing station. The shark breaches an ice hole, hero must get to it within 3 s and strike before it dives.
- **Stations / buildings:** same L5.
- **Assets:** new → frost shark sprite + breach animation.
- **Target time:** 7–8 min.

---

### L7 — Timber

- **Setting:** Forest clearing with a tilted lumber mill, log pile, two trees, and the base tent to the east.
- **Map sketch:**

  ```
     T  T  T
        ⚙     (lumber mill)
       📜    (plank pile)
     F ⛺?
       🧊🧊
  ```
  ⚙ = lumber mill, 📜 = planks output.

- **Goal chain:** thaw 4 → build tent → chop 12 logs → **run mill to produce 8 planks**.
- **New mechanic:** lumber mill — consumes 3 logs, produces 2 planks, needs a worker standing at the control wheel.
- **Stations / buildings:** lumber mill (new), tree ×3, tent.
- **Assets:** new → lumber mill sprite, plank item sprite.
- **Target time:** 7–8 min.

---

### L8 — First Cabin

- **Setting:** Bigger camp with a tent already standing, a cabin footprint marked, and the mill from L7.
- **Map sketch:**

  ```
       T   T   T
         ⚙
      ⛺   🏠?   ← cabin pad
         F
       🧊🧊🧊🧊🧊🧊🧊🧊
  ```

- **Goal chain:** thaw **8 survivors** (exceeds tent capacity of 6) → **build cabin** (20 planks + 80 coins) to shelter the extra 2.
- **New mechanic:** shelter capacity. Tents hold 6. Going over forces a cabin build.
- **Stations / buildings:** cabin pad, tent, mill, trees.
- **Assets:** new → cabin iso sprite + two build stages.
- **Target time:** 8–9 min.

---

### L9 — Crew

- **Setting:** Mature camp. Multiple trees, mill, fish holes to the south. First level where more than one worker production chain runs in parallel.
- **Map sketch:**

  ```
       T T T
         ⚙
        ⛺🏠
         F
        🪓 🥘
       ═════
        ❄❄
  ```

- **Goal chain:** thaw 6 → **assign workers**: 1 at mill, 1 at cleaning, 1 at cook → fulfil a "camp quota" (10 planks + 6 cooked).
- **New mechanic:** explicit worker assignment UI. Tap a survivor-sprite → tap a station highlight → survivor walks there and clocks in.
- **Stations / buildings:** mill, cleaning, cook, ice holes.
- **Assets:** existing from L4/L5/L7 + a small "manned" indicator over stations.
- **Target time:** 9 min.

---

### L10 — Hunting Trail *(combat 3/5)*

- **Setting:** Forest clearing with a game trail running north-south and a butcher table under a lean-to. Ad ref "Resource Raid" + hunting.
- **Map sketch:**

  ```
       T  🦌?         (stag spawn point)
        ⛺🏠
         F
        🔪             (butcher table)
       🦌?             (stag spawn point)
  ```
  🦌? = animal spawn, 🔪 = butcher.

- **Goal chain:** thaw 4 → **hunt 3 stags** on the trail → **butcher** → produce 6 raw meat → cook into 4 meals.
- **New mechanic:** hunting trail + butcher table (first non-fish food chain). Stags/boar spawn periodically at marked points, hero kills them, carcass is dragged to butcher.
- **Stations / buildings:** butcher table, trail markers.
- **Assets:** new → stag atlas (walk + flee + hit), carcass item, butcher table.
- **Target time:** 9–10 min.

---

### L11 — Grinder

- **Setting:** Industrial feel — the butcher from L10 is now feeding a conveyor+grinder. Ad ref "Meat Processing Factory".
- **Map sketch:**

  ```
       ⛺🏠
         F
        🔪─▶⚙⚙─▶🍖   (conveyor from butcher to grinder to meat pile)
  ```

- **Goal chain:** hunt 4 stags → butcher 8 raw meat → **grinder** turns 2 raw into 3 ground meat → stockpile 12 ground meat.
- **New mechanic:** grinder = multiplier station (upgraded "cook" throughput). Needs a worker and a continuous raw-meat feed.
- **Stations / buildings:** grinder (new), conveyor decor (purely cosmetic, no collision).
- **Assets:** new → grinder sprite + animated wheel, conveyor tile strip, meat chunks.
- **Target time:** 10 min.

---

### L12 — Supply Sled

- **Setting:** Camp with a road leading off the map's east edge, with a sled loading dock at the edge.
- **Map sketch:**

  ```
       ⛺🏠🏠
         F
       🔪⚙
             🛷→   (supply sled waits at east edge road)
  ```

- **Goal chain:** fulfil **2 supply runs** — each run needs 10 ground meat + 5 planks loaded onto the sled. Each run pays 200 coins back when the sled departs.
- **New mechanic:** supply sled — the first "export" station. The sled sits for 10 s, workers load it, then departs off-screen. Coins land after it leaves.
- **Stations / buildings:** sled dock (new).
- **Assets:** new → supply sled sprite + wheel anim, dock planks.
- **Target time:** 11 min.

---

### L13 — Village

- **Setting:** Bigger multi-building layout — 2 tents, 2 cabins, full production floor. Ad ref "Base Build Progression (City Scale)" but at survival-camp tier.
- **Map sketch:**

  ```
       ⛺⛺🏠🏠
            F
         🪓🥘⚙⚙🔪
         ❄❄         🛷→
  ```

- **Goal chain:** thaw 14 survivors → build second tent + second cabin → run 1 supply run of each product (fish + meat).
- **New mechanic:** no new mechanic — **reuse pressure**. First level where all earlier systems have to run in parallel without new tutorialisation.
- **Stations / buildings:** everything previous.
- **Assets:** existing.
- **Target time:** 12 min.

---

### L14 — Night Watch *(combat 4/5)*

- **Setting:** Camp from L13 at dusk. Ad ref "Base Under Siege". Watchtower stands at the north edge.
- **Map sketch:**

  ```
      🗼              (watchtower)
       ⛺⛺🏠🏠
            F
         🪓🥘⚙⚙🔪
         ❄❄         🛷→
       🐺 🐺 🐺     (wolf wave entering from north)
  ```

- **Goal chain:** survive a **wolf wave of 6** (over 90 s) while workers stay at stations. Watchtower slows wolves in its arc by 40 %. Also need to complete 1 supply run during the raid.
- **New mechanic:** defender wave with a time-gated end. Workers at stations keep producing even while hero fights.
- **Stations / buildings:** watchtower (new) + everything.
- **Assets:** new → watchtower iso sprite + lookout survivor pose.
- **Target time:** 13–14 min.

---

### L15 — Grand Alpha *(combat 5/5)*

- **Setting:** Full camp at the ridge. Grand Alpha spawns south of the gate. Blizzard particles. Ad ref "Giant Creature Attack" scaled to wolf-tier.
- **Map sketch:**

  ```
      🗼  🗼
       ⛺⛺🏠🏠🏠
            F
         🪓🥘⚙⚙🔪
         ❄❄         🛷→
            👑        (Grand Alpha spawn)
  ```

- **Goal chain:** thaw 12 → run supply chain so every station is active → **kill the Grand Alpha** after it summons 4 beta wolves at 50 % HP → survive one 60-s blizzard.
- **New mechanic:** blizzard event (2× fuel drain + freeze meter rises). Reuse of Grand Alpha + beta wolves + full chain as the climax.
- **Stations / buildings:** everything.
- **Assets:** existing Grand Alpha + beta wolves + blizzard particles (all in atlas).
- **Target time:** 14–15 min.

---

## Rollout order (if you approve)

1. **Buildings + stations module** — generalise "station needs worker, produces X" so adding L4 onward is JSON-level not engine-level. ~2 days.
2. **Resource system** — raw fish, clean fish, cooked food, raw meat, ground meat, planks as transportable items with carry slots. ~2 days.
3. **L1–L3 refresh** — rebuild level JSONs on the new station system, drop single-file follower trail (already done). ~0.5 day.
4. **L4 + L5 + L7** — fishing / cook-pot / lumber mill. Needs placeholder art first. ~2 days art + 1 day code.
5. **L8–L12** — cabin, assignment UI, hunting, grinder, sled. ~4 days.
6. **L13–L15** — full-stack remakes. ~3 days.

Total rough estimate: **~2 weeks** of focused work. Half of that is asset production (ad-sheet imports) and half is code. Playtesting runs the normal 15-level bot pass after each wave.

---

## Open questions for your sign-off before anyone writes code

1. Are the 5 combat levels (L3, L6, L10, L14, L15) the right cadence, or do you want more/fewer?
2. Any level you want to swap out (e.g. different setting, different mechanic)?
3. Should the station worker assignment be **tap-and-tap** or **walk-to-station** only? Tap-and-tap is faster but needs new UI.
4. Grinder/conveyor is cosmetic conveyor + one tile station — ok, or do you want the belt to actually move items visually across tiles?
5. Supply sled payout: 200 coins per run feels generous. Ok?
6. For the watchtower slow-down arc: is 40 % enough or do you want it to also do damage?
