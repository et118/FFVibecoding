import * as PIXI from 'pixi.js';

// ----------------------------------------------------------------------------------
// CONFIG — tweak these to fit your screen / taste
// ----------------------------------------------------------------------------------
const CONFIG = {
  // Player
  PLAYER_SCALE: 0.5,
  PLAYER_SPEED: 6,
  PLAYER_BOTTOM_OFFSET: 40, // distance from bottom of screen
  PLAYER_FIRE_COOLDOWN: 20, // frames between shots
  PLAYER_MISSILE_SPEED: 10,
  STARTING_LIVES: 3,

  // Enemies
  ENEMY_SCALE: 0.4,
  ENEMY_ROWS: 5,
  ENEMY_COLS: 8,
  ENEMY_H_SPACING_MIN: 45,  // narrowest allowed gap between enemy columns
  ENEMY_H_SPACING_MAX: 90,  // widest allowed gap (keeps them from spreading too thin on huge screens)
  ENEMY_V_SPACING: 55,   // vertical gap between enemy rows
  ENEMY_TOP_MARGIN: 80,  // distance from top of screen to first row
  ENEMY_EDGE_MARGIN: 40, // how close enemies can get to screen edges before turning
  ENEMY_H_SPEED: 1.2,
  ENEMY_DROP_AMOUNT: 20,
  ENEMY_FIRE_CHANCE: 0.003, // probability per eligible enemy, per frame
  ENEMY_MISSILE_SPEED: 5,

  // Bunkers
  BUNKER_SCALE: 0.7,
  BUNKER_COUNT: 4,
  BUNKER_BOTTOM_OFFSET: 200,  // distance from bottom of screen
  BUNKER_MAX_HITS: 5,         // hits until a bunker disappears
};

const ASSET_PATHS = {
  player: 'src/assets/Ships/spaceShips_002.png',
  enemy: 'src/assets/Aliens/shipBlue_manned.png',
  playerMissile: 'src/assets/Missiles/spaceMissiles_001.png',
  enemyMissile: 'src/assets/Missiles/spaceMissiles_003.png',
  bunker: 'src/assets/Building/spaceBuilding_006.png',
  background: 'src/assets/Backgrounds/space_stars.jpg',
};

// ----------------------------------------------------------------------------------
// APP SETUP
// ----------------------------------------------------------------------------------
const app = new PIXI.Application();

async function main() {
  // Make the page/canvas fill the whole viewport.
  const style = document.createElement('style');
  style.textContent = `
    html, body { margin: 0; padding: 0; overflow: hidden; background: #000; height: 100%; }
    canvas { display: block; }
  `;
  document.head.appendChild(style);

  await app.init({
    resizeTo: window,
    backgroundColor: 0x000000,
    antialias: true,
  });
  document.body.appendChild(app.canvas);

  const textures = await PIXI.Assets.load(Object.values(ASSET_PATHS));
  const T = {
    player: textures[ASSET_PATHS.player],
    enemy: textures[ASSET_PATHS.enemy],
    playerMissile: textures[ASSET_PATHS.playerMissile],
    enemyMissile: textures[ASSET_PATHS.enemyMissile],
    bunker: textures[ASSET_PATHS.bunker],
    background: textures[ASSET_PATHS.background],
  };

  const game = new Game(app, T);
  game.start();
}

// ----------------------------------------------------------------------------------
// BUNKER — fades out over BUNKER_MAX_HITS hits, then disappears
// ----------------------------------------------------------------------------------
class Bunker {
  constructor(texture, x, y, scale) {
    this.sprite = new PIXI.Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(scale);
    this.sprite.x = x;
    this.sprite.y = y;
    this.hits = 0;
    this.destroyed = false;
  }

  // Returns true if this hit destroyed the bunker.
  registerHit() {
    this.hits++;
    this.sprite.alpha = Math.max(0, 1 - this.hits / CONFIG.BUNKER_MAX_HITS);
    if (this.hits >= CONFIG.BUNKER_MAX_HITS) {
      this.destroyed = true;
    }
    return this.destroyed;
  }

  getBounds() {
    return this.sprite.getBounds();
  }
}

