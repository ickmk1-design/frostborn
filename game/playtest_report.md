# Frostborn Automated Playtest Report

Generated: 2026-11-12 06:34:33  |  Platform: WebKit headless (Playwright)  |  Viewport: 393×852

---

## Summary Table

| # | Name | Time | Target | vs Target | Deaths | Issues | FPS avg | FPS min |
|---|------|------|--------|-----------|--------|--------|---------|---------|
| L1 | Level 1: The Camp | 1.6 min ✅ WIN | 3–4 min | 81s fast | 0 | 2 | 54.4 | 11 |
| L2 | Level 2: The Hunting Ground | 2.9 min ✅ WIN | 5–6 min | 124s fast | 0 | 2 | 55.6 | 17 |
| L3 | Level 3: Frozen Valley | 1.4 min ✅ WIN | 5–6 min | 219s fast | 0 | 2 | 47.2 | 18 |
| L4 | Level 4: The Alpha's Den | 4.1 min ✅ WIN | 7–8 min | 176s fast | 2 | 8 | 49.6 | 18 |
| L5 | Level 5: The Blizzard's Edge | 9.5 min ✅ WIN | 7–8 min | 92s slow | 0 | 7 | 62.5 | 35 |
| L6 | Level 6: Ice Storm | 10.0 min ❌ DNF | 7–8 min | — | 0 | 12 | 61.7 | 35 |
| L7 | Level 7: Dead Pines | 5.0 min ✅ WIN | 9–10 min | 241s fast | 1 | 4 | 61.4 | 35 |
| L8 | Level 8: The Pack | 4.6 min ✅ WIN | 9–10 min | 263s fast | 1 | 3 | 61.7 | 35 |
| L9 | Level 9: The Forsaken Ridge | 2.6 min ✅ WIN | 9–10 min | 386s fast | 1 | 1 | 61.0 | 46 |
| L10 | Level 10: The Second Alpha | 5.3 min ✅ WIN | 12–15 min | 404s fast | 2 | 9 | 61.6 | 35 |
| L11 | Level 11: The Last Fire | 5.9 min ✅ WIN | 12–15 min | 364s fast | 1 | 4 | 61.8 | 35 |
| L12 | Level 12: Ash and Ice | 10.1 min ❌ DNF | 12–15 min | — | 0 | 10 | 43.2 | 6 |
| L13 | Level 13: The Hunger | 10.1 min ❌ DNF | 12–15 min | — | 4 | 25 | 48.2 | 8 |
| L14 | Level 14: Twilight of Ice | 10.1 min ❌ DNF | 12–15 min | — | 3 | 17 | 40.9 | 7 |
| L15 | Level 15: Winter's End | 10.0 min ❌ DNF | 12–15 min | — | 1 | 47 | 29.9 | 2 |

---

## Per-Level Details

### Level 1: Level 1: The Camp

**Result**: WIN | **Time**: 1.6 min | **Deaths**: 0 | **FPS**: avg 54.4, min 11

**Balance target**: 3–4 min — Logs+thawing. No new mechanics.

**Stage chain**: 1. rescueSurvivors(1) → 2. buildStructure(tent) → 3. rescueSurvivors(3)

**Stage completion times**:
- Stage 0: 66.4s

**Issues (2 total)**:

- 🟡 MINOR   t=0s: Low FPS: 21
- 🟡 MINOR   t=7s: Low FPS: 11

### Level 2: Level 2: The Hunting Ground

**Result**: WIN | **Time**: 2.9 min | **Deaths**: 0 | **FPS**: avg 55.6, min 17

**Balance target**: 5–6 min — Wolves+5 survivors.

**Stage chain**: 1. huntAnimals(1) → 2. rescueSurvivors(2) → 3. buildStructure(tent) → 4. rescueSurvivors(5)

**Stage completion times**:
- Stage 0: 81.6s
- Stage 1: 87.7s

**Issues (2 total)**:

- 🟡 MINOR   t=31s: Low FPS: 17
- 🟡 MINOR   t=39s: Low FPS: 24

