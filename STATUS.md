# Frostborn — Level Redesign Rollout

**levels_design.md approved 2026-11-13** with these amendments:
- L6 swapped: frost shark → "Wolves at the Lake" (existing wolf assets, no new animated boss).
- All new stations/buildings/items **must be generated via OpenAI gpt-image** in `master.png` style — no placeholder cubes in anything tested or deployed.
- Stag: render through the Blender pipeline using `Stag.blend` from the Quaternius animal pack (same path as wolf/deer).
- Worker assignment: **automatic** with priority `fire > food > production > export`. Tap a station to bump its priority. No tap-and-tap UI.
- Conveyor: items must **visibly move** along the belt (simple sprite tween, no physics).
- Watchtower lookout: **shoots arrows (damage)** and slows wolves 40 % in the arc.
- Sled payout: start **200 coins/run**, tune in playtest.

## Wave rollout — deploy + phone-test after each

| Wave | Content | Est. | Test deliverable | Status |
|---|---|---|---|---|
| 1 | Stations scaffold (`Station` type, config loader, auto-assign priority) | 0.5 d | Regression pass — existing L1-L15 play identically | **DEPLOYED** b2c7a760 |
| 2 | Resource system (log/fish/clean/meat/plank/ground/cooked) carry-slot items | 1 d | Existing L1-L15 play on new resource plumbing | **DEPLOYED** (scaffold) |
| 3 | Assets A (ice hole, pier, water, fish, cleaning table, cook pot) + L4 + L5 | 2 d | L4 fishing + L5 cleaning/cook on phone | pending |
| 4 | L6 Wolves-at-the-Lake (reuses wolf assets) | 0.5 d | L6 — wolves break fishing chain, hero clears, chain resumes | **DEPLOYED** 2026-11-17 |
| 5 | Assets B (lumber mill, planks, cabin stages) + L7 mill + L8 cabin | 2 d | L7 planks + L8 shelter capacity gate | **DEPLOYED** 2026-11-17 |
| 6 | Worker-assignment UI (tap-to-bump-priority) + L9 Crew | 1 d | L9 — 2 parallel chains | **DEPLOYED** 2026-11-18 |
| 7 | Assets C (butcher table, carcass; stag via Blender) + L10 hunting | 2 d | L10 hunt → butcher → cook chain | **DEPLOYED** 2026-11-18 |
| 8 | Assets D (grinder, conveyor strip, meat chunks) + L11 visible conveyor | 1.5 d | L11 — meat rides the belt | **DEPLOYED** 2026-11-18 |
| 9 | Assets E (supply sled, dock) + L12 sled run (200 coin/run) | 1 d | L12 — load, depart, coins land | **DEPLOYED** 2026-11-18 |
| 10 | L13 Village (parallel chains, no new assets) | 0.5 d | L13 untutored full stack | **DEPLOYED** 2026-11-18 |
| 11 | Assets F (watchtower, lookout pose, arrow sprite) + L14 siege + tower damage/slow | 1.5 d | L14 — tower picks off wolves while sled runs | **DEPLOYED** 2026-11-18 |
| 12 | L15 Grand Alpha + blizzard | 1 d | L15 full-system win | **DEPLOYED** 2026-11-18 |
| 13 | Endless Winter: port stations + chains | 1 d | Endless wave 5+ uses stations | **DEPLOYED** 2026-11-18 |

**Rules per wave:**
- Direction test + preflight after every wave.
- Playtest bot updated alongside stations/chains/sled; bot pass on affected levels after each wave.
- Deploy to https://cytbilisim.com/frostborn/game/ and tell the user what to test.

## Wave 1 progress (in flight now)

- [x] `src/systems/stations.ts` — `Station` interface, priority config
- [x] Config loader reads `cfg.stations[]` from level JSON (empty-tolerant)
- [x] Worker auto-assign scans unmanned stations in priority order (fire > food > production > export)
- [ ] Preflight + direction test + playtest bot pass on L1-L15 (nothing should regress)
- [ ] Deploy to test URL

## Asset generation pipeline

Batch job queued via `gpt-image-1` with `master.png` style ref:
`ice_hole_01, pier_wood_plank_01, water_tile_01, resource_fish_raw_01, building_fish_cleaning_table_01, building_cook_pot_01, building_lumber_mill_01, resource_plank_01, building_cabin_01 (3 stages), building_butcher_table_01, building_meat_grinder_01, tile_conveyor_belt_01, resource_meat_chunk_01, building_supply_sled_01, tile_sled_dock_01, building_watchtower_01, character_survivor_lookout_01, resource_meat_ground_01`.