// ----------------------------------------------------------------------------------
// GAME
// ----------------------------------------------------------------------------------
// States: 'start' -> 'playing' -> 'gameover' | 'won' -> (space/enter) -> 'playing'
class Game {
  constructor(app, textures) {
    this.app = app;
    this.textures = textures;
    this.state = 'start';

    // Background (behind everything, scaled to fit width without distortion)
    this.background = new PIXI.Sprite(textures.background);
    this.background.anchor.set(0.5);
    this.app.stage.addChild(this.background);

    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);

    this.hud = new PIXI.Container();
    this.app.stage.addChild(this.hud);

    this.keys = new Set();
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      const isConfirm = e.code === 'Space' || e.code === 'Enter';
      if (isConfirm && this.state !== 'playing') {
        this.beginRound();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('resize', () => this.layout());

    this.buildHud();
    this.layout();
  }

  get screenWidth() {
    return this.app.screen.width;
  }

  get screenHeight() {
    return this.app.screen.height;
  }

  buildHud() {
    const style = new PIXI.TextStyle({
      fill: 0xffffff,
      fontFamily: 'monospace',
      fontSize: 20,
    });
    this.scoreText = new PIXI.Text({ text: 'SCORE: 0', style });
    this.scoreText.x = 10;
    this.scoreText.y = 10;
    this.scoreText.visible = false;
    this.hud.addChild(this.scoreText);

    this.livesText = new PIXI.Text({ text: 'LIVES: 3', style });
    this.livesText.visible = false;
    this.hud.addChild(this.livesText);

    this.messageText = new PIXI.Text({
      text: 'SPACE INVADERS\n\nPress SPACE to start',
      style: new PIXI.TextStyle({
        fill: 0xffffff,
        fontFamily: 'monospace',
        fontSize: 36,
        align: 'center',
      }),
    });
    this.messageText.anchor.set(0.5);
    this.messageText.visible = true;
    this.hud.addChild(this.messageText);
  }

  layout() {
    // Background: scale uniformly so its width matches the screen width
    // (no stretching / aspect-ratio distortion).
    if (this.background.texture && this.background.texture.width) {
      const scale = this.screenWidth / this.background.texture.width;
      this.background.scale.set(scale);
      this.background.x = this.screenWidth / 2;
      this.background.y = this.screenHeight / 2;
    }

    this.livesText.x = this.screenWidth - 130;
    this.livesText.y = 10;
    this.messageText.x = this.screenWidth / 2;
    this.messageText.y = this.screenHeight / 2;
    if (this.player) {
      this.player.x = Math.max(20, Math.min(this.screenWidth - 20, this.player.x));
    }
  }

  start() {
    this.app.ticker.add((ticker) => this.update(ticker.deltaTime));
  }