### Level 3: Level 3: Frozen Valley

**Result**: WIN | **Time**: 1.4 min | **Deaths**: 0 | **FPS**: avg 47.2, min 18

**Balance target**: 5–6 min — Faster drain, 4 survivors, 2 wolves.

**Stage chain**: 1. rescueSurvivors(1) → 2. buildStructure(tent) → 3. rescueSurvivors(4)

**Stage completion times**:
- Stage 0: 55.6s

**Issues (2 total)**:

- 🟡 MINOR   t=66s: Low FPS: 23
- 🟡 MINOR   t=73s: Low FPS: 18

### Level 4: Level 4: The Alpha's Den

**Result**: WIN | **Time**: 4.1 min | **Deaths**: 2 | **FPS**: avg 49.6, min 18

**Balance target**: 7–8 min — Hunt+rescue 3.

**Stage chain**: 1. huntAnimals(1) → 2. rescueSurvivors(3)

**Stage completion times**:
- Stage 0: 41.3s

**Issues (8 total)**:

- 🟠 MAJOR   t=136s: Stage 1 (rescueSurvivors:3) stalled >90s — player@(160,586) fuel=35 | need=2 rescued=1 frozen=1 | nearestFrozen@(-485,692) d=654px state=frozen
- 🟠 MAJOR   t=227s: Stage 1 (rescueSurvivors:3) stalled >90s — player@(-173,686) fuel=84 | need=1 rescued=2 frozen=1 | nearestFrozen@(-485,692) d=312px state=frozen
- 🟡 MINOR   t=75s: Worker 0 stuck 8s (state=toFire, moved=5px)
- 🟡 MINOR   t=84s: Player died (death #1) at stage 1
- 🟡 MINOR   t=127s: Player died (death #2) at stage 1
- 🟡 MINOR   t=170s: Low FPS: 18
- 🟡 MINOR   t=193s: Low FPS: 20
- ... (1 more minor issues)

### Level 5: Level 5: The Blizzard's Edge

**Result**: WIN | **Time**: 9.5 min | **Deaths**: 0 | **FPS**: avg 62.5, min 35

**Balance target**: 7–8 min — Hunt 2, build, rescue 5.

**Stage chain**: 1. huntAnimals(2) → 2. buildStructure(tent) → 3. rescueSurvivors(5)

**Stage completion times**:
- Stage 0: 388.6s

**Issues (7 total)**:

- 🟠 MAJOR   t=93s: Stage 0 (huntAnimals:2) stalled >90s — player@(166,416) fuel=60 | kills=0/2 liveAnimals=5 | nearestAnimal@(-222,658) d=457px hp=6 state=roam
- 🟠 MAJOR   t=189s: Stage 0 (huntAnimals:2) stalled >90s — player@(226,513) fuel=36 | kills=0/2 liveAnimals=5 | nearestAnimal@(-174,809) d=498px hp=3 state=roam
- 🟠 MAJOR   t=282s: Stage 0 (huntAnimals:2) stalled >90s — player@(26,572) fuel=0 | kills=0/2 liveAnimals=5 | nearestAnimal@(-220,585) d=246px hp=6 state=roam
- 🟠 MAJOR   t=375s: Stage 0 (huntAnimals:2) stalled >90s — player@(192,497) fuel=86 | kills=1/2 liveAnimals=4 | nearestAnimal@(-164,790) d=461px hp=3 state=roam
- 🟠 MAJOR   t=479s: Stage 2 (rescueSurvivors:5) stalled >90s — player@(-163,688) fuel=85 | need=3 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=570s: Stage 2 (rescueSurvivors:5) stalled >90s — player@(228,514) fuel=96 | need=1 rescued=4 frozen=1 | nearestFrozen@(176,556) d=66px state=thawing
- 🟡 MINOR   t=410s: Worker 1 stuck 8s (state=toTree, moved=8px)

### Level 6: Level 6: Ice Storm

**Result**: DNF | **Time**: 10.0 min | **Deaths**: 0 | **FPS**: avg 61.7, min 35

**Balance target**: 7–8 min — Rescue+build+hunt+rescue.

**Stage chain**: 1. rescueSurvivors(2) → 2. buildStructure(tent) → 3. huntAnimals(2) → 4. rescueSurvivors(6)

**Stage completion times**:
- Stage 0: 27.3s
- Stage 1: 66.4s
- Stage 2: 25.5s

**Issues (12 total)**:

- 🔴 BLOCKER t=601s: Level 6 TIMED OUT (10 min). Reached stage 3.
- 🟠 MAJOR   t=211s: Stage 3 (rescueSurvivors:6) stalled >90s — player@(-421,839) fuel=73 | need=4 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=301s: Stage 3 (rescueSurvivors:6) stalled >90s — player@(-251,695) fuel=94 | need=4 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=392s: Stage 3 (rescueSurvivors:6) stalled >90s — player@(-282,782) fuel=90 | need=2 rescued=4 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=483s: Stage 3 (rescueSurvivors:6) stalled >90s — player@(-62,476) fuel=94 | need=2 rescued=4 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=574s: Stage 3 (rescueSurvivors:6) stalled >90s — player@(-191,786) fuel=94 | need=2 rescued=4 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟡 MINOR   t=230s: Worker 0 stuck 8s (state=toTree, moved=3px)
- 🟡 MINOR   t=309s: Worker 1 stuck 8s (state=toFire, moved=4px)
- 🟡 MINOR   t=328s: Worker 1 stuck 8s (state=toTree, moved=8px)
- 🟡 MINOR   t=426s: Worker 2 stuck 8s (state=toFire, moved=7px)
- 🟡 MINOR   t=447s: Worker 0 stuck 8s (state=toTree, moved=2px)
- ... (1 more minor issues)

### Level 7: Level 7: Dead Pines

**Result**: WIN | **Time**: 5.0 min | **Deaths**: 1 | **FPS**: avg 61.4, min 35

**Balance target**: 9–10 min — Hunt, build, two rescue waves.

**Stage chain**: 1. huntAnimals(1) → 2. buildStructure(tent) → 3. rescueSurvivors(3) → 4. rescueSurvivors(6)

**Stage completion times**:
- Stage 0: 43.9s
- Stage 1: 45.3s
- Stage 2: 208.1s

**Issues (4 total)**:

- 🟠 MAJOR   t=180s: Stage 2 (rescueSurvivors:3) stalled >90s — player@(-340,641) fuel=98 | need=1 rescued=2 frozen=4 | nearestFrozen@(-525,712) d=198px state=frozen
- 🟠 MAJOR   t=270s: Stage 2 (rescueSurvivors:3) stalled >90s — player@(-264,657) fuel=84 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟡 MINOR   t=191s: Player died (death #1) at stage 2
- 🟡 MINOR   t=198s: Worker 1 stuck 8s (state=toFire, moved=6px)

### Level 8: Level 8: The Pack

**Result**: WIN | **Time**: 4.6 min | **Deaths**: 1 | **FPS**: avg 61.7, min 35

**Balance target**: 9–10 min — 3-wolf hunt + 7 survivors.

**Stage chain**: 1. huntAnimals(3) → 2. buildStructure(tent) → 3. rescueSurvivors(4) → 4. rescueSurvivors(7)

**Stage completion times**:
- Stage 0: 61.5s
- Stage 1: 28.5s
- Stage 2: 185.0s

**Issues (3 total)**:

- 🟠 MAJOR   t=180s: Stage 2 (rescueSurvivors:4) stalled >90s — player@(-88,787) fuel=99 | need=2 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟡 MINOR   t=122s: Player died (death #1) at stage 2
- 🟡 MINOR   t=160s: Worker 1 stuck 8s (state=toTree, moved=2px)

### Level 9: Level 9: The Forsaken Ridge

**Result**: WIN | **Time**: 2.6 min | **Deaths**: 1 | **FPS**: avg 61.0, min 46

**Balance target**: 9–10 min — Rescue 8 + defend 3 raids.

**Stage chain**: 1. rescueSurvivors(2) → 2. huntAnimals(3) → 3. buildStructure(tent) → 4. rescueSurvivors(8)

**Stage completion times**:
- Stage 0: 82.9s
- Stage 1: 59.4s

**Issues (1 total)**:

- 🟡 MINOR   t=30s: Player died (death #1) at stage 0

### Level 10: Level 10: The Second Alpha

**Result**: WIN | **Time**: 5.3 min | **Deaths**: 2 | **FPS**: avg 61.6, min 35

**Balance target**: 12–15 min — Full systems, 5 survivors.

**Stage chain**: 1. huntAnimals(1) → 2. huntAnimals(4) → 3. buildStructure(tent) → 4. rescueSurvivors(5)

**Stage completion times**:
- Stage 0: 23.4s
- Stage 1: 160.5s

**Issues (9 total)**:

- 🟠 MAJOR   t=114s: Stage 1 (huntAnimals:4) stalled >90s — player@(3,645) fuel=100 | kills=3/4 liveAnimals=3 | nearestAnimal@(-260,691) d=266px hp=16 state=roam
- 🟠 MAJOR   t=276s: Stage 3 (rescueSurvivors:5) stalled >90s — player@(-85,570) fuel=92 | need=1 rescued=4 frozen=1 | nearestFrozen@(-645,812) d=610px state=frozen
- 🟡 MINOR   t=55s: Worker 2 stuck 8s (state=toFire, moved=8px)
- 🟡 MINOR   t=63s: Worker 2 stuck 8s (state=toTree, moved=8px)
- 🟡 MINOR   t=124s: Worker 1 stuck 8s (state=toFire, moved=3px)
- 🟡 MINOR   t=126s: Player died (death #1) at stage 1
- 🟡 MINOR   t=199s: Player died (death #2) at stage 3
- ... (2 more minor issues)

### Level 11: Level 11: The Last Fire

**Result**: WIN | **Time**: 5.9 min | **Deaths**: 1 | **FPS**: avg 61.8, min 35

**Balance target**: 12–15 min — Rescue 8 + 8 animals (est.).

**Stage chain**: 1. rescueSurvivors(1) → 2. huntAnimals(2) → 3. buildStructure(tent) → 4. rescueSurvivors(8)

**Stage completion times**:
- Stage 0: 43.6s
- Stage 1: 73.0s

**Issues (4 total)**:

- 🟠 MAJOR   t=207s: Stage 3 (rescueSurvivors:8) stalled >90s — player@(-148,634) fuel=93 | need=3 rescued=5 frozen=1 | nearestFrozen@(-925,912) d=826px state=frozen
- 🟠 MAJOR   t=297s: Stage 3 (rescueSurvivors:8) stalled >90s — player@(-360,745) fuel=92 | need=1 rescued=7 frozen=1 | nearestFrozen@(-925,912) d=590px state=frozen
- 🟡 MINOR   t=235s: Worker 3 stuck 8s (state=toTree, moved=2px)
- 🟡 MINOR   t=298s: Player died (death #1) at stage 3

### Level 12: Level 12: Ash and Ice

**Result**: DNF | **Time**: 10.1 min | **Deaths**: 0 | **FPS**: avg 43.2, min 6

**Balance target**: 12–15 min — 9 survivors, 9 animals (est.).

**Stage chain**: 1. huntAnimals(2) → 2. rescueSurvivors(3) → 3. buildStructure(tent) → 4. huntAnimals(5) → 5. rescueSurvivors(9)

**Stage completion times**:
- Stage 0: 103.0s
- Stage 3: 56.1s

**Issues (10 total)**:

- 🔴 BLOCKER t=605s: Level 12 TIMED OUT (10 min). Reached stage 4.
- 🟠 MAJOR   t=90s: Stage 0 (huntAnimals:2) stalled >90s — player@(256,516) fuel=95 | kills=1/2 liveAnimals=8 | nearestAnimal@(-6,624) d=283px hp=9 state=backoff
- 🟠 MAJOR   t=249s: Stage 4 (rescueSurvivors:9) stalled >90s — player@(197,501) fuel=72 | need=6 rescued=3 frozen=6 | nearestFrozen@(-565,692) d=786px state=frozen
- 🟠 MAJOR   t=342s: Stage 4 (rescueSurvivors:9) stalled >90s — player@(100,343) fuel=68 | need=6 rescued=3 frozen=6 | nearestFrozen@(-565,692) d=751px state=frozen
- 🟠 MAJOR   t=438s: Stage 4 (rescueSurvivors:9) stalled >90s — player@(260,385) fuel=82 | need=6 rescued=3 frozen=6 | nearestFrozen@(-565,692) d=880px state=frozen
- 🟠 MAJOR   t=534s: Stage 4 (rescueSurvivors:9) stalled >90s — player@(81,532) fuel=75 | need=6 rescued=3 frozen=6 | nearestFrozen@(-565,692) d=666px state=frozen
- 🟡 MINOR   t=148s: Low FPS: 16
- 🟡 MINOR   t=178s: Low FPS: 10
- 🟡 MINOR   t=219s: Worker 2 stuck 8s (state=toTree, moved=2px)
- 🟡 MINOR   t=534s: Low FPS: 6

### Level 13: Level 13: The Hunger

**Result**: DNF | **Time**: 10.1 min | **Deaths**: 4 | **FPS**: avg 48.2, min 8

**Balance target**: 12–15 min — 10 survivors, 10 animals (est.).

**Stage chain**: 1. rescueSurvivors(2) → 2. huntAnimals(3) → 3. buildStructure(tent) → 4. huntAnimals(7) → 5. rescueSurvivors(10)

**Stage completion times**:
- Stage 0: 70.3s
- Stage 1: 32.4s
- Stage 2: 30.1s
- Stage 3: 151.8s

**Issues (25 total)**:

- 🔴 BLOCKER t=605s: Level 13 TIMED OUT (10 min). Reached stage 4.
- 🟠 MAJOR   t=223s: Stage 3 (huntAnimals:7) stalled >90s — player@(236,514) fuel=92 | kills=4/7 liveAnimals=9 | nearestAnimal@(-0,626) d=262px hp=3 state=backoff
- 🟠 MAJOR   t=377s: Stage 4 (rescueSurvivors:10) stalled >90s — player@(-167,481) fuel=71 | need=3 rescued=7 frozen=3 | nearestFrozen@(-965,932) d=916px state=frozen
- 🟠 MAJOR   t=469s: Stage 4 (rescueSurvivors:10) stalled >90s — player@(-285,623) fuel=93 | need=3 rescued=7 frozen=3 | nearestFrozen@(-965,932) d=747px state=frozen
- 🟠 MAJOR   t=570s: Stage 4 (rescueSurvivors:10) stalled >90s — player@(186,414) fuel=88 | need=3 rescued=7 frozen=3 | nearestFrozen@(-965,932) d=1263px state=frozen
- 🟡 MINOR   t=45s: Player died (death #1) at stage 0
- 🟡 MINOR   t=88s: Worker 3 stuck 8s (state=toFire, moved=5px)
- 🟡 MINOR   t=195s: Worker 1 stuck 8s (state=toFire, moved=3px)
- 🟡 MINOR   t=283s: Low FPS: 24
- 🟡 MINOR   t=296s: Low FPS: 20
- ... (15 more minor issues)

### Level 14: Level 14: Twilight of Ice

**Result**: DNF | **Time**: 10.1 min | **Deaths**: 3 | **FPS**: avg 40.9, min 7

**Balance target**: 12–15 min — 11 survivors, 10 animals (est.).

**Stage chain**: 1. huntAnimals(1) → 2. rescueSurvivors(3) → 3. buildStructure(tent) → 4. huntAnimals(5) → 5. rescueSurvivors(11)

**Stage completion times**:
- Stage 0: 88.4s
- Stage 1: 95.4s
- Stage 3: 73.8s

**Issues (17 total)**:

- 🔴 BLOCKER t=604s: Level 14 TIMED OUT (10 min). Reached stage 4.
- 🟠 MAJOR   t=183s: Stage 1 (rescueSurvivors:3) stalled >90s — player@(130,522) fuel=78 | need=1 rescued=2 frozen=9 | nearestFrozen@(138,492) d=31px state=thawing
- 🟠 MAJOR   t=353s: Stage 4 (rescueSurvivors:11) stalled >90s — player@(-141,661) fuel=52 | need=8 rescued=3 frozen=8 | nearestFrozen@(-485,892) d=414px state=frozen
- 🟠 MAJOR   t=450s: Stage 4 (rescueSurvivors:11) stalled >90s — player@(225,513) fuel=31 | need=8 rescued=3 frozen=8 | nearestFrozen@(-485,892) d=804px state=frozen
- 🟠 MAJOR   t=540s: Stage 4 (rescueSurvivors:11) stalled >90s — player@(175,435) fuel=40 | need=8 rescued=3 frozen=8 | nearestFrozen@(-485,892) d=803px state=frozen
- 🟡 MINOR   t=16s: Player died (death #1) at stage 0
- 🟡 MINOR   t=118s: Low FPS: 13
- 🟡 MINOR   t=123s: Low FPS: 7
- 🟡 MINOR   t=125s: Player died (death #2) at stage 1
- 🟡 MINOR   t=130s: Low FPS: 18
- ... (7 more minor issues)

### Level 15: Level 15: Winter's End

**Result**: DNF | **Time**: 10.0 min | **Deaths**: 1 | **FPS**: avg 29.9, min 2

**Balance target**: 12–15 min — 12 survivors, 11 animals (est.).

**Stage chain**: 1. rescueSurvivors(1) → 2. huntAnimals(1) → 3. buildStructure(tent) → 4. huntAnimals(5) → 5. rescueSurvivors(12)

**Stage completion times**:
- Stage 0: 51.3s
- Stage 1: 73.6s
- Stage 2: 6.4s

**Issues (47 total)**:

- 🔴 BLOCKER t=601s: Level 15 TIMED OUT (10 min). Reached stage 3.
- 🟠 MAJOR   t=225s: Stage 3 (huntAnimals:5) stalled >90s — player@(-196,513) fuel=92 | kills=2/5 liveAnimals=10 | nearestAnimal@(-368,457) d=181px hp=7 state=circle
- 🟠 MAJOR   t=315s: Stage 3 (huntAnimals:5) stalled >90s — player@(-145,578) fuel=92 | kills=3/5 liveAnimals=10 | nearestAnimal@(-264,530) d=129px hp=3 state=backoff
- 🟠 MAJOR   t=407s: Stage 3 (huntAnimals:5) stalled >90s — player@(296,436) fuel=95 | kills=4/5 liveAnimals=11 | nearestAnimal@(655,534) d=373px hp=4 state=roam
- 🟠 MAJOR   t=497s: Stage 3 (huntAnimals:5) stalled >90s — player@(539,471) fuel=68 | kills=4/5 liveAnimals=11 | nearestAnimal@(731,496) d=193px hp=4 state=circle
- 🟠 MAJOR   t=588s: Stage 3 (huntAnimals:5) stalled >90s — player@(357,371) fuel=24 | kills=4/5 liveAnimals=11 | nearestAnimal@(656,533) d=341px hp=4 state=roam
- 🟡 MINOR   t=40s: Low FPS: 19
- 🟡 MINOR   t=50s: Low FPS: 23
- 🟡 MINOR   t=75s: Low FPS: 11
- 🟡 MINOR   t=80s: Low FPS: 19
- 🟡 MINOR   t=105s: Player died (death #1) at stage 1
- ... (36 more minor issues)
