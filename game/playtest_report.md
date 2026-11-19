# Frostborn Automated Playtest Report

Generated: 2026-11-19 12:47:28  |  Platform: WebKit headless (Playwright)  |  Viewport: 393×852

---

## Summary (15-level playtest)

| Level | Completed | Time (actual vs target) | Deaths | FPS min (post-1s) | FPS avg |
|-------|-----------|-------------------------|--------|-------------------|---------|
| L1 | Y | 1.4 min (target 3–4 min — 97s fast) | 0 | 44 | 60.9 |
| L2 | Y | 1.8 min (target 5–6 min — 191s fast) | 0 | 30 | 61.2 |
| L3 | Y | 0.9 min (target 5–6 min — 245s fast) | 0 | 30 | 55.4 |
| L4 | Y | 1.6 min (target 7–8 min — 324s fast) | 0 | 29 | 51.6 |
| L5 | Y | 2.1 min (target 7–8 min — 292s fast) | 0 | 8 | 20.1 |
| L6 | Y | 1.8 min (target 7–8 min — 313s fast) | 0 | 11 | 26.3 |
| L7 | Y | 1.3 min (target 9–10 min — 463s fast) | 0 | 10 | 28.4 |
| L8 | Y | 3.9 min (target 9–10 min — 304s fast) | 0 | 4 | 18.0 |
| L9 | Y | 1.8 min (target 9–10 min — 431s fast) | 0 | 30 | 59.3 |
| L10 | N | 17.0 min (target 12–15 min) | 0 | 24 | 54.7 |
| L11 | Y | 10.2 min (target 12–15 min — 107s fast) | 0 | 19 | 59.0 |
| L12 | N | 12.6 min (target 12–15 min) | 1 | 30 | 61.6 |
| L13 | Y | 2.8 min (target 12–15 min — 551s fast) | 0 | 45 | 60.7 |
| L14 | Y | 1.6 min (target 12–15 min — 622s fast) | 0 | 43 | 60.0 |
| L15 | Y | 1.3 min (target 12–15 min — 640s fast) | 0 | 30 | 57.6 |

---

## Extended Summary

| # | Name | Time | Target | vs Target | Deaths | Issues | FPS avg | FPS min |
|---|------|------|--------|-----------|--------|--------|---------|---------|
| L1 | Level 1: The Camp | 1.4 min ✅ WIN | 3–4 min | 97s fast | 0 | 2 | 60.9 | 44 |
| L2 | Level 2: The Hunting Ground | 1.8 min ✅ WIN | 5–6 min | 191s fast | 0 | 2 | 61.2 | 30 |
| L3 | Level 3: Frozen Valley | 0.9 min ✅ WIN | 5–6 min | 245s fast | 0 | 0 | 55.4 | 30 |
| L4 | Level 4: Ice Holes | 1.6 min ✅ WIN | 7–8 min | 324s fast | 0 | 0 | 51.6 | 29 |
| L5 | Level 5: Clean & Cook | 2.1 min ✅ WIN | 7–8 min | 292s fast | 0 | 14 | 20.1 | 8 |
| L6 | Level 6: Wolves at the Lake | 1.8 min ✅ WIN | 7–8 min | 313s fast | 0 | 10 | 26.3 | 11 |
| L7 | Level 7: Timber | 1.3 min ✅ WIN | 9–10 min | 463s fast | 0 | 6 | 28.4 | 10 |
| L8 | Level 8: First Cabin | 3.9 min ✅ WIN | 9–10 min | 304s fast | 0 | 36 | 18.0 | 4 |
| L9 | Level 9: Crew | 1.8 min ✅ WIN | 9–10 min | 431s fast | 0 | 1 | 59.3 | 30 |
| L10 | Level 10: Hunting Trail | 17.0 min ❌ DNF | 12–15 min | — | 0 | 26 | 54.7 | 24 |
| L11 | Level 11: Grinder Line | 10.2 min ✅ WIN | 12–15 min | 107s fast | 0 | 20 | 59.0 | 19 |
| L12 | Level 12: Supply Sled | 12.6 min ❌ DNF | 12–15 min | — | 1 | 15 | 61.6 | 30 |
| L13 | Level 13: Village | 2.8 min ✅ WIN | 12–15 min | 551s fast | 0 | 2 | 60.7 | 45 |
| L14 | Level 14: Night Watch | 1.6 min ✅ WIN | 12–15 min | 622s fast | 0 | 2 | 60.0 | 43 |
| L15 | Level 15: Grand Alpha | 1.3 min ✅ WIN | 12–15 min | 640s fast | 0 | 1 | 57.6 | 30 |

