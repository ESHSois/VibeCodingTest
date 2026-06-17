import React, { useEffect, useRef, useState } from 'react';
import { 
  GameState, 
  PlayerStats, 
  Gate, 
  GateOption, 
  GateType,
  Bullet, 
  Enemy, 
  EnemyType, 
  BossBullet, 
  Crystal, 
  Particle, 
  FloatingText,
  Chest,
  HelperNPC
} from '../types';
import { audio } from '../lib/audio';
import { Sparkles, Trophy, Heart, Shield, Dumbbell, Zap, Coins, Volume2, VolumeX, ShieldAlert, LogOut, Check, ChevronRight } from 'lucide-react';

interface GameCanvasProps {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  playerStats: PlayerStats;
  setPlayerStats: React.Dispatch<React.SetStateAction<PlayerStats>>;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  onBossDefeated: (goldReward: number, scoreReward: number) => void;
}

// Fixed logical resolution for coordinate uniformity
const GAME_WIDTH = 450;
const GAME_HEIGHT = 800;

// Enemy archetypes
const ENEMY_TEMPLATES: EnemyType[] = [
  { name: 'Tank', color: '#3b82f6', size: 26, hpMultiplier: 2.5, speedMultiplier: 0.6, scoreValue: 40, goldValue: 15, shape: 'square', shootInterval: 2.8 },
  { name: 'Stinger', color: '#ec4899', size: 14, hpMultiplier: 0.5, speedMultiplier: 1.8, scoreValue: 25, goldValue: 10, shape: 'triangle', shootInterval: 1.8 },
];

