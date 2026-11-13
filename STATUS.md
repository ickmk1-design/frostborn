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
| 4 | L6 Wolves-at-the-Lake (reuses wolf assets) | 0.5 d | L6 — wolves break fishing chain, hero clears, chain resumes | pending |
| 5 | Assets B (lumber mill, planks, cabin stages) + L7 mill + L8 cabin | 2 d | L7 planks + L8 shelter capacity gate | pending |
| 6 | Worker-assignment UI (tap-to-bump-priority) + L9 Crew | 1 d | L9 — 2 parallel chains | pending |
| 7 | Assets C (butcher table, carcass; stag via Blender) + L10 hunting | 2 d | L10 hunt → butcher → cook chain | pending |
| 8 | Assets D (grinder, conveyor strip, meat chunks) + L11 visible conveyor | 1.5 d | L11 — meat rides the belt | pending |
| 9 | Assets E (supply sled, dock) + L12 sled run (200 coin/run) | 1 d | L12 — load, depart, coins land | pending |
| 10 | L13 Village (parallel chains, no new assets) | 0.5 d | L13 untutored full stack | pending |
| 11 | Assets F (watchtower, lookout pose, arrow sprite) + L14 siege + tower damage/slow | 1.5 d | L14 — tower picks off wolves while sled runs | pending |
| 12 | L15 Grand Alpha + blizzard | 1 d | L15 full-system win | pending |
| 13 | Endless Winter: port stations + chains | 1 d | Endless wave 5+ uses stations | pending |

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

## Deployment log

- 2026-11-13 **f9b8a5d3** — pass-2 iPhone fixes (ring thaw, wolf aggro, chop anim, HP bar, decor, snow, shop, KURTARILAN, wolf sep)
- 2026-11-13 **c1833aef** — pass-1 iPhone fixes (error overlay, i18n, UI positioning)
- 2026-11-13 **70cf7a19** — PWA installable + always-on FPS + 5-tap debug menu
- 2026-11-12 **81cd9d84** — L8 survivor reposition + L15 spread + bot chain rescue + per-level timeout
- 2026-11-12 **baf9f248** — scale pad pay-in rate (2.5 s)
- 2026-11-12 **482ff094** — endless perf
- 2026-11-12 **61e96b5b** — pooled fillEllipse shadows
- 2026-11-12 **452258b2** — WIP commit base
