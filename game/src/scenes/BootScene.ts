import Phaser from 'phaser';

const ASSETS = [
  'building_archway_gate_01', 'building_barracks_01', 'building_cauldron_firepit_01',
  'building_central_tower_01', 'building_conveyor_belt_system', 'building_furnace_heating_01',
  'building_giant_wheel_grinder', 'building_log_cabin_01', 'building_lumber_mill_01',
  'building_perimeter_wall_wooden', 'building_research_lab_01', 'building_road_grid_01',
  'building_small_hut_01', 'building_storage_crate_stacks', 'building_tent_canvas_01',
  'building_tunnel_arch_01', 'building_turret_defense_01', 'building_upgrade_scaffold_01',
  'building_watchtower_01', 'character_enemy_troop_01', 'character_survivor_worker_01',
  'character_survivor_walk_left', 'character_survivor_walk_right',
  'character_survivor_back_idle', 'character_survivor_back_left', 'character_survivor_back_right',
  'effect_blizzard_snow_particles', 'effect_fire_explosion_01', 'effect_ice_freeze_shatter',
  'effect_smoke_chimney_01', 'effect_sparkle_reward_burst', 'enemy_grey_wolf_01',
  'prop_barrel_01', 'prop_bench_01', 'prop_blue_resource_crystal', 'prop_campfire_01',
  'prop_frozen_tree_dead_01', 'prop_green_resource_crate', 'prop_igloo_01',
  'prop_meat_table_01', 'prop_snow_pine_tree_01', 'prop_vehicle_excavator_01',
  'prop_vehicle_snowmobile_01', 'prop_warning_sign_red', 'resource_coin_gold_01',
  'resource_food_icon_green', 'resource_meat_icon_red', 'resource_meat_log_roll_01',
  'resource_meat_pile_01', 'resource_wood_logs_01', 'resource_wood_planks_01',
  'tile_base_floor_dirt_01', 'tile_frozen_ground_01', 'tile_road_paved_urban_01',
  'tile_snow_drift_mound_01',
];

export default class BootScene extends Phaser.Scene {
  private barBg!: Phaser.GameObjects.Graphics;
  private barFill!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Loading bar background
    this.barBg = this.add.graphics();
    this.barBg.fillStyle(0x333333, 1);
    this.barBg.fillRect(45, 410, 300, 16);

    this.barFill = this.add.graphics();

    this.add.text(195, 390, 'Loading...', {
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5, 1);

    this.load.on('progress', (value: number) => {
      this.barFill.clear();
      this.barFill.fillStyle(0xffffff, 1);
      this.barFill.fillRect(45, 410, 300 * value, 16);
    });

    for (const key of ASSETS) {
      this.load.image(key, `assets/${key}.png`);
    }

    // Character texture atlases (optimized WebP, trimmed, 4096×4096 max)
    this.load.multiatlas('hero',   'assets/sprites/hero/atlas.json',       'assets/sprites/hero/');
    this.load.multiatlas('worker', 'assets/sprites/worker_new/atlas.json', 'assets/sprites/worker_new/');
  }

  create(): void {
    this.scene.start('GameScene');
  }
}