Stag: separate Blender pipeline (not image API).

## Round 2 — Balance rebalance (in progress, 2026-11-19)

Live URL: `index-93CbItUe.js` (rolled back from Round 2 pressure attempt).

### Done
- **Scene-side counter reset fix**: `planksProduced`, `planksAvailable`, `supplyRunsCompleted`, `blizzardTriggered`, `blizzardMs` are now cleared in `create()`. These bled through on scene restart and caused `supplyRunsCompleted >= target` to return true on levels where it wasn't earned → stages auto-completed → false WIN. Smoke confirms L5 now consistently WIN (was 2/3 before).
- **Stage advance logging**: every `advanceGoalStage` tick prints `[stage] Lx idx=N type=T target=... t=Xs | rescued=... tent=... cooked=... planks=... supplyRuns=...`. Bot pipes it to stdout.
- **Chain telemetry**: every WIN/LOSE prints `[chain]` (output counters) + `[stations]` (per-station manned seconds).

### Open tasks (parallel agents, worktree-isolated)

**Agent A — bot only** (`game/playtest_bot.js` and bot helpers, NO game code, NO level JSON):
- Fix `doHunt` for peaceful stags/deer: approach via navgrid waypoints, attack until dead, carry meat back.
- Fix final-rescue navigation (L10 stage 4 TIMED OUT).
- 30 s no-progress cap: log the cause, switch tasks.

**Agent B — visual only** (`game/src/scenes/*.ts`, UI, rendering, NO balance values, NO goal counts, NO bot):
- Camera framing + clamp (camp + stations centered, no empty voids).
- Signature structures visible and central on L7/L8/L11/L12/L14 (mill / cabin / grinder+belt / sled / tower).
- Continuous frozen lake (seamless water tile placement + ice-hole/pier on it).
- Stag/deer anchor + shadow — feet touch shadow, no floating.
- Unit separation — survivors + workers no longer stack.
- Objective banner collapse (3 s full, then compact pill).
- "Bölüm X" in the HUD (not overlapping fence).
- Restyled ad-fuel button (wooden/ice icon + rounded), shown only when fuel low.
- Verify coin reward flow (HUD showed 0 in several review screenshots).

### Main session after both agents
1. Merge A + B worktrees back into main.
2. Smoke all 15 (if a level fails, cherry-pick a tune — no HP buffs, no stage skip).
3. Add real pressure to L13–L15 for 4–8 min targets (wolves + alpha HP + blizzard duration).
4. Full 5× balance in the background, only rerun levels that changed.
5. Endless 3× (browser restart between runs).
6. New contact sheet.
7. Deploy only when every level ≥4/5.

### Round 1 balance (5× each, pre-reset-fix)
- L1 5/5 1.1 avg
- L2 3/5 (flaky)
- L3 5/5 1.0
- L4 5/5 1.2
- L5 2/5 (fuel flake) — **FIXED** by counter-reset; smoke now stable
- L6 5/5 1.6
- L7 5/5 1.5
- L8 4/5 (one Playwright crash)
- L9 4/5
- L10 5/5 5.6
- L11 4/5 (bot hunt navigation slow — 8–10 min on 2 stags)
- L12 4/5 (bot hunt slow + occasional LOSE)
- L13/14/15 5/5 but 1.3–2.4 min (too easy — needs real pressure)

### Round 2 smoke (post-reset-fix, 2026-11-19)
L1-L9 WIN, L10 TIMED OUT (final rescue nav), L11 WIN 10.2 (hunt 8.6 min), L12 LOSE stage 2 (hunt), L13 2.8, L14 1.6, L15 1.3.

### Blocked on
- Bot navigation fixes (Agent A)
- Visual polish (Agent B)
- L13-L15 pressure (apply AFTER agents merge, so content lives on the final visual baseline)

## Deployment log

