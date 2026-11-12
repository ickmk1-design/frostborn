# Frostborn Automated Playtest Report

Generated: 2026-11-12 07:41:03  |  Platform: WebKit headless (Playwright)  |  Viewport: 393×852

---

## Summary Table

| # | Name | Time | Target | vs Target | Deaths | Issues | FPS avg | FPS min |
|---|------|------|--------|-----------|--------|--------|---------|---------|
| L15 | Level 15: Winter's End | 6.3 min ✅ WIN | 12–15 min | 344s fast | 3 | 60 | 18.2 | 5 |

---

## Per-Level Details

### Level 15: Level 15: Winter's End

**Result**: WIN | **Time**: 6.3 min | **Deaths**: 3 | **FPS**: avg 18.2, min 5

**Balance target**: 12–15 min — 12 survivors, 11 animals (est.).

**Stage chain**: 1. rescueSurvivors(1) → 2. huntAnimals(1) → 3. buildStructure(tent) → 4. huntAnimals(5) → 5. rescueSurvivors(12)

**Stage completion times**:
- Stage 0: 109.0s
- Stage 1: 30.2s
- Stage 2: 69.2s

**Issues (60 total)**:

- 🟠 MAJOR   t=93s: Stage 0 (rescueSurvivors:1) stalled >90s — player@(297,388) fuel=35 | need=1 rescued=0 frozen=0 | NO_FROZEN_SURVIVORS_LEFT target not reachable
- 🟠 MAJOR   t=299s: Stage 3 (huntAnimals:5) stalled >90s — player@(203,505) fuel=93 | kills=4/5 liveAnimals=9 | nearestAnimal@(-15,619) d=246px hp=5 state=circle
- 🟡 MINOR   t=8s: Low FPS: 10
- 🟡 MINOR   t=13s: Low FPS: 6
- 🟡 MINOR   t=21s: Low FPS: 5
- 🟡 MINOR   t=28s: Low FPS: 5
- 🟡 MINOR   t=35s: Low FPS: 5
- ... (53 more minor issues)
