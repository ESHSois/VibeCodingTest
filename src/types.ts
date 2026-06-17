export type GameState = 'START' | 'PLAYING' | 'UPGRADE_SHOP' | 'GAMEOVER' | 'VICTORY';

export interface PlayerStats {
  hp: number;
  maxHp: number;
  damage: number;
  fireRate: number; // bullets per second
  bulletSpeed: number;
  bulletCount: number; // 1, 2, 3, 5, etc.
  bulletPierce: number; // how many enemies a bullet can Pierce
  bulletSize: number;
  homingCount: number; // number of homing missiles fired per cycle
  shieldHp: number;
  maxShieldHp: number;
  magnetRange: number;
  gold: number;
  score: number;
  stage: number;
}

export interface Gate {
  id: string;
  y: number;
  height: number;
  leftGate: GateOption;
  rightGate: GateOption;
  passed: boolean;
}

export type GateType = 'DAMAGE' | 'FIRERATE' | 'BULLETCOUNT' | 'PIERCE' | 'BULLETSPEED' | 'BULLETSIZE' | 'HOMING' | 'SHIELD' | 'GOLD';

export interface GateOption {
  type: GateType;
  value: number;
  text: string;
  color: string; // e.g., '#ef4444' for damage
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  size: number;
  color: string;
  pierceRemaining: number;
  isHoming: boolean;
  targetId: string | null;
}

export interface EnemyType {
  name: string;
  color: string;
  size: number;
  hpMultiplier: number;
  speedMultiplier: number;
  scoreValue: number;
  goldValue: number;
  shape: 'circle' | 'square' | 'triangle' | 'star';
  shootInterval?: number;
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  size: number;
  color: string;
  shape: 'circle' | 'square' | 'triangle' | 'star';
  scoreValue: number;
  goldValue: number;
  shootTimer: number;
  shootInterval: number;
  isBoss: boolean;
  phase?: number;
  bossPatternTimer?: number;
}

export interface BossBullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  damage: number;
  isHoming?: boolean;
  color?: string;
}

export interface Crystal {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  color: string;
  type: 'gold' | 'heal';
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number; // 0 to 1
  decay: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export interface ShopUpgrade {
  id: string;
  name: string;
  description: string;
  cost: number;
  level: number;
  maxLevel: number;
  icon: string;
}

export interface Chest {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  claimed: boolean;
}

export interface HelperNPC {
  id: string;
  shootTimer: number;
  angleOffset: number; // rotation offset around player
}

