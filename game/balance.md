# Frostborn — Level Balance Reference

## Timing Methodology

**Core time drivers:**
- **Fuel drain**: fuelDrainPerSec. At 100 fuel and 3.5/s drain → 28s to empty. Each log adds 20 fuel → 20/3.5 = 5.7s. Player must run log loops continuously.
- **Log run time**: tree collect range 90px, player speed 130px/s. Camp tree at ~180px from fire → round trip ~2.8s + 4.5s cooldown = 1 log/7.3s per tree × 3 trees = 1 log/2.4s sustained.
- **Coin economy**: 1 log = 5 coins. Sustained rate = 5/2.4 = 2.1 coins/s from logs alone.
- **Meat economy**: 1 wolf kill (3 chops at 1300ms each = 3.9s + ~8s travel) ≈ 12s per wolf → 1 meat/12s → cooked in 3.5s → 10 coins. Rate = 10/15.5 = 0.65 coins/s.
- **Survivor thaw**: walk to survivor + 3–4s thaw = 15–25s per survivor depending on distance.

## Level Target Times

| Level | Goal | Tent Cost | Survivors | Est. Time | Notes |
|-------|------|-----------|-----------|-----------|-------|
| L1 | Rescue 3, build 1 tent | 65🪙 | 3 (iy=20–21) | **3–4 min** | Logs + thawing. No new mechanics. |
| L2 | Hunt wolves, rescue 5, tent | 80🪙 | 5 (iy=20–25) | **5–6 min** | Wolves add ~40 coins/session; 5 far survivors add walk time. |
| L3 | Hunger, rescue 6, 2 tents | TBD | 6 | **5–6 min** | Hunger gate: survivors wait for food before becoming workers. |
| L4 | Hunt bear, 30 food | TBD | — | **7–8 min** | Bear 8 HP → ~10s kill + multiple runs. Food economy gated. |
| L5 | Build butcher station, 50 meat | TBD | — | **7–8 min** | Meat production chain: wolf→butcher→processed meat→coins faster. |
| L6 | Fish 20, rescue 8 | TBD | 8 | **7–8 min** | Fishing passive income; map has lake area. |
| L7 | Lumber workshop, upgrade tents→cabins | TBD | — | **9–10 min** | Plank production adds second resource tier. |
| L8 | Survive 2 blizzards | TBD | — | **9–10 min** | Blizzards force stockpiling; 3× fuel burn = crisis management. |
| L9 | Repel 3 wolf raids, watchtower | TBD | — | **9–10 min** | Active defense + base building. |
| L10 | 15 survivors, all buildings | TBD | 15 | **12–15 min** | Full systems combined. |

## L1 Detailed Calculation (3–4 min)

- **Tent cost**: 65 coins / 2.1 coins/s = 31s of pure log running (but fuel maintenance takes priority).
- **Real time**: Player splits between log runs (fuel) and log runs (coins). With 3 trees and 4.5s cooldown, steady state is ~12 logs/min usable. 65 coins / 5 per log = 13 logs = ~65s just for coins. Plus survivor walks (~25s × 3 = 75s). Total ~140s + setup = **~3–4 min**. ✓

## L2 Detailed Calculation (5–6 min)

- **Tent cost**: 80 coins. From logs alone: 80/5 = 16 logs = 112s. From wolves: 8 kills × 15s = 120s = 80 coins. Mixed strategy: ~4 wolf kills (40 coins) + 8 log trips (40 coins) = ~80s hunting + ~56s logging = **~2.5 min on economy alone**.
- **Survivors**: 5 survivors at iy=20–25. Travel from gate: ~12–22s each. Thaw 4s each. Total: ~5 × 22s = 110s = **~1.8 min**.
- **Multi-stage pacing**: Stage 1 (1 wolf) forces hunting early. Stage 3 (tent) is mid-game. Stage 4 (5 survivors) is final push.
- **Total**: 2.5 min economy + 1.8 min survivors + 0.7 min overhead = **~5–6 min**. ✓