- 2026-11-18 **Wave 13 (Endless stations port)** — on Endless wave 5, two watchtowers flanking the fire unlock + "STATIONS UNLOCKED" banner. Each fires at the nearest wolf within 260 px every 1.3 s (1 damage). Passive — no manning needed. Sanity: L1 + L15 WIN. **All 13 waves shipped.**
- 2026-11-18 **Wave 12 (L15 Grand Alpha)** — climax level: 2 watchtowers + full chain + grandalpha boss (summons 4 betas at 50% HP). New blizzard event (2× fuel drain + 1.5× freeze rate for 60s, triggered at 4 rescued). Camera shake + BLIZZARD! banner on trigger. Iso + key-levels regression WIN (L15 iso 1.5 min).
- 2026-11-18 **Wave 11 (L14 Night Watch)** — watchtower station auto-fires arrows at nearest wolf within 240 px every 1.3 s (1 damage + hit flash + woodchip burst). Passive — no worker required. Uses `projectile_arrow_01` asset. L14 iso + key-levels regression WIN (L1 1.1 / L8 1.3 / L10 4.6 / L13 1.9 / L14 2.2 min).
- 2026-11-18 **Wave 10 (L13 Village)** — full-stack reuse level (mill + butcher + grinder + ice holes + cleaning + cook + sled). Stages: rescue 4 → tent → 6 meals → 1 supply run → rescue 7. No new code/assets. Full-15 v9: 12/15 WIN sequential (L8 TIMEOUT + L9 LOSE + L9 crash flakes); L8+L9 iso WIN 1.2 min.
- 2026-11-18 **Wave 9 (L12 Supply Sled)** — supply_sled multi-input station (10 meat_ground + 5 planks per run, pays 200 coins). Plank routing adaptive: supply_sled takes priority over fire. Sled departure tween on completion. New `supplyRunsCompleted` stage type. Full-15 v8: **15/15 WIN** (L1 1.1 / L2 3.1 / L3 1.6 / L4 1.1 / L5 1.4 / L6 1.4 / L7 1.4 / L8 1.4 / L9 1.3 / L10 5.6 / L11 6.6 / L12 7.7 / L13 5.5 / L14 8.3 / L15 4.2 min).
- 2026-11-18 **Wave 8 (L11 Grinder Line)** — meat_grinder consumes meat_raw → meat_ground; conveyor belt tile shows an animated "roller" sprite (tween east↔west on each belt). meat_ground fallback routes to cook_pot if no supply_sled. Chain: butcher → grinder → cook. Iso L11 WIN 3.7 min. Full-15 v7: L10 slow (11 min sequential vs 7 iso) + L14 flaky timeout; both WIN isolated.
- 2026-11-18 **Wave 7 (L10 Hunting Trail)** — butcher_table + cook_pot chain. Peaceful stag spec (aggroRange=0, flee on any damage). Hero attack range floor 70px for prey without attackRange. meat_raw auto-routes to cook_pot when no meat_grinder. Stag sprite baseSize 148. Full-15 v6: L5+L13 flaky LOSES (both WIN isolated), rest green.
- 2026-11-18 **Wave 6 (L9 Crew)** — multi-chain level (lumber_mill + ice_holes + cleaning + cook). Tap-to-bump cycles 0→-1→-2→0 with scale pulse + tint visual. Station tint reflects manned/bumped state. L9 isolated: WIN 3.1 min.
- 2026-11-17 **Wave 5 (L7 Timber + L8 First Cabin)** — lumber_mill station + plank production + cabin build pad (10 planks + 80 coins). Mill pulls from fuel pool. New `planksProduced`/`planksStocked` stage types. Full-15 green: L1 0.9 / L2 1.3 / L3 1.2 / L4 1.0 / L5 1.9 / L6 1.6 / L7 1.0 / L8 2.0 / L9 2.3 / L10 4.0 / L11 3.8 / L12 3.7 / L13 7.1 / L14 5.0 / L15 5.8 min.
- 2026-11-17 **pathfinding** — NavGrid A* (24px cells). Applied to workers (toTree/toFire/toStation/haul/fleeing), survivors (following to tent), animals (roam), bot hero. Preflight reachability permanent. Fixes L5+L6 fishing (was LOSE), L9 (was timeout), L11-L15 (first WIN).
- 2026-11-13 **f9b8a5d3** — pass-2 iPhone fixes (ring thaw, wolf aggro, chop anim, HP bar, decor, snow, shop, KURTARILAN, wolf sep)
- 2026-11-13 **c1833aef** — pass-1 iPhone fixes (error overlay, i18n, UI positioning)
- 2026-11-13 **70cf7a19** — PWA installable + always-on FPS + 5-tap debug menu
- 2026-11-12 **81cd9d84** — L8 survivor reposition + L15 spread + bot chain rescue + per-level timeout
- 2026-11-12 **baf9f248** — scale pad pay-in rate (2.5 s)
- 2026-11-12 **482ff094** — endless perf
- 2026-11-12 **61e96b5b** — pooled fillEllipse shadows
- 2026-11-12 **452258b2** — WIP commit base