  // Called when leaving 'start'/'gameover'/'won' to begin a fresh round.
  beginRound() {
    this.world.removeChildren();

    this.score = 0;
    this.lives = CONFIG.STARTING_LIVES;
    this.fireCooldown = 0;
    this.enemyDirection = 1;

    this.messageText.visible = false;
    this.scoreText.visible = true;
    this.livesText.visible = true;

    // Player
    this.player = new PIXI.Sprite(this.textures.player);
    this.player.anchor.set(0.5);
    this.player.x = this.screenWidth / 2;
    this.player.y = this.screenHeight - CONFIG.PLAYER_BOTTOM_OFFSET;
    this.player.scale.set(CONFIG.PLAYER_SCALE);
    this.world.addChild(this.player);

    // Enemies — grid centered horizontally, spacing/column count adapt to screen width
    this.enemies = [];
    const { cols, rows, spacingX } = this.computeEnemyLayout();
    const gridWidth = (cols - 1) * spacingX;
    const startX = (this.screenWidth - gridWidth) / 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const enemy = new PIXI.Sprite(this.textures.enemy);
        enemy.anchor.set(0.5);
        enemy.scale.set(CONFIG.ENEMY_SCALE);
        enemy.x = startX + col * spacingX;
        enemy.y = CONFIG.ENEMY_TOP_MARGIN + row * CONFIG.ENEMY_V_SPACING;
        enemy.alive = true;
        enemy.col = col;
        this.world.addChild(enemy);
        this.enemies.push(enemy);
      }
    }

    // Bunkers — spaced evenly across the current screen width
    this.bunkers = [];
    const bunkerSpacing = this.screenWidth / (CONFIG.BUNKER_COUNT + 1);
    for (let i = 0; i < CONFIG.BUNKER_COUNT; i++) {
      const bunker = new Bunker(
        this.textures.bunker,
        bunkerSpacing * (i + 1),
        this.screenHeight - CONFIG.BUNKER_BOTTOM_OFFSET,
        CONFIG.BUNKER_SCALE
      );
      this.world.addChild(bunker.sprite);
      this.bunkers.push(bunker);
    }

    // Missiles
    this.playerMissiles = [];
    this.enemyMissiles = [];

    this.updateHud();
    this.state = 'playing';
  }

  updateHud() {
    this.scoreText.text = `SCORE: ${this.score}`;
    this.livesText.text = `LIVES: ${this.lives}`;
  }

  // Works out how many columns fit and how wide the gaps between them should be,
  // given the current screen width. This is what keeps the formation from
  // overflowing (and endlessly bouncing/dropping) on narrow screens, and keeps
  // it from sitting as a tiny clump on very wide ones.
  computeEnemyLayout() {
    const margin = CONFIG.ENEMY_EDGE_MARGIN;
    const availableWidth = Math.max(
      this.screenWidth - margin * 2,
      CONFIG.ENEMY_H_SPACING_MIN
    );

    // Most columns that still fit using at least the minimum spacing.
    const maxColsThatFit = Math.max(
      1,
      Math.floor(availableWidth / CONFIG.ENEMY_H_SPACING_MIN) + 1
    );
    const cols = Math.min(CONFIG.ENEMY_COLS, maxColsThatFit);

    // Spacing grows to fill the available width (up to a cap) so the
    // formation uses more of a wide screen instead of floating as a clump.
    const rawSpacing = cols > 1 ? availableWidth / (cols - 1) : 0;
    const spacingX = Math.min(CONFIG.ENEMY_H_SPACING_MAX, rawSpacing);

    // If columns had to shrink to fit, add rows to keep the total enemy
    // count (roughly) the same as the configured ROWS x COLS.
    const totalEnemies = CONFIG.ENEMY_ROWS * CONFIG.ENEMY_COLS;
    const rows = Math.max(CONFIG.ENEMY_ROWS, Math.ceil(totalEnemies / cols));

    return { cols, rows, spacingX };
  }

  update(delta) {
    if (this.state !== 'playing') return;

    this.handleInput();
    this.updateEnemies(delta);
    this.updateMissiles(delta);
    this.checkCollisions();
    this.checkWinLose();
  }

  handleInput() {
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) {
      this.player.x -= CONFIG.PLAYER_SPEED;
    }
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) {
      this.player.x += CONFIG.PLAYER_SPEED;
    }
    this.player.x = Math.max(20, Math.min(this.screenWidth - 20, this.player.x));

    if (this.fireCooldown > 0) this.fireCooldown--;

    if (this.keys.has('Space') && this.fireCooldown <= 0) {
      this.firePlayerMissile();
      this.fireCooldown = CONFIG.PLAYER_FIRE_COOLDOWN;
    }
  }

  firePlayerMissile() {
    const missile = new PIXI.Sprite(this.textures.playerMissile);
    missile.anchor.set(0.5);
    missile.scale.set(0.6);
    missile.x = this.player.x;
    missile.y = this.player.y - 30;
    this.world.addChild(missile);
    this.playerMissiles.push(missile);
  }

  fireEnemyMissile(enemy) {
    const missile = new PIXI.Sprite(this.textures.enemyMissile);
    missile.anchor.set(0.5);
    missile.rotation = Math.PI; // flip 180° so it faces downward, toward the player
    missile.scale.set(0.6);
    missile.x = enemy.x;
    missile.y = enemy.y + 20;
    this.world.addChild(missile);
    this.enemyMissiles.push(missile);
  }

  updateEnemies(delta) {
    const aliveEnemies = this.enemies.filter((e) => e.alive);
    if (aliveEnemies.length === 0) return;

    let hitEdge = false;
    for (const enemy of aliveEnemies) {
      enemy.x += CONFIG.ENEMY_H_SPEED * this.enemyDirection * delta;
      if (
        enemy.x < CONFIG.ENEMY_EDGE_MARGIN ||
        enemy.x > this.screenWidth - CONFIG.ENEMY_EDGE_MARGIN
      ) {
        hitEdge = true;
      }
    }

    if (hitEdge) {
      this.enemyDirection *= -1;
      for (const enemy of aliveEnemies) {
        enemy.y += CONFIG.ENEMY_DROP_AMOUNT;
      }
    }

    // Only the frontmost (bottom-most) alive enemy per column fires.
    const bottomByColumn = new Map();
    for (const enemy of aliveEnemies) {
      const current = bottomByColumn.get(enemy.col);
      if (!current || enemy.y > current.y) bottomByColumn.set(enemy.col, enemy);
    }

    for (const enemy of bottomByColumn.values()) {
      if (Math.random() < CONFIG.ENEMY_FIRE_CHANCE) {
        this.fireEnemyMissile(enemy);
      }
    }
  }

  updateMissiles(delta) {
    for (let i = this.playerMissiles.length - 1; i >= 0; i--) {
      const m = this.playerMissiles[i];
      m.y -= CONFIG.PLAYER_MISSILE_SPEED * delta;
      if (m.y < -20) this.removeMissile(this.playerMissiles, i);
    }

    for (let i = this.enemyMissiles.length - 1; i >= 0; i--) {
      const m = this.enemyMissiles[i];
      m.y += CONFIG.ENEMY_MISSILE_SPEED * delta;
      if (m.y > this.screenHeight + 20) this.removeMissile(this.enemyMissiles, i);
    }
  }

  removeMissile(list, index) {
    const m = list[index];
    this.world.removeChild(m);
    m.destroy();
    list.splice(index, 1);
  }

  intersects(a, b) {
    const ab = a.getBounds();
    const bb = b.getBounds();
    return (
      ab.x < bb.x + bb.width &&
      ab.x + ab.width > bb.x &&
      ab.y < bb.y + bb.height &&
      ab.y + ab.height > bb.y
    );
  }

  checkCollisions() {
    // Player missiles vs enemies / bunkers
    for (let i = this.playerMissiles.length - 1; i >= 0; i--) {
      const missile = this.playerMissiles[i];
      let hit = false;

      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (this.intersects(missile, enemy)) {
          enemy.alive = false;
          this.world.removeChild(enemy);
          this.score += 10;
          this.updateHud();
          hit = true;
          break;
        }
      }

      if (!hit) {
        for (const bunker of this.bunkers) {
          if (bunker.destroyed) continue;
          if (this.intersects(missile, bunker.sprite)) {
            if (bunker.registerHit()) {
              this.world.removeChild(bunker.sprite);
            }
            hit = true;
            break;
          }
        }
      }

      if (hit) this.removeMissile(this.playerMissiles, i);
    }

    // Enemy missiles vs bunkers / player
    for (let i = this.enemyMissiles.length - 1; i >= 0; i--) {
      const missile = this.enemyMissiles[i];
      let hit = false;

      for (const bunker of this.bunkers) {
        if (bunker.destroyed) continue;
        if (this.intersects(missile, bunker.sprite)) {
          if (bunker.registerHit()) {
            this.world.removeChild(bunker.sprite);
          }
          hit = true;
          break;
        }
      }

      if (!hit && this.intersects(missile, this.player)) {
        hit = true;
        this.loseLife();
      }

      if (hit) this.removeMissile(this.enemyMissiles, i);
    }
  }

  loseLife() {
    this.lives--;
    this.updateHud();
    if (this.lives <= 0) {
      this.endGame(false);
    } else {
      this.player.x = this.screenWidth / 2;
    }
  }

  checkWinLose() {
    const aliveEnemies = this.enemies.filter((e) => e.alive);

    if (aliveEnemies.length === 0) {
      this.endGame(true);
      return;
    }

    for (const enemy of aliveEnemies) {
      if (enemy.y > this.player.y - 20) {
        this.endGame(false);
        return;
      }
    }
  }

  endGame(won) {
    this.state = won ? 'won' : 'gameover';
    this.messageText.text = won
      ? `YOU WIN!\nSCORE: ${this.score}\n\nPress SPACE to play again`
      : `GAME OVER\nSCORE: ${this.score}\n\nPress SPACE to play again`;
    this.messageText.visible = true;
  }
}

main();