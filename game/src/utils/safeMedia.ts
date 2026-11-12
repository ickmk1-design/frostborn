import Phaser from 'phaser';

/**
 * Plays a sound only if the key exists in the audio cache.
 * Silently skips and warns if missing — never throws.
 */
export function safePlay(
  scene: Phaser.Scene,
  key: string,
  config?: Phaser.Types.Sound.SoundConfig,
): void {
  if (!scene.cache.audio.exists(key)) {
    console.warn(`[audio] key not in cache: ${key}`);
    return;
  }
  try { scene.sound.play(key, config); } catch (e) { console.warn(`[audio] play failed: ${key}`, e); }
}

/**
 * Adds a sound instance only if the key exists in the audio cache.
 * Returns null and warns if missing — never throws.
 */
export function safeAdd(
  scene: Phaser.Scene,
  key: string,
  config?: Phaser.Types.Sound.SoundConfig,
): Phaser.Sound.BaseSound | null {
  if (!scene.cache.audio.exists(key)) {
    console.warn(`[audio] key not in cache: ${key}`);
    return null;
  }
  try { return scene.sound.add(key, config); } catch (e) { console.warn(`[audio] add failed: ${key}`, e); return null; }
}

/**
 * Creates an image game object only if the texture exists.
 * Returns a 1×1 invisible placeholder if missing.
 */
export function safeImage(
  scene: Phaser.Scene,
  x: number, y: number,
  key: string,
): Phaser.GameObjects.Image {
  if (!scene.textures.exists(key)) {
    console.warn(`[texture] key not found: ${key}`);
    return scene.add.image(x, y, '__DEFAULT').setVisible(false);
  }
  return scene.add.image(x, y, key);
}

/**
 * Creates a sprite game object only if the texture/atlas exists.
 * Returns a 1×1 invisible placeholder if missing.
 */
export function safeSprite(
  scene: Phaser.Scene,
  x: number, y: number,
  key: string,
  frame?: string | number,
): Phaser.GameObjects.Sprite {
  if (!scene.textures.exists(key)) {
    console.warn(`[texture] atlas/sprite key not found: ${key}`);
    const ph = scene.add.sprite(x, y, '__DEFAULT');
    ph.setVisible(false);
    return ph;
  }
  return frame !== undefined
    ? scene.add.sprite(x, y, key, frame)
    : scene.add.sprite(x, y, key);
}