export default function GameCanvas({
  gameState,
  setGameState,
  playerStats,
  setPlayerStats,
  isMuted,
  setIsMuted,
  onBossDefeated
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Game loops and animation states
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  // Input tracking
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);
  const isMouseDown = useRef<boolean>(false);
  const mouseX = useRef<number>(GAME_WIDTH / 2);
  const mouseY = useRef<number>(GAME_HEIGHT * 0.8);

  // Entities state
  const playerXInGame = useRef<number>(GAME_WIDTH / 2);
  const playerYInGame = useRef<number>(GAME_HEIGHT * 0.8);
  const playerHp = useRef<number>(playerStats.hp);
  const playerShield = useRef<number>(playerStats.shieldHp);
  const invincibilityTimer = useRef<number>(0);
  const fireTimer = useRef<number>(0);
  const homingTimer = useRef<number>(0);

  const bullets = useRef<Bullet[]>([]);
  const baseBossBullets = useRef<BossBullet[]>([]);
  const enemies = useRef<Enemy[]>([]);
  const gates = useRef<Gate[]>([]);
  const crystals = useRef<Crystal[]>([]);
  const particles = useRef<Particle[]>([]);
  const floatingTexts = useRef<FloatingText[]>([]);
  const chests = useRef<Chest[]>([]);
  const helperNPCs = useRef<HelperNPC[]>([]);

  // Stage progression states
  const stageProgress = useRef<number>(0); // 0 to 100
  const gate1Spawned = useRef<boolean>(false);
  const gate2Spawned = useRef<boolean>(false);
  const bossSpawned = useRef<boolean>(false);
  const bossActive = useRef<boolean>(false);
  const bossDefeatedSequence = useRef<boolean>(false);
  const bossAlertTimer = useRef<number>(0); // Siren alert flash
  
  // Scoring / Gold Session records
  const sessionScore = useRef<number>(0);
  const sessionGold = useRef<number>(0);
  
  // Screen shake
  const screenShake = useRef<number>(0);

  // Background smooth scrolling accumulator
  const backgroundScrollY = useRef<number>(0);

  // Boss Reward Modal Selection State (Pause Game during choose)
  const [showRewardModal, setShowRewardModal] = useState<boolean>(false);
  const showRewardModalRef = useRef<boolean>(false);
  useEffect(() => {
    showRewardModalRef.current = showRewardModal;
  }, [showRewardModal]);

  // Test mode flag
  const [testMode, setTestMode] = useState<boolean>(false);
  const testModeRef = useRef<boolean>(false);
  useEffect(() => {
    testModeRef.current = testMode;
  }, [testMode]);

  // Synchronise refs with stats when entering shop or when changed externally
  useEffect(() => {
    playerHp.current = playerStats.hp;
    playerShield.current = playerStats.shieldHp;
  }, [playerStats.hp, playerStats.shieldHp, gameState]);

  // Handle keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = true;
      if (e.key === 'p' || e.key === 'P') {
        // Simple pause/unpause if playing
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Initialize stage/restart parameters
  const resetGameSession = (stageNum: number) => {
    bullets.current = [];
    baseBossBullets.current = [];
    enemies.current = [];
    gates.current = [];
    crystals.current = [];
    particles.current = [];
    floatingTexts.current = [];
    chests.current = [];
    helperNPCs.current = [];
    
    stageProgress.current = 0;
    gate1Spawned.current = false;
    gate2Spawned.current = false;
    bossSpawned.current = false;
    bossActive.current = false;
    bossDefeatedSequence.current = false;
    bossAlertTimer.current = 0;
    
    playerXInGame.current = GAME_WIDTH / 2;
    playerYInGame.current = GAME_HEIGHT * 0.8;
    
    // Set hp/shield based on stats
    playerHp.current = playerStats.hp;
    playerShield.current = playerStats.shieldHp;
    invincibilityTimer.current = 0;
    
    // Set dynamic timers
    fireTimer.current = 0;
    homingTimer.current = 0;
  };

  useEffect(() => {
    if (gameState === 'PLAYING') {
      resetGameSession(playerStats.stage);
    }
  }, [gameState, playerStats.stage]);

  // Utility to generate unique gate options based on player stats and stage scaling
  const generateGateOptions = (stage: number): { left: GateOption; right: GateOption } => {
    const gateTypes: GateType[] = ['DAMAGE', 'FIRERATE', 'BULLETCOUNT', 'PIERCE', 'BULLETSPEED', 'BULLETSIZE', 'HOMING', 'SHIELD'];
    
    // Pick two distinct types
    let leftType = gateTypes[Math.floor(Math.random() * gateTypes.length)];
    let rightType = gateTypes[Math.floor(Math.random() * gateTypes.length)];
    while (leftType === rightType) {
      rightType = gateTypes[Math.floor(Math.random() * gateTypes.length)];
    }

    const valueCalculator = (type: GateType): { val: number; text: string; color: string } => {
      const scaleMultiplier = 1 + (stage - 1) * 0.15;
      switch (type) {
        case 'DAMAGE':
          const dmg = Math.ceil((Math.floor(Math.random() * 2) + 1) * scaleMultiplier);
          return { val: dmg, text: `攻撃力 +${dmg}`, color: '#ef4444' };
        case 'FIRERATE':
          const fr = Math.ceil(15 + Math.random() * 15);
          return { val: fr / 100, text: `連射力 +${fr}%`, color: '#10b981' };
        case 'BULLETCOUNT':
          const chance = Math.random();
          const bc = chance > 0.85 ? 2 : 1;
          return { val: bc, text: `弾数 +${bc}`, color: '#a855f7' };
        case 'PIERCE':
          return { val: 1, text: '貫通数 +1', color: '#f59e0b' };
        case 'BULLETSPEED':
          const sp = Math.ceil(15 + Math.random() * 20);
          return { val: sp / 100, text: `弾速 +${sp}%`, color: '#06b6d4' };
        case 'BULLETSIZE':
          const sz = Math.ceil(20 + Math.random() * 25);
          return { val: sz / 100, text: `弾形 +${sz}%`, color: '#ec4899' };
        case 'HOMING':
          return { val: 1, text: '誘導ミサイル +1', color: '#eab308' };
        case 'SHIELD':
          return { val: 1, text: 'シールド +1', color: '#3b82f6' };
        case 'GOLD':
          const g = Math.ceil((25 + Math.floor(Math.random() * 50)) * scaleMultiplier);
          return { val: g, text: `ゴールド +${g}`, color: '#eab308' };
        default:
          return { val: 10, text: 'ゴールド +10', color: '#eab308' };
      }
    };

    const leftDetails = valueCalculator(leftType);
    const rightDetails = valueCalculator(rightType);

    return {
      left: { type: leftType, value: leftDetails.val, text: leftDetails.text, color: leftDetails.color },
      right: { type: rightType, value: rightDetails.val, text: rightDetails.text, color: rightDetails.color },
    };
  };

  // Trigger floating text
  const addFloatingText = (x: number, y: number, text: string, color: string) => {
    floatingTexts.current.push({
      id: Math.random().toString(),
      x,
      y,
      text,
      color,
      life: 1.0,
    });
  };

  // Handle Boss Defeated Reward selection
  const handleSelectReward = (rewardType: 'hp_increase' | 'shield' | 'damage') => {
    audio.playStageCleared();

    // 1. Apply selected reward
    if (rewardType === 'hp_increase') {
      // HP Increase +10 to +50
      const hpInc = Math.floor(Math.random() * 41) + 10;
      setPlayerStats(prev => {
        const newMaxHp = prev.maxHp + hpInc;
        const newHp = prev.hp + hpInc;
        playerHp.current = newHp;
        return {
          ...prev,
          maxHp: newMaxHp,
          hp: newHp
        };
      });
      addFloatingText(playerXInGame.current, playerYInGame.current - 45, `❤️HP＋${hpInc}!`, '#10b981');
    } else if (rewardType === 'shield') {
      // Full restore shield
      playerShield.current = playerStats.maxShieldHp;
      setPlayerStats(prev => ({
        ...prev,
        shieldHp: prev.maxShieldHp
      }));
      addFloatingText(playerXInGame.current, playerYInGame.current - 45, "🛡️シールド全回復!", '#06b6d4');
    } else if (rewardType === 'damage') {
      // +10 to +30 damage
      const dmgInc = Math.floor(Math.random() * 21) + 10;
      setPlayerStats(prev => ({
        ...prev,
        damage: prev.damage + dmgInc
      }));
      addFloatingText(playerXInGame.current, playerYInGame.current - 45, `💥弾ダメージ＋${dmgInc}!`, '#f59e0b');
    }

    // 2. Perform next stage progression and save state
    setPlayerStats(prev => {
      const nextStg = prev.stage + 1;
      const totalGold = prev.gold + 250 * prev.stage;
      const totalScore = prev.score + 1000 * prev.stage;
      localStorage.setItem('pgs_gold_count', String(totalGold));
      
      let curHighScore = parseFloat(localStorage.getItem('pgs_high_score') || '0');
      if (totalScore > curHighScore) {
        localStorage.setItem('pgs_high_score', String(totalScore));
      }

      return {
        ...prev,
        stage: nextStg,
        gold: totalGold,
        score: totalScore
      };
    });

    // Reset loop & stage progres markers
    bossDefeatedSequence.current = false;
    bossActive.current = false;
    bossSpawned.current = false;
    stageProgress.current = 0;
    gate1Spawned.current = false;
    gate2Spawned.current = false;

    // Direct resume
    setShowRewardModal(false);
  };

  // Sparkle particle burst
  const addExplosion = (x: number, y: number, color: string, count: number = 8, scale: number = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random() * 3.5) * scale;
      particles.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: (1.5 + Math.random() * 3) * scale,
        color,
        alpha: 1.0,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.04,
      });
    }
  };

  // Apply gate selection to stats
  const applyGateUpgrade = (option: GateOption) => {
    audio.playGatePass();
    addFloatingText(playerXInGame.current, playerYInGame.current - 30, option.text, option.color);
    addExplosion(playerXInGame.current, playerYInGame.current, option.color, 15, 1.5);
    screenShake.current = 8;

    setPlayerStats(prev => {
      const updated = { ...prev };
      switch (option.type) {
        case 'DAMAGE':
          updated.damage += option.value;
          break;
        case 'FIRERATE':
          // Clamp fire rate between 1 and 20 shots per sec
          updated.fireRate = Math.min(20, parseFloat((updated.fireRate * (1 + option.value)).toFixed(2)));
          break;
        case 'BULLETCOUNT':
          updated.bulletCount = Math.min(8, updated.bulletCount + option.value);
          break;
        case 'PIERCE':
          updated.bulletPierce += option.value;
          break;
        case 'BULLETSPEED':
          updated.bulletSpeed = Math.min(25, parseFloat((updated.bulletSpeed * (1 + option.value)).toFixed(2)));
          break;
        case 'BULLETSIZE':
          updated.bulletSize = Math.min(4, parseFloat((updated.bulletSize * (1 + option.value)).toFixed(2)));
          break;
        case 'HOMING':
          updated.homingCount = Math.min(6, updated.homingCount + option.value);
          break;
        case 'SHIELD':
          playerShield.current = Math.min(prev.maxShieldHp, playerShield.current + option.value);
          updated.shieldHp = playerShield.current;
          break;
        case 'GOLD':
          updated.gold += option.value;
          sessionGold.current += option.value;
          break;
      }
      return updated;
    });
  };

  // Spawn enemy based on progression and stage
  const spawnEnemy = (stage: number) => {
    if (bossActive.current || bossSpawned.current) return;

    // Pick dynamic enemy types based on Stage and progression
    let allowedTemplates = [...ENEMY_TEMPLATES];
    if (stage === 1) {
      if (stageProgress.current < 45) {
        allowedTemplates = [ENEMY_TEMPLATES[1]]; // Stingers (Triangle) only
      } else {
        allowedTemplates = [ENEMY_TEMPLATES[0], ENEMY_TEMPLATES[1]]; // Tanks (Square) + Stingers (Triangle)
      }
    } else {
      // Stage 2+ has everything (Tank & Stinger)
      allowedTemplates = [...ENEMY_TEMPLATES];
    }

    const template = allowedTemplates[Math.floor(Math.random() * allowedTemplates.length)];
    const x = 30 + Math.random() * (GAME_WIDTH - 60);
    const y = -30;
    
    // Wave dynamic HP scale : grows incrementally over gameplay & stage levels
    // Multiplier scales higher as stage progress advances, reflecting game development
    const progressFactor = 1 + (stageProgress.current / 30); // scales up to +333% at 100% progress
    const stageFactor = 1 + (stage - 1) * 0.75; // Stage level scaling (Stage 1 is baseline, Stage 2 has +75% HP scale, Stage 3 has +150%)
    
    // 敵のHPをプレイヤーの現在の攻撃力の10倍に変更（敵テンプレートやステージ数、進行度に応じて調整可能にする場合は template.hpMultiplier も掛け合わせる）
    const baseHp = playerStats.damage * 10 * template.hpMultiplier;
    const finalHp = Math.max(1, Math.round(baseHp));

    // All enemy starting horizontal velocity is 0 to move perfectly straight down
    let vx = 0;

    enemies.current.push({
      id: Math.random().toString(),
      x,
      y,
      vx,
      vy: (1.2 + Math.random() * 1.5) * template.speedMultiplier * 0.5,
      hp: finalHp,
      maxHp: finalHp,
      size: template.size,
      color: template.color,
      shape: template.shape,
      scoreValue: Math.round(template.scoreValue * stageFactor),
      goldValue: Math.round(template.goldValue * stageFactor),
      shootTimer: Math.random() * (template.shootInterval || 0),
      shootInterval: template.shootInterval || 0,
      isBoss: false,
    });
  };

  // Spawn dual selection power-up gates
  const spawnGate = (stage: number) => {
    if (bossActive.current || bossSpawned.current) return;
    
    const options = generateGateOptions(stage);
    gates.current.push({
      id: Math.random().toString(),
      y: -60,
      height: 44,
      leftGate: options.left,
      rightGate: options.right,
      passed: false
    });
  };

  // Player shoot execution
  const executePlayerShoot = () => {
    const stats = playerStats;
    audio.playShoot('normal');

    const coreX = playerXInGame.current;
    const coreY = playerYInGame.current - 18;
    const bSpeed = stats.bulletSpeed;
    const bDmg = testModeRef.current ? 9999999 : stats.damage;
    const bSize = 5 + (stats.bulletSize * 3);
    const bColor = testModeRef.current ? '#ff00ff' : '#00ffff';
    const bPierce = testModeRef.current ? 999999 : stats.bulletPierce;

    if (stats.bulletCount === 1) {
      bullets.current.push({
        id: Math.random().toString(),
        x: coreX,
        y: coreY,
        vx: 0,
        vy: -bSpeed,
        damage: bDmg,
        size: bSize,
        color: bColor,
        pierceRemaining: bPierce,
        isHoming: false,
        targetId: null,
      });
    } else if (stats.bulletCount === 2) {
      // Parallel bullets
      bullets.current.push({
        id: Math.random().toString(),
        x: coreX - 12,
        y: coreY,
        vx: 0,
        vy: -bSpeed,
        damage: bDmg,
        size: bSize,
        color: bColor,
        pierceRemaining: bPierce,
        isHoming: false,
        targetId: null,
      });
      bullets.current.push({
        id: Math.random().toString(),
        x: coreX + 12,
        y: coreY,
        vx: 0,
        vy: -bSpeed,
        damage: bDmg,
        size: bSize,
        color: bColor,
        pierceRemaining: bPierce,
        isHoming: false,
        targetId: null,
      });
    } else if (stats.bulletCount === 3) {
      // Spread layout
      bullets.current.push({
        id: Math.random().toString(),
        x: coreX,
        y: coreY,
        vx: 0,
        vy: -bSpeed,
        damage: bDmg,
        size: bSize,
        color: bColor,
        pierceRemaining: bPierce,
        isHoming: false,
        targetId: null,
      });
      bullets.current.push({
        id: Math.random().toString(),
        x: coreX - 8,
        y: coreY,
        vx: -1.5,
        vy: -bSpeed + 0.5,
        damage: bDmg,
        size: bSize,
        color: bColor,
        pierceRemaining: bPierce,
        isHoming: false,
        targetId: null,
      });
      bullets.current.push({
        id: Math.random().toString(),
        x: coreX + 8,
        y: coreY,
        vx: 1.5,
        vy: -bSpeed + 0.5,
        damage: bDmg,
        size: bSize,
        color: bColor,
        pierceRemaining: bPierce,
        isHoming: false,
        targetId: null,
      });
    } else {
      // Multi angle spread/arcs for 4+ bullets
      const midIdx = (stats.bulletCount - 1) / 2;
      for (let i = 0; i < stats.bulletCount; i++) {
        const offsetAngle = (i - midIdx) * 0.18; // spread angle
        bullets.current.push({
          id: Math.random().toString(),
          x: coreX + (i - midIdx) * 6,
          y: coreY,
          vx: bSpeed * Math.sin(offsetAngle),
          vy: -bSpeed * Math.cos(offsetAngle),
          damage: bDmg,
          size: bSize,
          color: bColor,
          pierceRemaining: bPierce,
          isHoming: false,
          targetId: null,
        });
      }
    }
  };

  // Launch tracking homing missiles
  const executeHomingMissiles = () => {
    const stats = playerStats;
    if (stats.homingCount <= 0 || enemies.current.length === 0) return;

    audio.playShoot('homing');
    const startX = playerXInGame.current;
    const startY = playerYInGame.current;

    for (let i = 0; i < stats.homingCount; i++) {
      // Find suitable target
      let targetId: string | null = null;
      if (enemies.current.length > 0) {
        // distribute target indices or pick sequential close ones
        const idx = i % enemies.current.length;
        targetId = enemies.current[idx].id;
      }

      // Fan out initially, then target tracks
      const spreadX = (i - (stats.homingCount - 1) / 2) * 12;

      bullets.current.push({
        id: Math.random().toString(),
        x: startX + spreadX,
        y: startY - 5,
        vx: spreadX * 0.2,
        vy: -4,
        damage: testModeRef.current ? 9999999 : Math.ceil(stats.damage * 1.5), // tracking missiles deal more heavy damage
        size: 7,
        color: testModeRef.current ? '#f43f5e' : '#f59e0b',
        pierceRemaining: testModeRef.current ? 999999 : 0,
        isHoming: true,
        targetId,
      });
    }
  };

  // Spawn Boss battle
  const spawnBossBattle = (stage: number) => {
    bossSpawned.current = true;
    audio.playBossWarning();
    bossAlertTimer.current = 130; // 2 seconds threshold
    
    setTimeout(() => {
      if (gameState !== 'PLAYING') return;
      bossActive.current = true;
      
      const bossHp = 250 * Math.pow(1.6, stage - 1);
      enemies.current.push({
        id: 'BOSS_ID',
        x: GAME_WIDTH / 2,
        y: -90, // Slide down entering animation
        vx: 0.5,
        vy: 0.4, // Will stop moving down after Y constraint
        hp: bossHp,
        maxHp: bossHp,
        size: 55,
        color: '#ef4444',
        shape: 'star',
        scoreValue: 1500 * stage,
        goldValue: 300 * stage,
        shootTimer: 0,
        shootInterval: 1.5,
        isBoss: true,
        phase: 1,
        bossPatternTimer: 0,
      });
    }, 2200);
  };

  // Main tick and canvas update
  const gameLoop = (time: number) => {
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = time;
    }
    const deltaTime = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    // Direct loop constraints
    if (gameState === 'PLAYING') {
      if (!showRewardModalRef.current) {
        updatePhysics(deltaTime);
      }
      drawGame();
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  // Continuous registration of frames
  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [gameState, playerStats]);

  // Update Game State entities
  const updatePhysics = (dt: number) => {
    // Increment background custom scrolling. Speed rises with Stage (25% faster scroll per stage level)
    // 宝箱(Chest)が出現した時はスクロールスピードを早く（6倍）する
    const isChestActive = chests.current.length > 0;
    const warpMultiplier = isChestActive ? 6.0 : 1.0;
    const scrollSpeed = 66 * (1 + (playerStats.stage - 1) * 0.25) * warpMultiplier;
    backgroundScrollY.current += scrollSpeed * dt;

    // 1. Invincibility timer
    if (invincibilityTimer.current > 0) {
      invincibilityTimer.current -= dt;
    }

    // 2. Alert screenshake decays
    if (screenShake.current > 0) {
      screenShake.current *= 0.88;
      if (screenShake.current < 0.1) screenShake.current = 0;
    }

    // 3. Boss warning siren flasher
    if (bossAlertTimer.current > 0) {
      bossAlertTimer.current--;
    }

    // 4. Update core progression background
    if (!bossSpawned.current && !bossActive.current && !bossDefeatedSequence.current) {
      stageProgress.current += dt * 3.5; // Progress 0-100% takes ~28 seconds
      if (stageProgress.current >= 100) {
        stageProgress.current = 100;
        spawnBossBattle(playerStats.stage);
      }
    }

    // 5. Player keyboard controls + Mouse trackers bounds mapping
    let px = playerXInGame.current;
    const lockedY = GAME_HEIGHT * 0.9; // Locked permanently to the bottom of the screen
    const speed = 320; // player manual keyboard move speed

    if (keysPressed.current['ArrowLeft'] || keysPressed.current['a'] || keysPressed.current['A']) {
      px -= speed * dt;
    }
    if (keysPressed.current['ArrowRight'] || keysPressed.current['d'] || keysPressed.current['D']) {
      px += speed * dt;
    }

    // Mouse/Touch controls glide override
    if (touchX.current !== null) {
      // Direct drag mapping or smooth glide interpolation
      px += (touchX.current - px) * 0.35;
    } else if (isMouseDown.current) {
      // Drag/Slide glide to cursor
      px += (mouseX.current - px) * 0.35;
    }

    // Boundary constraints
    playerXInGame.current = Math.max(22, Math.min(GAME_WIDTH - 22, px));
    playerYInGame.current = lockedY; // Hard lock to the bottom

    // 6. Automatically Shoot Weapons on fireRate ticks
    fireTimer.current += dt;
    const fireInterval = 1 / playerStats.fireRate;
    if (fireTimer.current >= fireInterval) {
      executePlayerShoot();
      fireTimer.current = 0;
    }

    // Homing homing launcher cycles
    if (playerStats.homingCount > 0) {
      homingTimer.current += dt;
      if (homingTimer.current >= 1.6) { // Every 1.6 seconds
        executeHomingMissiles();
        homingTimer.current = 0;
      }
    }

    // 7. Update Bullets (with homing track steering)
    bullets.current.forEach(bullet => {
      if (bullet.isHoming && bullet.targetId) {
        // Seek target coordinates
        const target = enemies.current.find(e => e.id === bullet.targetId);
        if (target) {
          const dx = target.x - bullet.x;
          const dy = target.y - bullet.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 5) {
            const desiredVx = (dx / dist) * playerStats.bulletSpeed;
            const desiredVy = (dy / dist) * playerStats.bulletSpeed;
            // Steering force interpolation
            bullet.vx += (desiredVx - bullet.vx) * 0.15;
            bullet.vy += (desiredVy - bullet.vy) * 0.15;
          }
        } else {
          // Find next closest alternative target
          let closestDist = Infinity;
          let closestEnemy: Enemy | null = null;
          enemies.current.forEach(e => {
            const d = Math.hypot(e.x - bullet.x, e.y - bullet.y);
            if (d < closestDist) {
              closestDist = d;
              closestEnemy = e;
            }
          });
          if (closestEnemy) {
            bullet.targetId = closestEnemy.id;
          } else {
            bullet.targetId = null;
          }
        }
      }

      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
    });

    // Clean bullets offscreen
    bullets.current = bullets.current.filter(b => b.x > -20 && b.x < GAME_WIDTH + 20 && b.y > -20 && b.y < GAME_HEIGHT + 20);

    // 8. Update Boss Bullets (with support for homing enemy bullets)
    baseBossBullets.current.forEach(bb => {
      if (bb.isHoming) {
        // Homing bullet gently curves towards the player ship
        const dx = playerXInGame.current - bb.x;
        const dy = playerYInGame.current - bb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          const targetVx = (dx / dist) * 2.2;
          const targetVy = (dy / dist) * 2.2;
          bb.vx += (targetVx - bb.vx) * 0.04;
          bb.vy += (targetVy - bb.vy) * 0.04;
        }
      }
      bb.x += bb.vx;
      bb.y += bb.vy;
    });
    baseBossBullets.current = baseBossBullets.current.filter(bb => bb.x > -30 && bb.x < GAME_WIDTH + 30 && bb.y > -30 && bb.y < GAME_HEIGHT + 30);

    // 9. Update Enemies
    enemies.current.forEach(e => {
      if (e.isBoss) {
        // Boss entering sequence: transition downward to initial center
        if (e.y < 120) {
          e.y += e.vy;
        } else {
          // Boss phase logic
          if (!e.bossPatternTimer) e.bossPatternTimer = 0;
          e.bossPatternTimer += dt;
          
          // Side to side floating movement
          e.x += e.vx;
          if (e.x > GAME_WIDTH - 65 || e.x < 65) {
            e.vx *= -1;
          }

          // Shoots customized visual geometric patterns depending on HP percentage
          const hpPct = e.hp / e.maxHp;
          let phase = 1;
          if (hpPct < 0.35) {
            phase = 3;
          } else if (hpPct < 0.70) {
            phase = 2;
          }
          e.phase = phase;

          e.shootTimer += dt;
          
          // Phase shooting frequencies
          const rate = phase === 3 ? 0.35 : phase === 2 ? 0.6 : 0.9;
          if (e.shootTimer >= rate) {
            e.shootTimer = 0;
            const now = Date.now();

            if (phase === 1) {
              // Basic parallel downwards fanning
              for (let i = -2; i <= 2; i++) {
                baseBossBullets.current.push({
                  id: Math.random().toString(),
                  x: e.x,
                  y: e.y + 20,
                  vx: i * 0.7,
                  vy: 3.5,
                  size: 9,
                  damage: 20,
                });
              }
              audio.playShoot('normal');
            } else if (phase === 2) {
              // Heavy spiral pattern
              const steps = 11;
              const seedAngle = (now / 350) % (Math.PI * 2);
              for (let i = 0; i < steps; i++) {
                const angle = seedAngle + (i / steps) * Math.PI * 2;
                baseBossBullets.current.push({
                  id: Math.random().toString(),
                  x: e.x,
                  y: e.y + 10,
                  vx: Math.cos(angle) * 3.0,
                  vy: Math.sin(angle) * 3.0,
                  size: 8,
                  damage: 25,
                });
              }
              audio.playShoot('homing');
            } else if (phase === 3) {
              // Extreme bullet storm and aiming bullets
              const pAngle = Math.atan2(playerYInGame.current - e.y, playerXInGame.current - e.x);
              
              // Direct aimed double burst
              baseBossBullets.current.push({
                id: Math.random().toString(),
                x: e.x - 20,
                y: e.y + 10,
                vx: Math.cos(pAngle) * 4.5,
                vy: Math.sin(pAngle) * 4.5,
                size: 11,
                damage: 30,
              });
              baseBossBullets.current.push({
                id: Math.random().toString(),
                x: e.x + 20,
                y: e.y + 10,
                vx: Math.cos(pAngle) * 4.5,
                vy: Math.sin(pAngle) * 4.5,
                size: 11,
                damage: 30,
              });

              // Swirling side spikes
              const angleSeed = (now / 150) % (Math.PI * 2);
              baseBossBullets.current.push({
                id: Math.random().toString(),
                x: e.x,
                y: e.y + 10,
                vx: Math.cos(angleSeed) * 2.8,
                vy: Math.sin(angleSeed) * 2.8,
                size: 8,
                damage: 20,
              });

              audio.playShoot('heavy');
            }
          }
        }
      } else {
        // Normal enemy physical moves (perfectly straight down)
        e.y += e.vy;

        // Different attack patterns per enemy type
        if (e.shootInterval > 0) {
          e.shootTimer += dt;
          if (e.shootTimer >= e.shootInterval) {
            e.shootTimer = 0;
            
            const dx = playerXInGame.current - e.x;
            const dy = playerYInGame.current - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            if (e.shape === 'square') {
              // 1. Tank (Blue Square) -> Scatter/AOE Attack (範囲攻撃 - 3方向拡散)
              // Shoots a 3-way spread pattern downwards to cover area
              const spreadAngles = [-0.35, 0, 0.35];
              spreadAngles.forEach(angle => {
                baseBossBullets.current.push({
                  id: Math.random().toString(),
                  x: e.x,
                  y: e.y + e.size,
                  vx: Math.sin(angle) * 3.2,
                  vy: Math.cos(angle) * 3.2,
                  size: 8,
                  damage: 15,
                  color: '#3b82f6',
                });
              });
            } else if (e.shape === 'triangle') {
              // 3. Stinger (Pink Triangle) -> Linear Burst Attack (直線高速連射)
              // Fires dual high speed linear energy spikes straight down
              baseBossBullets.current.push({
                id: Math.random().toString(),
                x: e.x - 7,
                y: e.y + e.size,
                vx: 0,
                vy: 5.2,
                size: 4.5,
                damage: 8,
                color: '#ec4899',
              });
              baseBossBullets.current.push({
                id: Math.random().toString(),
                x: e.x + 7,
                y: e.y + e.size,
                vx: 0,
                vy: 5.2,
                size: 4.5,
                damage: 8,
                color: '#ec4899',
              });
            } else if (e.shape === 'star') {
              // 4. Shooter (Orange Star) -> Aimed Sniper Attack (狙い撃ち)
              // High velocity aimed bullet focused on current player location
              baseBossBullets.current.push({
                id: Math.random().toString(),
                x: e.x,
                y: e.y + e.size,
                vx: (dx / dist) * 4.6,
                vy: (dy / dist) * 4.6,
                size: 9,
                damage: 20,
                color: '#f59e0b',
              });
            }
          }
        }
      }
    });

    // Filter enemies offscreen (player takes damage if enemies seep past)
    const originalCount = enemies.current.length;
    enemies.current = enemies.current.filter(e => {
      if (e.y > GAME_HEIGHT + e.size) {
        if (!e.isBoss) {
          // Leak deduction: lose 1 shield or 5 HP
          damagePlayer(5);
        }
        return false;
      }
      return true;
    });

    // 10. Update Gates scrolling down
    gates.current.forEach(g => {
      g.y += (110 * dt); // slow scrolling speed of gates
    });

    // Check gate collision crossing (pass player Y threshold)
    gates.current.forEach(g => {
      if (!g.passed && Math.abs(g.y - playerYInGame.current) < 22) {
        // Check which side player crossed
        if (playerXInGame.current < GAME_WIDTH / 2) {
          applyGateUpgrade(g.leftGate);
        } else {
          applyGateUpgrade(g.rightGate);
        }
        g.passed = true;
      }
    });

    gates.current = gates.current.filter(g => g.y < GAME_HEIGHT + 60);

    // 11. Update Floating Crystals (with dynamic Magnetic Pull interpolation)
    crystals.current.forEach(c => {
      const dx = playerXInGame.current - c.x;
      const dy = playerYInGame.current - c.y;
      const distance = Math.sqrt(dx*dx + dy*dy);
      
      // Pull magnet
      if (distance < playerStats.magnetRange) {
        const pullStr = (1 - (distance / playerStats.magnetRange)) * 420; // faster pull the closer it is
        c.vx += (dx / distance) * pullStr * dt;
        c.vy += (dy / distance) * pullStr * dt;
      }

      // friction
      c.vx *= 0.94;
      c.vy *= 0.94;

      c.x += c.vx;
      c.y += (110 * dt) + c.vy; // flows down scroll normally + magnetic speed adjustments
    });

    // Pick crystal
    crystals.current = crystals.current.filter(c => {
      const distance = Math.hypot(playerXInGame.current - c.x, playerYInGame.current - c.y);
      if (distance < 24) {
        // Collected!
        audio.playGatePass();
        if (c.type === 'gold') {
          sessionGold.current += c.value;
          setPlayerStats(prev => ({ ...prev, gold: prev.gold + c.value }));
          addFloatingText(c.x, c.y, `+${c.value} GOLD`, '#eab308');
        } else if (c.type === 'heal') {
          setPlayerStats(prev => {
            const newHp = Math.min(prev.maxHp, prev.hp + c.value);
            playerHp.current = newHp;
            return { ...prev, hp: newHp };
          });
          addFloatingText(c.x, c.y, `HEAL!`, '#22c55e');
          addExplosion(playerXInGame.current, playerYInGame.current, '#22c55e', 8, 0.8);
        }
        return false;
      }
      return c.y < GAME_HEIGHT + 30; // Clean offscreen
    });

    // 12. Particles update
    particles.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha < 0) p.alpha = 0;
    });
    particles.current = particles.current.filter(p => p.alpha > 0);

    // 13. Floating texts update
    floatingTexts.current.forEach(f => {
      f.y -= 1.0; // Float upwards
      f.life -= dt * 1.5;
    });
    floatingTexts.current = floatingTexts.current.filter(f => f.life > 0);

    // Update chests drifting, magnetism, and player collision check
    chests.current.forEach(c => {
      // 宝箱が出現した時、飛行スクロール速度が通常の6倍になる演出に合わせ、
      // 宝箱自体の降下、および移動物理（相対移動スピード）も本当に6倍に高速化する
      const warpMultiplier = 6.0;
      c.y += c.vy * warpMultiplier; // Drift down with warp speed!
      c.x += c.vx * warpMultiplier;

      // どこにいても獲得できるように、宝箱はマグネット範囲制限を無視して常に超強力にプレイヤーに引き寄せられます
      const dx = playerXInGame.current - c.x;
      const dy = playerYInGame.current - c.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        // 距離に関係なく常に強力にプレイヤーのもとへ吸引・追従
        c.vx += (dx / distance) * 800 * dt;
        c.vy += (dy / distance) * 800 * dt;
      }
      c.vx *= 0.92;
      c.vy *= 0.92;
    });

    // Chest player collection collision
    chests.current = chests.current.filter(c => {
      const distance = Math.hypot(playerXInGame.current - c.x, playerYInGame.current - c.y);
      if (distance < c.size + 24 && !c.claimed) {
        c.claimed = true;
        audio.playGatePass(); // high-pitched chime
        
        // Spawn massive explosion in golden & rainbow particles!
        addExplosion(c.x, c.y, '#f59e0b', 30, 1.8);
        addExplosion(c.x, c.y, '#10b981', 15, 1.2);

        // Open choice modal (pauses physics & background movement)
        setShowRewardModal(true);

        return false; // delete chest from active entities
      }
      // 宝箱は絶対にロストしないように、画面下での自動消去を無効化します
      return true;
    });

    // Update Helper NPCs (Drones)
    helperNPCs.current.forEach((drone) => {
      // Orbits player ship at an angle that evolves over time
      const orbitTime = Date.now() / 900; // spin speed
      const currentAngle = orbitTime + drone.angleOffset;
      
      // Position drone orbiting around player ship coordinates
      const orbitRadius = 38;
      const droneX = playerXInGame.current + Math.cos(currentAngle) * orbitRadius;
      const droneY = playerYInGame.current + Math.sin(currentAngle) * orbitRadius;

      // Shoots support laser down / at closest enemies!
      drone.shootTimer += dt;
      const shootInterval = 0.6; // shoots fast support pulses!
      if (drone.shootTimer >= shootInterval) {
        drone.shootTimer = 0;
        audio.playShoot('normal');

        let vy = -playerStats.bulletSpeed * 1.1; 
        let vx = 0;

        // Find closest enemy
        let target: Enemy | null = null;
        let closestDist = Infinity;
        enemies.current.forEach(e => {
          const dist = Math.hypot(e.x - droneX, e.y - droneY);
          if (dist < closestDist) {
            closestDist = dist;
            target = e;
          }
        });

        if (target && closestDist < 450) {
          const dx = (target as Enemy).x - droneX;
          const dy = (target as Enemy).y - droneY;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          vx = (dx / dist) * playerStats.bulletSpeed;
          vy = (dy / dist) * playerStats.bulletSpeed;
        }

        bullets.current.push({
          id: Math.random().toString(),
          x: droneX,
          y: droneY,
          vx,
          vy,
          damage: testModeRef.current ? 9999999 : Math.ceil(playerStats.damage * 0.75), 
          size: 5,
          color: testModeRef.current ? '#ec4899' : '#38bdf8', 
          pierceRemaining: testModeRef.current ? 999999 : 0,
          isHoming: false,
          targetId: null,
        });

        // Spawn tiny spark from drone firing point
        particles.current.push({
          id: Math.random().toString(),
          x: droneX,
          y: droneY,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          size: 2,
          color: '#38bdf8',
          alpha: 0.9,
          life: 0.8,
          decay: 0.05,
        });
      }
    });

    // 14. Collisions Handling
    handleCollisions();

    // 15. Periodic Random Spawners
    // Adjust spawn frequency depending on progress and stages
    if (!bossSpawned.current && !bossActive.current && !bossDefeatedSequence.current) {
      // Capped at maximum 3 enemies between gates for a smoother game flow
      const spawnChance = 0.009 + (playerStats.stage * 0.0015);
      if (Math.random() < spawnChance && enemies.current.length < 3) {
        spawnEnemy(playerStats.stage);
      }

      // Power-up gates spawn precisely twice per wave/cycle (at 25% and 65% progress)
      if (stageProgress.current >= 25 && stageProgress.current < 60 && !gate1Spawned.current && gates.current.length === 0) {
        spawnGate(playerStats.stage);
        gate1Spawned.current = true;
      }
      if (stageProgress.current >= 65 && stageProgress.current < 90 && !gate2Spawned.current && gates.current.length === 0) {
        spawnGate(playerStats.stage);
        gate2Spawned.current = true;
      }
    }
  };

  const damagePlayer = (amount: number) => {
    if (testModeRef.current) return; // Ultimate test mode (invincible)
    if (invincibilityTimer.current > 0 || bossDefeatedSequence.current) return;

    audio.playPlayerHurt();
    screenShake.current = 18;
    invincibilityTimer.current = 1.0; // 1 second immunity

    let remainingDmg = amount;
    // Apply shield deductions first
    if (playerShield.current > 0) {
      if (playerShield.current >= remainingDmg) {
        playerShield.current -= remainingDmg;
        remainingDmg = 0;
      } else {
        remainingDmg -= playerShield.current;
        playerShield.current = 0;
      }
    }

    if (remainingDmg > 0) {
      playerHp.current = Math.max(0, playerHp.current - remainingDmg);
    }

    // Sync state
    setPlayerStats(prev => ({
      ...prev,
      hp: playerHp.current,
      shieldHp: playerShield.current,
    }));

    addFloatingText(playerXInGame.current, playerYInGame.current - 15, `-${amount}`, '#ef4444');
    addExplosion(playerXInGame.current, playerYInGame.current, '#ef4444', 12, 1.2);

    // Check Death trigger
    if (playerHp.current <= 0) {
      triggerGameOver();
    }
  };

  const triggerGameOver = () => {
    audio.playGameOver();
    setGameState('GAMEOVER');
  };

  const handleCollisions = () => {
    // A. Player Bullets vs Enemies
    bullets.current.forEach(bullet => {
      enemies.current.forEach(enemy => {
        // Circle radial distance check
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < bullet.size + enemy.size) {
          // Bullet contact!
          if (bullet.pierceRemaining >= 0) {
            enemy.hp -= bullet.damage;
            bullet.pierceRemaining--;

            // Particle impact sparks
            addExplosion(bullet.x, bullet.y, enemy.color, 4, 0.6);

            // Floating individual damage numbers
            addFloatingText(enemy.x, enemy.y - enemy.size, `${bullet.damage}`, '#ffffff');

            // Force bullet deletion if out of pierce
            if (bullet.pierceRemaining < 0) {
              bullet.y = -500; // force cleanup
            }

            // Check enemy defeat
            if (enemy.hp <= 0 && enemy.hp + bullet.damage > 0) {
              defeatEnemy(enemy);
            }
          }
        }
      });
    });

    // Remove bullets that touched/pierced out
    bullets.current = bullets.current.filter(b => b.y > -100);

    // B. Enemy Bullet vs Player
    baseBossBullets.current.forEach(eb => {
      const dx = eb.x - playerXInGame.current;
      const dy = eb.y - playerYInGame.current;
      if (Math.hypot(dx, dy) < eb.size + 16) {
        damagePlayer(eb.damage);
        eb.y = 9999; // force clean
      }
    });
    baseBossBullets.current = baseBossBullets.current.filter(bb => bb.y < 900);

    // C. Enemy physical vs Player Collision check
    enemies.current.forEach(enemy => {
      const dx = enemy.x - playerXInGame.current;
      const dy = enemy.y - playerYInGame.current;
      const totalRad = enemy.size + 18;
      if (Math.hypot(dx, dy) < totalRad) {
        // Physical collision
        if (enemy.isBoss) {
          damagePlayer(35);
        } else {
          damagePlayer(Math.ceil(enemy.maxHp * 1.5)); // Heavy physical collide dmg relative to enemy HP size
          enemy.hp = 0;
          defeatEnemy(enemy);
        }
      }
    });
  };

  const defeatEnemy = (enemy: Enemy) => {
    audio.playExplosion(enemy.isBoss ? 'large' : 'small');
    addExplosion(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 45 : 12, enemy.isBoss ? 2.5 : 1.0);
    
    // Add Score records
    sessionScore.current += enemy.scoreValue;
    setPlayerStats(prev => ({ ...prev, score: prev.score + enemy.scoreValue }));

    if (enemy.isBoss) {
      bossDefeatedSequence.current = true;
      bossActive.current = false;
      
      // Spawn the coveted Treasure Chest where the boss exploded!
      chests.current.push({
        id: Math.random().toString(),
        x: enemy.x,
        y: enemy.y,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2.0, // move downward slowly
        size: 18,
        claimed: false,
      });

      addFloatingText(enemy.x, enemy.y - 40, "宝箱出現!!", '#fbbf24');
    } else {
      // Spawn standard crystals
      const spawnHealChance = 0.08;
      const crystalType = Math.random() < spawnHealChance ? 'heal' : 'gold';
      const cVal = crystalType === 'heal' ? 10 : enemy.goldValue;
      const cCol = crystalType === 'heal' ? '#22c55e' : '#eab308';

      // Drop crystals around
      crystals.current.push({
        id: Math.random().toString(),
        x: enemy.x,
        y: enemy.y,
        vx: (Math.random() - 0.5) * 4,
        vy: -3 - Math.random() * 2,
        value: cVal,
        color: cCol,
        type: crystalType,
      });
    }

    // Filter out dead enemies
    enemies.current = enemies.current.filter(e => e.id !== enemy.id);
  };

  // Canvas drawing updates
  const drawGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset frame scale adjustments
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    ctx.save();
    
    // Apple screen shake
    if (screenShake.current > 0) {
      const shakeX = (Math.random() - 0.5) * screenShake.current;
      const shakeY = (Math.random() - 0.5) * screenShake.current;
      ctx.translate(shakeX, shakeY);
    }

    // Set canvas dimensions
    canvas.width = canvas.parentElement?.clientWidth || GAME_WIDTH;
    canvas.height = canvas.parentElement?.clientHeight || GAME_HEIGHT;

    // Direct uniform coordinate rendering
    ctx.scale(canvas.width / GAME_WIDTH, canvas.height / GAME_HEIGHT);

    // Background Clear
    ctx.fillStyle = '#030712'; // Slate 950 deep base
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Render scrolling stars space grid
    drawSpaceGrid(ctx);

    // A. Render Gates containing upgrades options
    drawGates(ctx);

    // B. Render Crystals items dropping
    crystals.current.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = c.color;
      ctx.fill();
      ctx.shadowBlur = 0; // reset
      
      // glowing diamond shape outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 8);
      ctx.lineTo(c.x + 6, c.y);
      ctx.lineTo(c.x, c.y + 8);
      ctx.lineTo(c.x - 6, c.y);
      ctx.closePath();
      ctx.stroke();
    });

    // C. Render Normal/Homing flying Player Bullets
    bullets.current.forEach(b => {
      ctx.beginPath();
      ctx.shadowBlur = b.isHoming ? 12 : 8;
      ctx.shadowColor = b.color;
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      
      // core highlighter sparkle
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // D. Render Boss/Enemy bullets (Custom Colored in Elegant Dark)
    baseBossBullets.current.forEach(eb => {
      ctx.save();
      const mainColor = eb.color || '#f97316';
      
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, eb.size, 0, Math.PI * 2);
      ctx.fillStyle = mainColor;
      ctx.shadowBlur = eb.isHoming ? 14 : 8;
      ctx.shadowColor = mainColor;
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, eb.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; // high brightness core
      ctx.fill();
      ctx.restore();
    });

    // E. Render enemies with health counts overlays
    enemies.current.forEach(e => {
      ctx.save();
      ctx.translate(e.x, e.y);

      ctx.shadowBlur = e.isBoss ? 20 : 8;
      ctx.shadowColor = e.color;

      ctx.fillStyle = e.color;
      
      if (e.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, e.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.shape === 'square') {
        ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
      } else if (e.shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(0, -e.size);
        ctx.lineTo(e.size, e.size);
        ctx.lineTo(-e.size, e.size);
        ctx.closePath();
        ctx.fill();
      } else if (e.shape === 'star') {
        // Draw star representation
        ctx.beginPath();
        const spikes = 5;
        const outerRad = e.size;
        const innerRad = e.size * 0.45;
        let rot = Math.PI / 2 * 3;
        const step = Math.PI / spikes;
        ctx.moveTo(0, -outerRad);
        for (let i = 0; i < spikes; i++) {
          let x = Math.cos(rot) * outerRad;
          let y = Math.sin(rot) * outerRad;
          ctx.lineTo(x, y);
          rot += step;

          x = Math.cos(rot) * innerRad;
          y = Math.sin(rot) * innerRad;
          ctx.lineTo(x, y);
          rot += step;
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.shadowBlur = 0;

      // Draw inside highlights
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Render Floating health badges above enemies
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      
      // Calculate HP display text
      const hpText = `${Math.ceil(e.hp)}`;
      const badgeW = ctx.measureText(hpText).width + 8;
      
      // Draw background tag
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(e.x - badgeW / 2, e.y - e.size - 18, badgeW, 14);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(e.x - badgeW / 2, e.y - e.size - 18, badgeW, 14);

      // Raw counts value text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(hpText, e.x, e.y - e.size - 7);
    });

    // F. Render Player Jetship
    drawPlayer(ctx);

    // Draw Chests with deep golden aesthetics and hover shadows
    chests.current.forEach(c => {
      ctx.save();
      ctx.translate(c.x, c.y);

      // Glowing auroral halo
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#fbbf24'; // beautiful golden aura
      
      // Draw golden bounding box
      ctx.fillStyle = '#d97706'; // deep gold
      ctx.fillRect(-12, -8, 24, 16);
      
      // Top lid design
      ctx.fillStyle = '#fbbf24'; // bright amber
      ctx.fillRect(-12, -12, 24, 4);
      
      // Lock plate
      ctx.fillStyle = '#0f172a'; // dark steel lock plate
      ctx.fillRect(-3, -4, 6, 6);
      
      // Lock details
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, -3, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Corner metal plates
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-12, -8, 3, 3);
      ctx.fillRect(9, -8, 3, 3);
      ctx.fillRect(-12, 5, 3, 3);
      ctx.fillRect(9, 5, 3, 3);

      ctx.restore();
      ctx.shadowBlur = 0;
    });

    // Draw HelperNPC Drones relative with player position
    helperNPCs.current.forEach((drone) => {
      ctx.save();
      
      // Orbits player ship at an angle that evolves over time
      const orbitTime = Date.now() / 900;
      const currentAngle = orbitTime + drone.angleOffset;
      const orbitRadius = 38;
      const droneX = playerXInGame.current + Math.cos(currentAngle) * orbitRadius;
      const droneY = playerYInGame.current + Math.sin(currentAngle) * orbitRadius;

      ctx.translate(droneX, droneY);

      // Engine flicker particle sparks
      const f = 4 + Math.random() * 4;
      ctx.beginPath();
      const gr = ctx.createLinearGradient(0, 3, 0, 3 + f);
      gr.addColorStop(0, '#38bdf8');
      gr.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = gr;
      ctx.ellipse(0, 4, 3, f, 0, 0, Math.PI * 2);
      ctx.fill();

      // Metallic probe hull
      ctx.fillStyle = '#64748b'; // slate metal body
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();

      // Inner glowing sensor lens
      ctx.beginPath();
      ctx.arc(0, -1, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8'; // glowing sky blue lens
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#38bdf8';
      ctx.fill();

      // Wings
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-8, -2);
      ctx.lineTo(8, -2);
      ctx.lineTo(12, 0);
      ctx.stroke();

      ctx.restore();
      ctx.shadowBlur = 0;
    });

    // G. Render Particle sparkles
    particles.current.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    });

    // H. Render Floating Upgrade overlay Texts
    floatingTexts.current.forEach(f => {
      ctx.fillStyle = f.color;
      ctx.font = 'bold 14px "JetBrains Mono", sans-serif';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#000000';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    });

    // Boss Warning Siren flasher overlays
    if (bossAlertTimer.current > 0 && Math.floor(bossAlertTimer.current / 15) % 2 === 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // red strobe tint
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.restore();
    }

    ctx.restore();
  };

  const drawSpaceGrid = (ctx: CanvasRenderingContext2D) => {
    const scrollOffset = backgroundScrollY.current % 80;
    
    // Ambient matrix/starfield lines
    ctx.strokeStyle = 'rgba(79, 70, 229, 0.08)'; // Indigo grids
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = 0; x < GAME_WIDTH + 40; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x - 20, 0);
      ctx.lineTo(x - 20, GAME_HEIGHT);
      ctx.stroke();
    }
    
    // Horizontal lines scrolling downwards
    for (let y = scrollOffset - 80; y < GAME_HEIGHT + 80; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_WIDTH, y);
      ctx.stroke();
    }

    // Scroll Starfield stars based on custom coordinate for complete pause-safety
    ctx.fillStyle = '#ffffff';
    const isChestActive = chests.current.length > 0;
    for (let i = 0; i < 25; i++) {
      const sx = (i * 327 + 53) % GAME_WIDTH;
      const baseSy = (i * 183);
      const starSpeedFactor = ((i % 3 === 0) ? 0.7 : 0.4);
      const sy = (baseSy + backgroundScrollY.current * starSpeedFactor) % GAME_HEIGHT;
      const starScale = (i % 3 === 0) ? 1.5 : 0.8;
      ctx.globalAlpha = 0.3 + (i % 5) * 0.13;
      
      if (isChestActive) {
        // Hyperspace warp trails when treasure chest appears
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + (i % 5) * 0.13})`;
        ctx.lineWidth = starScale * 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + 18 * starSpeedFactor + 6);
        ctx.stroke();
      } else {
        ctx.fillRect(sx, sy, starScale, starScale);
      }
    }
    ctx.globalAlpha = 1.0; // restore
  };

  const drawGates = (ctx: CanvasRenderingContext2D) => {
    gates.current.forEach(g => {
      if (g.passed) return;

      const y = g.y;
      
      // Draw neon border split center divider line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(GAME_WIDTH / 2, y - 22);
      ctx.lineTo(GAME_WIDTH / 2, y + 22);
      ctx.stroke();
      ctx.setLineDash([]); // clear dash

      // 1. Draw Left Gate (Upgrade A)
      drawSingleGatePane(ctx, g.leftGate, 5, y, (GAME_WIDTH / 2) - 10);
      
      // 2. Draw Right Gate (Upgrade B)
      drawSingleGatePane(ctx, g.rightGate, (GAME_WIDTH / 2) + 5, y, (GAME_WIDTH / 2) - 10);
    });
  };

  const drawSingleGatePane = (
    ctx: CanvasRenderingContext2D,
    opt: GateOption,
    x: number,
    y: number,
    w: number
  ) => {
    const h = 42;
    
    // Translucent background
    ctx.save();
    ctx.fillStyle = `${opt.color}15`; // 15% opacity tint
    ctx.fillRect(x, y - h/2, w, h);
    
    // Glowing neon border frame
    ctx.strokeStyle = opt.color;
    ctx.lineWidth = 2.0;
    ctx.shadowBlur = 10;
    ctx.shadowColor = opt.color;
    ctx.strokeRect(x, y - h/2, w, h);
    ctx.shadowBlur = 0;

    // Corner decorative metal supports
    ctx.fillStyle = opt.color;
    ctx.fillRect(x, y - h/2 - 2, 6, 4);
    ctx.fillRect(x + w - 6, y - h/2 - 2, 6, 4);
    ctx.fillRect(x, y + h/2 - 2, 6, 4);
    ctx.fillRect(x + w - 6, y + h/2 - 2, 6, 4);

    // Render Option Label Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px "Segoe UI", "sans-serif"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add subtle shadow offset for depth
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 3;
    ctx.fillText(opt.text, x + w / 2, y + 1);
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D) => {
    const px = playerXInGame.current;
    const py = playerYInGame.current;

    // If immune/invincibility flash
    if (invincibilityTimer.current > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
      return; // Skip drawing this frame to flash player
    }

    ctx.save();
    ctx.translate(px, py);

    // Glowing engines visual effects
    const engineFlicker = 8 + Math.random() * 8;
    ctx.beginPath();
    const grad = ctx.createLinearGradient(0, 10, 0, 10 + engineFlicker);
    grad.addColorStop(0, '#f97316'); // Engine orange flame
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad;
    ctx.ellipse(0, 14, 8, engineFlicker, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. Draw wings (Metallic silver)
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(-22, 10);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-10, -5);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(22, 10);
    ctx.lineTo(24, 0);
    ctx.lineTo(10, -5);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();

    // Wing edge color stripes (Matching level of damage count)
    ctx.fillStyle = '#3b82f6'; // Cobalt blue
    ctx.fillRect(-22, 4, 3, 4);
    ctx.fillRect(19, 4, 3, 4);

    // 2. Main fuselage/Body
    ctx.fillStyle = '#cbd5e1'; // bright alloy silver
    ctx.beginPath();
    ctx.moveTo(0, -22); // cockpit head
    ctx.lineTo(-11, 4);
    ctx.lineTo(-6, 12);
    ctx.lineTo(6, 12);
    ctx.lineTo(11, 4);
    ctx.closePath();
    ctx.fill();

    // 3. Cockpit glass (Glowing cyan)
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.ellipse(0, -5, 4, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Secondary cockpit core highlight shine
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-1.5, -9, 3, 4);

    // 4. Energy Shield Orb (If equipped)
    if (playerShield.current > 0) {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.55)'; // cyan translucent globe
      ctx.lineWidth = 2.0;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#06b6d4';
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 5. HP & Shield Bar overhead on Canvas (just below the ship)
    const barWidth = 44;
    const barHeight = 4;
    const barY = 24; // Draw under the ship
    
    // Grey background bar for HP
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(-barWidth / 2, barY, barWidth, barHeight);
    
    // Red/Green HP fill
    const hpRatio = Math.max(0, playerHp.current / playerStats.maxHp);
    ctx.fillStyle = hpRatio > 0.4 ? '#10b981' : '#f43f5e'; // Green or Rose if low
    ctx.fillRect(-barWidth / 2, barY, barWidth * hpRatio, barHeight);
    
    // Shield bar if shield exists
    if (playerStats.maxShieldHp > 0) {
      const shieldY = barY + barHeight + 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(-barWidth / 2, shieldY, barWidth, barHeight);
      
      const shieldRatio = Math.max(0, playerShield.current / playerStats.maxShieldHp);
      ctx.fillStyle = '#06b6d4'; // Cyan
      ctx.fillRect(-barWidth / 2, shieldY, barWidth * shieldRatio, barHeight);
    }

    // Overhead HP & Shield text value overlay under ship
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#000000';
    let textY = barY + barHeight + 9;
    if (playerStats.maxShieldHp > 0) {
      textY += barHeight + 2;
    }
    ctx.fillText(`HP: ${playerHp.current}/${playerStats.maxHp}`, 0, textY);
    ctx.shadowBlur = 0;

    ctx.restore();
  };

  // Setup Drag Touch Listeners for precise mobile gameplay
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Prevent document scrolling
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;

    const t = e.touches[0];
    touchX.current = (t.clientX - rect.left) * scaleX;
    touchY.current = (t.clientY - rect.top) * scaleY;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;

    const t = e.touches[0];
    touchX.current = (t.clientX - rect.left) * scaleX;
    touchY.current = (t.clientY - rect.top) * scaleY;
  };

  const handleTouchEnd = () => {
    touchX.current = null;
    touchY.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isMouseDown.current = true;
    updateMousePosition(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isMouseDown.current) {
      updateMousePosition(e);
    }
  };

  const handleMouseUp = () => {
    isMouseDown.current = false;
  };

  const updateMousePosition = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;

    mouseX.current = (e.clientX - rect.left) * scaleX;
    mouseY.current = (e.clientY - rect.top) * scaleY;
  };

  // Convert status to readable displays
  const getStageStyleInfo = (stage: number) => {
    switch (stage) {
      case 1:
        return { name: 'コスモス・フロンティア', bg: 'border-indigo-500/20' };
      case 2:
        return { name: 'ネビュラ・サンクチュアリ', bg: 'border-purple-500/20' };
      case 3:
        return { name: 'ボイド・アビス', bg: 'border-cyan-500/20' };
      default:
        return { name: 'ギャラクティック・セクター', bg: 'border-rose-500/20' };
    }
  };

  const activeBoss = enemies.current.find(e => e.isBoss);
  const stageInfo = getStageStyleInfo(playerStats.stage);

  return (
    <div className="relative w-full max-w-md h-[90vh] mx-auto font-sans">
      {/* 3. Boss Health Overlay - Placed in outer container so it is NOT clipped by overflow-hidden */}
      {bossActive.current && activeBoss && (
        <div className="absolute inset-x-6 top-[115px] md:top-2 md:inset-x-auto md:left-[calc(100%+16px)] md:w-72 bg-[#020617]/95 border border-rose-500/40 p-4 rounded-xl flex flex-col gap-2.5 z-20 select-none backdrop-blur-sm shadow-xl md:shadow-[0_0_25px_rgba(244,63,94,0.15)] animate-fade-in font-sans">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-rose-500/80 font-bold uppercase tracking-widest font-mono animate-pulse">
              ⚠️ TARGET IDENTIFIED
            </span>
            <div className="flex justify-between items-start gap-2">
              <span className="text-rose-400 font-extrabold tracking-tight text-xs uppercase leading-snug">
                {activeBoss.phase === 3 ? 'Chronos Titan (Core)' : activeBoss.phase === 2 ? 'Chronos Titan (Second Form)' : 'Chronos Titan'}
              </span>
              <span className="text-slate-400 font-mono font-bold text-[11px] shrink-0 leading-none bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                {Math.ceil(activeBoss.hp)}/{activeBoss.maxHp} HP
              </span>
            </div>
          </div>
          <div className="w-full h-3 bg-slate-950 border border-rose-900/40 rounded-full overflow-hidden shadow-[0_0_15px_rgba(244,63,94,0.2)]">
            <div 
              className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 transition-all duration-100 rounded-full"
              style={{ width: `${(activeBoss.hp / activeBoss.maxHp) * 100}%` }}
            />
          </div>
          <div className="hidden md:flex justify-between items-center text-[9px] text-slate-500 font-mono border-t border-slate-800/60 pt-2">
            <span>SYS: CLASS S OVERLORD</span>
            <span className="text-rose-500/70 animate-pulse">⚡ DIRECT COMBAT ACTIVE</span>
          </div>
        </div>
      )}

      {/* Main Game Screen Outer Shell */}
      <div className="relative w-full h-full bg-[#020617] border-4 border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* 1. HUD overlay (Active dashboard) */}
      <div className="absolute top-0 inset-x-0 bg-[#0f172a]/90 backdrop-blur-md px-4 py-3 flex flex-col justify-between border-b border-slate-800/80 z-10 pointer-events-none gap-1.5">
        
        {/* Row 1: Health, Shields and Mute Toggle */}
        <div className="flex items-center justify-between pointer-events-auto">
          {/* Health Section */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-red-950/40 px-2 py-0.5 rounded border border-red-900/60 text-red-400 font-mono text-xs">
              <Heart className="w-3.5 h-3.5 fill-red-500 stroke-red-500" />
              <span>HP {playerStats.hp}/{playerStats.maxHp}</span>
            </div>

            {/* Custom Shield bar */}
            <div className="flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-900/60 text-cyan-400 font-mono text-xs">
              <Shield className="w-3.5 h-3.5 fill-cyan-500 stroke-cyan-500" />
              <span>SD {playerStats.shieldHp}/{playerStats.maxShieldHp}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Menu Return Button */}
            <button
              onClick={() => {
                setGameState('START');
              }}
              className="p-1 px-2 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 font-sans text-[11px] font-bold pointer-events-auto cursor-pointer transition-all duration-200 flex items-center gap-1 active:scale-95"
              title="メニュー画面に戻る"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>メニューへ戻る</span>
            </button>

            {/* Test Mode Toggle */}
            <button
              onClick={() => {
                setTestMode(prev => !prev);
              }}
              className={`p-1 px-2 rounded border text-[10px] font-black tracking-widest leading-none pointer-events-auto cursor-pointer transition-all duration-200 ${
                testMode 
                  ? 'bg-rose-600 hover:bg-rose-500 border-rose-400 text-white shadow-[0_0_10px_rgba(244,63,94,0.4)]' 
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400 font-bold'
              }`}
              title="無敵＆超火力テストモード"
            >
              TEST
            </button>

            <button 
              onClick={() => {
                const muted = audio.toggleMute();
                setIsMuted(muted);
              }}
              className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 pointer-events-auto cursor-pointer"
              title="消音を切り替え"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-green-400" />}
            </button>
          </div>
        </div>

        {/* Row 2: Stats and Stage Score metadata */}
        <div className="flex items-center justify-between font-mono text-xs text-slate-300 leading-none">
          <div className="flex items-center gap-2">
            <span className="text-indigo-400 font-bold">St. {playerStats.stage}</span>
            <span className="text-slate-500 flex items-center gap-0.5" title="所持ゴールド">
              <Coins className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500/20" />
              <span className="text-yellow-400 font-bold">{playerStats.gold}</span>
            </span>
            <span className="text-slate-500 flex items-center gap-0.5" title="攻撃力 (ATK)">
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 animate-pulse" />
              <span className="text-amber-400 font-bold">ATK:{playerStats.damage}</span>
            </span>
          </div>

          <div className="text-right flex items-center gap-1 text-slate-400">
            <Trophy className="w-3.5 h-3.5 text-indigo-400" />
            <span>スコア: <span className="font-bold text-white">{playerStats.score}</span></span>
          </div>
        </div>

        {/* Row 3: Horizontal progress bar mapping stage goal / boss battle */}
        <div className="w-full flex flex-col gap-0.5 mt-0.5">
          <div className="flex justify-between text-[10px] font-semibold text-slate-400 leading-none">
            <span>ステージクリア進度</span>
            <span>{Math.round(stageProgress.current)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-850 rounded-full overflow-hidden border border-slate-800 flex relative">
            {bossActive.current || bossSpawned.current ? (
              <div className="w-full h-full bg-red-600 animate-pulse" />
            ) : (
              <div 
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${stageProgress.current}%` }}
              />
            )}
          </div>
        </div>
      </div>

      {/* 2. Siren / Boss Warning banner overlay */}
      {bossAlertTimer.current > 0 && (
        <div className="absolute inset-x-0 top-[28%] bg-red-950/92 border-y-2 border-red-500 py-4 flex flex-col items-center justify-center gap-1 shadow-2xl z-20 animate-pulse select-none">
          <div className="flex items-center gap-2 text-red-400 font-black tracking-widest text-lg">
            <ShieldAlert className="w-6 h-6 stroke-2 text-red-500 animate-bounce" />
            <span>BOSS APPROACHING</span>
            <ShieldAlert className="w-6 h-6 stroke-2 text-red-500 animate-bounce" />
          </div>
          <p className="text-xs text-red-300 font-semibold text-center px-6">
            強力なボス戦闘機が出現。攻撃パターンを見極めて回避してください！
          </p>
        </div>
      )}

      {/* Old Boss Health Overlay has been moved outside to prevent overflow-hidden clipping */}

      {/* 4. Canvas Core */}
      <canvas
        id="game-canvas"
        ref={canvasRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full flex-grow block cursor-crosshair touch-none"
      />

      {/* 5. Swipe controls indicators footer */}
      <div className="absolute bottom-2 inset-x-0 pointer-events-none text-center text-[10px] text-slate-500 font-medium tracking-wide animate-fade-in select-none">
        ドラッグか [A, D] キーで左右移動 🚀（自動連射）
      </div>

      {/* Floating Test Mode Action Button */}
      <div className="absolute bottom-3 right-3 z-30">
        <button
          id="toggle-test-mode-btn"
          onClick={() => setTestMode(prev => !prev)}
          className={`px-3 py-1.5 rounded-full border text-[11px] font-bold leading-none cursor-pointer select-none transition-all duration-300 shadow-md ${
            testMode 
              ? 'bg-rose-600 hover:bg-rose-500 border-rose-400 text-white shadow-[0_0_15px_rgba(244,63,94,0.6)] scale-105 active:scale-95' 
              : 'bg-slate-950/90 hover:bg-slate-900 border-slate-700 hover:border-slate-500 text-slate-300 active:scale-[0.97]'
          }`}
        >
          {testMode ? '⚙️ テストモード中' : '🛠️ テストモードを使用する'}
        </button>
      </div>

      {/* 6. Boss Defeat Reward Selection Overlay Modal */}
      {showRewardModal && (
        <div className="absolute inset-0 z-50 bg-[#020617]/90 backdrop-blur-md flex flex-col justify-center items-center p-6 text-center animate-fade-in pointer-events-auto">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700/85 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 relative">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-500 rounded-t-2xl" />
            
            <div className="flex flex-col items-center gap-1.5 mt-2">
              <Sparkles className="w-8 h-8 text-yellow-400 animate-pulse" />
              <h3 className="text-md font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-indigo-300 uppercase tracking-widest">
                BOSS DEFEATED!
              </h3>
              <p className="text-xs text-indigo-405 font-bold tracking-wide">
                ボス撃破報酬を【1つだけ】選んでください
              </p>
            </div>

            <div className="flex flex-col gap-2.5 mt-1">
              {/* Option 1: HP Increase */}
              <button
                onClick={() => handleSelectReward('hp_increase')}
                className="w-full p-3 bg-slate-950/80 hover:bg-emerald-950/40 border border-slate-800/80 hover:border-emerald-500 rounded-xl flex items-center justify-between text-left transition-all duration-300 group cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-950/60 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform flex items-center justify-center">
                    <Heart className="w-4 h-4 fill-emerald-500/10" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">HP増加（10から50増える）</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-sans">最大HPおよび現在HPが【＋10〜50】上昇</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
              </button>

              {/* Option 2: Shield Restore */}
              <button
                onClick={() => handleSelectReward('shield')}
                className="w-full p-3 bg-slate-950/80 hover:bg-cyan-950/40 border border-slate-800/80 hover:border-cyan-500 rounded-xl flex items-center justify-between text-left transition-all duration-300 group cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-950/60 text-cyan-400 rounded-lg group-hover:scale-110 transition-transform">
                    <Shield className="w-4 h-4 fill-cyan-500/10" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors font-sans">シールドを全回復</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">ポータブルバリアセルを最大値まで再チャージ</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
              </button>

              {/* Option 3: Damage Upgrade */}
              <button
                onClick={() => handleSelectReward('damage')}
                className="w-full p-3 bg-slate-950/80 hover:bg-amber-950/40 border border-slate-800/80 hover:border-amber-500 rounded-xl flex items-center justify-between text-left transition-all duration-300 group cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-950/60 text-amber-500 rounded-lg group-hover:scale-110 transition-transform">
                    <Zap className="w-4 h-4 fill-amber-500/10" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">弾のダメージ増加</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">主砲弾エネルギーを【＋10〜30】臨界上昇</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors" />
              </button>
            </div>

            <div className="text-[10px] text-slate-500 mt-1 font-mono tracking-wide">
              ※ 次ステージ (Stage {playerStats.stage + 1}) へ進みます。
            </div>
          </div>
        </div>
      )}
      </div> {/* Close Main Game Screen Outer Shell */}
    </div>
  );
}