---

## Per-Level Details

### Level 1: Level 1: The Camp

**Result**: WIN | **Time**: 1.4 min | **Deaths**: 0 | **FPS**: avg 60.9, min 44

**Balance target**: 3–4 min — Logs+thawing. No new mechanics.

**Stage chain**: 1. rescueSurvivors(1) → 2. buildStructure(tent) → 3. rescueSurvivors(3)

**Stage completion times**:
- Stage 0: 24.5s

**Issues (2 total)**:

- 🟡 MINOR   t=39s: Nav-stall 12s at (272,337) — fire-waypoint reset
- 🟡 MINOR   t=72s: Nav-stall 12s at (197,300) — fire-waypoint reset

### Level 2: Level 2: The Hunting Ground

**Result**: WIN | **Time**: 1.8 min | **Deaths**: 0 | **FPS**: avg 61.2, min 30

**Balance target**: 5–6 min — Wolves+5 survivors.

**Stage chain**: 1. huntAnimals(1) → 2. rescueSurvivors(2) → 3. buildStructure(tent) → 4. rescueSurvivors(5)

**Stage completion times**:
- Stage 0: 15.5s
- Stage 1: 18.6s
- Stage 2: 29.2s

**Issues (2 total)**:

- 🟡 MINOR   t=76s: Nav-stall 12s at (181,597) — fire-waypoint reset
- 🟡 MINOR   t=81s: Worker 1 stuck 8s (state=toFire, moved=4px)

### Level 3: Level 3: Frozen Valley

**Result**: WIN | **Time**: 0.9 min | **Deaths**: 0 | **FPS**: avg 55.4, min 30

**Balance target**: 5–6 min — Faster drain, 4 survivors, 2 wolves.

**Stage chain**: 1. rescueSurvivors(1) → 2. buildStructure(tent) → 3. rescueSurvivors(4)

**Stage completion times**:
- Stage 0: 34.4s

**Issues**: none

### Level 4: Level 4: Ice Holes

**Result**: WIN | **Time**: 1.6 min | **Deaths**: 0 | **FPS**: avg 51.6, min 29

**Balance target**: 7–8 min — Hunt+rescue 3.

**Stage chain**: 1. rescueSurvivors(3) → 2. buildStructure(tent) → 3. fishCaught(6)

**Stage completion times**:
- Stage 0: 17.6s

**Issues**: none

### Level 5: Level 5: Clean & Cook

**Result**: WIN | **Time**: 2.1 min | **Deaths**: 0 | **FPS**: avg 20.1, min 8

**Balance target**: 7–8 min — Hunt 2, build, rescue 5.

**Stage chain**: 1. rescueSurvivors(4) → 2. buildStructure(tent) → 3. cookedServed(4)

**Stage completion times**:
- Stage 0: 30.7s

**Issues (14 total)**:

- 🟠 MAJOR   t=124s: Stage 1 (buildStructure:tent) stalled >90s — player@(183,418) fuel=139 | coins=107/100 tentBuilt=false | pad@(235,572) d=163px
- 🟡 MINOR   t=12s: Low FPS: 22
- 🟡 MINOR   t=17s: Low FPS: 10
- 🟡 MINOR   t=24s: Low FPS: 8
- 🟡 MINOR   t=29s: Low FPS: 10
- 🟡 MINOR   t=46s: Low FPS: 19
- ... (8 more minor issues)

### Level 6: Level 6: Wolves at the Lake

**Result**: WIN | **Time**: 1.8 min | **Deaths**: 0 | **FPS**: avg 26.3, min 11

**Balance target**: 7–8 min — Rescue+build+hunt+rescue.

**Stage chain**: 1. rescueSurvivors(3) → 2. buildStructure(tent) → 3. cookedServed(2)

**Stage completion times**:
- Stage 0: 25.1s

**Issues (10 total)**:

- 🟡 MINOR   t=6s: Low FPS: 14
- 🟡 MINOR   t=12s: Low FPS: 15
- 🟡 MINOR   t=36s: Low FPS: 19
- 🟡 MINOR   t=41s: Low FPS: 13
- 🟡 MINOR   t=47s: Low FPS: 11
- ... (5 more minor issues)

### Level 7: Level 7: Timber

**Result**: WIN | **Time**: 1.3 min | **Deaths**: 0 | **FPS**: avg 28.4, min 10

**Balance target**: 9–10 min — Hunt, build, two rescue waves.

**Stage chain**: 1. rescueSurvivors(2) → 2. buildStructure(tent) → 3. planksProduced(6) → 4. rescueSurvivors(4)

**Stage completion times**:
- Stage 0: 33.1s

**Issues (6 total)**:

- 🟡 MINOR   t=20s: Low FPS: 17
- 🟡 MINOR   t=27s: Low FPS: 13
- 🟡 MINOR   t=33s: Low FPS: 10
- 🟡 MINOR   t=40s: Low FPS: 11
- 🟡 MINOR   t=47s: Low FPS: 15
- ... (1 more minor issues)

### Level 8: Level 8: First Cabin

**Result**: WIN | **Time**: 3.9 min | **Deaths**: 0 | **FPS**: avg 18.0, min 4

**Balance target**: 9–10 min — 3-wolf hunt + 7 survivors.

**Stage chain**: 1. rescueSurvivors(3) → 2. planksProduced(10) → 3. buildStructure(cabin) → 4. rescueSurvivors(6)

**Stage completion times**:
- Stage 0: 152.5s
- Stage 1: 48.9s
- Stage 2: 9.5s

**Issues (36 total)**:

- 🟠 MAJOR   t=92s: Stage 0 (rescueSurvivors:3) stalled >90s — player@(-84,496) fuel=75 | need=3 rescued=0 frozen=1 | nearestFrozen@(-245,532) d=165px state=frozen
- 🟡 MINOR   t=6s: Low FPS: 10
- 🟡 MINOR   t=11s: Low FPS: 9
- 🟡 MINOR   t=17s: Low FPS: 12
- 🟡 MINOR   t=29s: Low FPS: 13
- 🟡 MINOR   t=34s: Low FPS: 7
- ... (30 more minor issues)

### Level 9: Level 9: Crew

**Result**: WIN | **Time**: 1.8 min | **Deaths**: 0 | **FPS**: avg 59.3, min 30

**Balance target**: 9–10 min — Rescue 8 + defend 3 raids.

**Stage chain**: 1. rescueSurvivors(4) → 2. buildStructure(tent) → 3. cookedServed(4) → 4. planksProduced(6) → 5. rescueSurvivors(6)

**Stage completion times**:
- Stage 0: 43.1s

**Issues (1 total)**:

- 🟡 MINOR   t=25s: Nav-stall 12s at (-100,513) — fire-waypoint reset

### Level 10: Level 10: Hunting Trail

**Result**: DNF | **Time**: 17.0 min | **Deaths**: 0 | **FPS**: avg 54.7, min 24

**Balance target**: 12–15 min — Full systems, 5 survivors.

**Stage chain**: 1. rescueSurvivors(2) → 2. huntAnimals(1) → 3. buildStructure(tent) → 4. cookedServed(3) → 5. rescueSurvivors(3)

**Stage completion times**:
- Stage 0: 20.1s
- Stage 1: 228.2s

**Issues (26 total)**:

- 🔴 BLOCKER t=1021s: Level 10 TIMED OUT (17 min). Reached stage 4.
- 🟠 MAJOR   t=110s: Stage 1 (huntAnimals:1) stalled >90s — player@(-330,840) fuel=125 | kills=0/1 liveAnimals=5 | nearestAnimal@(-301,845) d=30px hp=3 state=lunge
- 🟠 MAJOR   t=201s: Stage 1 (huntAnimals:1) stalled >90s — player@(-104,661) fuel=62 | kills=0/1 liveAnimals=5 | nearestAnimal@(-78,642) d=31px hp=1 state=roam
- 🟠 MAJOR   t=349s: Stage 4 (rescueSurvivors:3) stalled >90s — player@(278,340) fuel=21 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=443s: Stage 4 (rescueSurvivors:3) stalled >90s — player@(290,347) fuel=45 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=533s: Stage 4 (rescueSurvivors:3) stalled >90s — player@(120,338) fuel=0 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=631s: Stage 4 (rescueSurvivors:3) stalled >90s — player@(205,398) fuel=91 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=723s: Stage 4 (rescueSurvivors:3) stalled >90s — player@(291,425) fuel=80 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=826s: Stage 4 (rescueSurvivors:3) stalled >90s — player@(165,385) fuel=54 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=920s: Stage 4 (rescueSurvivors:3) stalled >90s — player@(23,545) fuel=26 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=1010s: Stage 4 (rescueSurvivors:3) stalled >90s — player@(194,498) fuel=48 | need=1 rescued=2 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟡 MINOR   t=119s: Low FPS: 24
- 🟡 MINOR   t=242s: Nav-stall 12s at (117,338) — fire-waypoint reset
- 🟡 MINOR   t=272s: Nav-stall 12s at (194,498) — fire-waypoint reset
- 🟡 MINOR   t=314s: Nav-stall 12s at (194,498) — fire-waypoint reset
- 🟡 MINOR   t=497s: Nav-stall 12s at (117,339) — fire-waypoint reset
- ... (10 more minor issues)

### Level 11: Level 11: Grinder Line

**Result**: WIN | **Time**: 10.2 min | **Deaths**: 0 | **FPS**: avg 59.0, min 19

**Balance target**: 12–15 min — Rescue 8 + 8 animals (est.).

**Stage chain**: 1. rescueSurvivors(3) → 2. buildStructure(tent) → 3. huntAnimals(2) → 4. cookedServed(4) → 5. rescueSurvivors(5)

**Stage completion times**:
- Stage 0: 45.8s
- Stage 1: 48.2s

**Issues (20 total)**:

- 🟠 MAJOR   t=184s: Stage 2 (huntAnimals:2) stalled >90s — player@(-264,701) fuel=118 | kills=0/2 liveAnimals=2 | nearestAnimal@(-305,649) d=66px hp=3 state=roam
- 🟠 MAJOR   t=275s: Stage 2 (huntAnimals:2) stalled >90s — player@(-114,778) fuel=128 | kills=0/2 liveAnimals=2 | nearestAnimal@(-145,741) d=48px hp=2 state=roam
- 🟠 MAJOR   t=365s: Stage 2 (huntAnimals:2) stalled >90s — player@(202,500) fuel=139 | kills=0/2 liveAnimals=4 | nearestAnimal@(-51,578) d=264px hp=3 state=circle
- 🟠 MAJOR   t=456s: Stage 2 (huntAnimals:2) stalled >90s — player@(-40,596) fuel=123 | kills=1/2 liveAnimals=3 | nearestAnimal@(28,664) d=96px hp=3 state=backoff
- 🟠 MAJOR   t=546s: Stage 2 (huntAnimals:2) stalled >90s — player@(37,542) fuel=129 | kills=1/2 liveAnimals=5 | nearestAnimal@(-23,594) d=79px hp=3 state=windup
- 🟡 MINOR   t=24s: Nav-stall 12s at (-126,500) — fire-waypoint reset
- 🟡 MINOR   t=72s: Worker 1 stuck 8s (state=haul, moved=0px)
- 🟡 MINOR   t=78s: Low FPS: 19
- 🟡 MINOR   t=109s: Worker 2 stuck 8s (state=toTree, moved=4px)
- 🟡 MINOR   t=177s: Worker 2 stuck 8s (state=toTree, moved=3px)
- ... (10 more minor issues)

### Level 12: Level 12: Supply Sled

**Result**: DNF | **Time**: 12.6 min | **Deaths**: 1 | **FPS**: avg 61.6, min 30

**Balance target**: 12–15 min — 9 survivors, 9 animals (est.).

**Stage chain**: 1. rescueSurvivors(3) → 2. buildStructure(tent) → 3. huntAnimals(3) → 4. supplyRunsCompleted(2) → 5. rescueSurvivors(5)

**Stage completion times**:
- Stage 0: 14.4s
- Stage 1: 86.4s

**Issues (15 total)**:

- 🟠 MAJOR   t=191s: Stage 2 (huntAnimals:3) stalled >90s — player@(-348,800) fuel=108 | kills=0/3 liveAnimals=3 | nearestAnimal@(-338,748) d=53px hp=3 state=roam
- 🟠 MAJOR   t=292s: Stage 2 (huntAnimals:3) stalled >90s — player@(141,376) fuel=10 | kills=0/3 liveAnimals=3 | nearestAnimal@(-115,708) d=419px hp=2 state=roam
- 🟠 MAJOR   t=383s: Stage 2 (huntAnimals:3) stalled >90s — player@(120,338) fuel=0 | kills=0/3 liveAnimals=5 | nearestAnimal@(-150,574) d=358px hp=3 state=roam
- 🟠 MAJOR   t=477s: Stage 2 (huntAnimals:3) stalled >90s — player@(279,409) fuel=90 | kills=0/3 liveAnimals=5 | nearestAnimal@(-58,643) d=410px hp=1 state=roam
- 🟠 MAJOR   t=570s: Stage 2 (huntAnimals:3) stalled >90s — player@(196,300) fuel=0 | kills=2/3 liveAnimals=3 | nearestAnimal@(-117,561) d=407px hp=3 state=roam
- 🟠 MAJOR   t=661s: Stage 2 (huntAnimals:3) stalled >90s — player@(138,514) fuel=5 | kills=2/3 liveAnimals=5 | nearestAnimal@(-85,564) d=228px hp=1 state=roam
- 🟠 MAJOR   t=758s: Level ended (lose) at stage 2/5 at t=758s
- 🟡 MINOR   t=141s: Worker 1 stuck 8s (state=toTree, moved=2px)
- 🟡 MINOR   t=308s: Worker 0 stuck 8s (state=toStation, moved=5px)
- 🟡 MINOR   t=343s: Nav-stall 12s at (127,335) — fire-waypoint reset
- 🟡 MINOR   t=384s: Nav-stall 12s at (175,435) — fire-waypoint reset
- 🟡 MINOR   t=401s: Worker 0 stuck 8s (state=toStation, moved=4px)
- ... (3 more minor issues)

### Level 13: Level 13: Village

**Result**: WIN | **Time**: 2.8 min | **Deaths**: 0 | **FPS**: avg 60.7, min 45

**Balance target**: 12–15 min — 10 survivors, 10 animals (est.).

**Stage chain**: 1. rescueSurvivors(4) → 2. buildStructure(tent) → 3. cookedServed(6) → 4. supplyRunsCompleted(1) → 5. rescueSurvivors(7)

**Stage completion times**:
- Stage 0: 14.4s

**Issues (2 total)**:

- 🟠 MAJOR   t=106s: Stage 1 (buildStructure:tent) stalled >90s — player@(32,378) fuel=108 | coins=285/120 tentBuilt=false | pad@(275,592) d=324px
- 🟡 MINOR   t=99s: Nav-stall 12s at (163,378) — fire-waypoint reset

### Level 14: Level 14: Night Watch

**Result**: WIN | **Time**: 1.6 min | **Deaths**: 0 | **FPS**: avg 60.0, min 43

**Balance target**: 12–15 min — 11 survivors, 10 animals (est.).

**Stage chain**: 1. rescueSurvivors(3) → 2. buildStructure(tent) → 3. huntAnimals(6) → 4. supplyRunsCompleted(1) → 5. rescueSurvivors(5)

**Stage completion times**:
- Stage 0: 14.5s
- Stage 1: 42.9s

**Issues (2 total)**:

- 🟡 MINOR   t=57s: Worker 1 stuck 8s (state=toTree, moved=7px)
- 🟡 MINOR   t=74s: Worker 1 stuck 8s (state=toTree, moved=4px)

### Level 15: Level 15: Grand Alpha

**Result**: WIN | **Time**: 1.3 min | **Deaths**: 0 | **FPS**: avg 57.6, min 30

**Balance target**: 12–15 min — 12 survivors, 11 animals (est.).

**Stage chain**: 1. rescueSurvivors(4) → 2. buildStructure(tent) → 3. cookedServed(4) → 4. huntAnimals(1) → 5. rescueSurvivors(8)

**Stage completion times**:
- Stage 0: 20.2s
- Stage 1: 31.7s

**Issues (1 total)**:

- 🟡 MINOR   t=67s: Nav-stall 12s at (-31,524) — fire-waypoint reset
