import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Shield, 
  Heart, 
  Trophy, 
  Coins, 
  Play, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Award, 
  ShoppingBag, 
  ChevronRight, 
  Crosshair, 
  Flame, 
  Radio
} from 'lucide-react';
import { GameState, PlayerStats, ShopUpgrade } from './types';
import GameCanvas from './components/GameCanvas';
import { audio } from './lib/audio';

// Base initial level 1 stats before shop upgrades
const BASE_STATS: PlayerStats = {
  hp: 200,
  maxHp: 200,
  damage: 2,
  fireRate: 3.5, // shots per sec
  bulletSpeed: 9,
  bulletCount: 1,
  bulletPierce: 0,
  bulletSize: 1.0,
  homingCount: 0,
  shieldHp: 0,
  maxShieldHp: 3,
  magnetRange: 60,
  gold: 0,
  score: 0,
  stage: 1,
};

// Define Permanent upgrades available in Hangar
const UPGRADES_LIST: ShopUpgrade[] = [
  { id: 'dmg', name: 'レーゼル主砲 (攻撃力)', description: '基礎弾丸のダメージを +1 強化します。', cost: 120, level: 1, maxLevel: 10, icon: 'Flame' },
  { id: 'rate', name: '射撃コア (連射速度)', description: '一秒間辺りの弾丸発射頻度を +15% 加速します。', cost: 150, level: 1, maxLevel: 10, icon: 'Zap' },
  { id: 'hp', name: '超合金装甲 (最大HP)', description: '機体構造を強化して最大耐久値を +20 増大します。', cost: 100, level: 1, maxLevel: 10, icon: 'Heart' },
  { id: 'shield', name: 'バリア展開器 (シールド)', description: '初めから物理衝突や弾から守るエネルギーシールドを +1 得ます。', cost: 200, level: 0, maxLevel: 5, icon: 'Shield' },
  { id: 'magnet', name: '磁力レシーバー (磁石)', description: '撃破時にドロップするゴールドや回復結晶を引き寄せる範囲を +30px 広げます。', cost: 80, level: 1, maxLevel: 8, icon: 'Radio' },
];

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [sessionGoldEarned, setSessionGoldEarned] = useState<number>(0);
  const [sessionScoreEarned, setSessionScoreEarned] = useState<number>(0);

  // Shop upgrade levels stored in states and localStorage
  const [upgrades, setUpgrades] = useState<ShopUpgrade[]>(UPGRADES_LIST);
  const [playerGold, setPlayerGold] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);

  // Live in-game stats
  const [playerStats, setPlayerStats] = useState<PlayerStats>(BASE_STATS);

  // 1. Initialise and load data from localStorage
  useEffect(() => {
    setIsMuted(audio.getMuted());
    
    // Load High score
    const savedHighScore = localStorage.getItem('pgs_high_score');
    if (savedHighScore) {
      setHighScore(parseInt(savedHighScore));
    }

    // Load Gold purse
    const savedGold = localStorage.getItem('pgs_gold_count');
    if (savedGold) {
      const g = parseInt(savedGold);
      setPlayerGold(g);
      setPlayerStats(prev => ({ ...prev, gold: g }));
    }

    // Load Shop upgrades levels
    const savedUpgrades = localStorage.getItem('pgs_shop_upgrades');
    if (savedUpgrades) {
      try {
        const parsed = JSON.parse(savedUpgrades);
        setUpgrades(prev => prev.map(up => {
          const l = parsed[up.id];
          if (l !== undefined) {
            return { ...up, level: l, cost: up.cost * Math.pow(1.5, l - (up.id === 'shield' ? 0 : 1)) };
          }
          return up;
        }));
      } catch (e) {
        console.error("Failed loading retro upgrades", e);
      }
    }
  }, []);

  // 2. Synthesize baseline parameters depending on Upgrade Levels bought
  const calculateRunStartingStats = (stageNum: number): PlayerStats => {
    // Get levels
    const dmgLvl = upgrades.find(u => u.id === 'dmg')?.level || 1;
    const rateLvl = upgrades.find(u => u.id === 'rate')?.level || 1;
    const hpLvl = upgrades.find(u => u.id === 'hp')?.level || 1;
    const shieldLvl = upgrades.find(u => u.id === 'shield')?.level || 0;
    const magnetLvl = upgrades.find(u => u.id === 'magnet')?.level || 1;

    const maxHpVal = BASE_STATS.maxHp + (hpLvl - 1) * 20;
    const damageVal = BASE_STATS.damage + (dmgLvl - 1) * 1;
    const fireRateVal = BASE_STATS.fireRate + (rateLvl - 1) * 0.45;
    const magnetVal = BASE_STATS.magnetRange + (magnetLvl - 1) * 25;

    return {
      hp: maxHpVal,
      maxHp: maxHpVal,
      damage: damageVal,
      fireRate: parseFloat(fireRateVal.toFixed(2)),
      bulletSpeed: BASE_STATS.bulletSpeed,
      bulletCount: BASE_STATS.bulletCount,
      bulletPierce: BASE_STATS.bulletPierce,
      bulletSize: BASE_STATS.bulletSize,
      homingCount: BASE_STATS.homingCount,
      shieldHp: shieldLvl,
      maxShieldHp: shieldLvl > 0 ? shieldLvl : 3, // Capacity cap
      magnetRange: magnetVal,
      gold: playerGold,
      score: 0,
      stage: stageNum
    };
  };

  // Launch the campaign stage
  const startNewRun = (stageNum: number) => {
    audio.playGatePass();
    const starterStats = calculateRunStartingStats(stageNum);
    setPlayerStats(starterStats);
    setSessionGoldEarned(0);
    setSessionScoreEarned(0);
    setGameState('PLAYING');
  };

  // Triggered when current stage's Boss is eliminated
  const handleBossDefeated = (goldReward: number, scoreReward: number) => {
    audio.playStageCleared();
    
    // Add rewards to persistent state
    const finalGold = playerGold + goldReward;
    setPlayerGold(finalGold);
    localStorage.setItem('pgs_gold_count', String(finalGold));

    setSessionGoldEarned(goldReward);
    setSessionScoreEarned(scoreReward);

    // Save high score if beaten
    const currentTotalScore = playerStats.score + scoreReward;
    if (currentTotalScore > highScore) {
      setHighScore(currentTotalScore);
      localStorage.setItem('pgs_high_score', String(currentTotalScore));
    }

    setGameState('UPGRADE_SHOP');
  };

  // Upgrading baseline specs inside the permanent shop
  const purchaseUpgrade = (up: ShopUpgrade) => {
    if (playerGold < up.cost || up.level >= up.maxLevel) {
      audio.playPlayerHurt(); // buzzer
      return;
    }

    audio.playGatePass(); // upgrade ding!
    const newGold = playerGold - up.cost;
    setPlayerGold(newGold);
    localStorage.setItem('pgs_gold_count', String(newGold));

    // Increase levels
    const nextLevel = up.level + 1;
    const nextCost = Math.round(up.cost * 1.5);

    const updatedUpgrades = upgrades.map(item => {
      if (item.id === up.id) {
        return { ...item, level: nextLevel, cost: nextCost };
      }
      return item;
    });
    setUpgrades(updatedUpgrades);

    // Persist upgrade map levels
    const levelsMap = updatedUpgrades.reduce((acc, current) => {
      acc[current.id] = current.level;
      return acc;
    }, {} as { [key: string]: number });
    localStorage.setItem('pgs_shop_upgrades', JSON.stringify(levelsMap));

    // Instantly sync gold to stats
    setPlayerStats(prev => ({ ...prev, gold: newGold }));
  };

  // Proceed to next stage clearance values mapping
  const proceedToNextStage = () => {
    const nextStg = playerStats.stage + 1;
    startNewRun(nextStg);
  };

  // Reset progress and high scores
  const fullRestartTotalReset = () => {
    audio.playGameOver();
    localStorage.clear();
    setPlayerGold(0);
    setHighScore(0);
    setUpgrades(UPGRADES_LIST.map(up => ({ ...up, level: up.id === 'shield' ? 0 : 1, cost: up.cost })));
    setPlayerStats(BASE_STATS);
    setGameState('START');
  };

  const getUpgradeIcon = (iconName: string) => {
    switch (iconName) {
      case 'Flame': return <Flame className="w-5 h-5 text-red-400" />;
      case 'Zap': return <Zap className="w-5 h-5 text-green-400" />;
      case 'Heart': return <Heart className="w-5 h-5 text-pink-400" />;
      case 'Shield': return <Shield className="w-5 h-5 text-blue-400" />;
      case 'Radio': return <Radio className="w-5 h-5 text-amber-400" />;
      default: return <Sparkles className="w-5 h-5 text-indigo-400" />;
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30">
      
      {/* Absolute top visual header banner */}
      <header className="mb-4 text-center select-none">
        <h1 className="text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 flex items-center justify-center gap-2">
          <Crosshair className="w-7 h-7 text-indigo-400 animate-spin" style={{ animationDuration: '6s' }} />
          POWER GATE SHOOTER
        </h1>
        <p className="text-xs text-slate-400 tracking-widest mt-1">
          ゲートを通過し極限までパワーアップせよ
        </p>
      </header>

      {/* Main Core Router container */}
      <AnimatePresence mode="wait">
        
        {/* State A: START MENU */}
        {gameState === 'START' && (
          <motion.div 
            key="start"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col gap-6 backdrop-blur-sm relative overflow-hidden"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-500" />
            
            {/* Highscore panel */}
            <div className="flex items-center justify-between bg-slate-950/60 p-4 rounded-xl border border-indigo-950/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-950/60 rounded text-indigo-400">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ハイスコア</p>
                  <p className="text-lg font-black font-mono text-white leading-none mt-1">{highScore}</p>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <div className="flex items-center gap-1 bg-yellow-950/30 border border-yellow-900/40 px-2 py-1 rounded text-yellow-500 font-mono text-xs font-bold justify-end">
                  <Coins className="w-3.5 h-3.5 fill-yellow-500/20" />
                  <span>{playerGold}</span>
                </div>
                <span className="text-[9px] text-slate-500 leading-none">所持ゴールド</span>
                <button
                  onClick={() => {
                    setPlayerGold(0);
                    localStorage.setItem('pgs_gold_count', '0');
                    setPlayerStats(prev => ({ ...prev, gold: 0 }));
                    audio.playPlayerHurt();
                  }}
                  className="text-[9px] text-red-400 font-bold bg-red-950/30 hover:bg-red-900/40 px-1.5 py-0.5 rounded border border-red-500/20 hover:border-red-400/40 cursor-pointer active:scale-95 transition-all text-center leading-none mt-0.5"
                >
                  リセット
                </button>
              </div>
            </div>

            {/* Campaign Guide Section */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                ☄️ ゲームシステム
              </h3>
              <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
                <li className="flex gap-2">
                  <span className="text-indigo-400 font-black">▶</span>
                  <span><strong>自動連射 & 操従</strong>: 移動キー/マウス/ドラッグで敵に向けて自動で弾丸を連続射撃します。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 font-black">▶</span>
                  <span><strong>ダブルゲート</strong>: 進行度(Wave)内に必ず２回現れるパワーアップゲートを通って、機体を即時超強化できます。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 font-black">▶</span>
                  <span><strong>ボスと宝箱の秘宝</strong>: Wave末期に降臨する極悪ボスを撃破すると、<strong>超強力な「宝箱」</strong>が出現！宝箱を獲得後、新たなステージに進めます。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-indigo-400 font-black">▶</span>
                  <span><strong>永続育成</strong>: 撃墜されるまでに集めたゴールドで、ハンガーから基礎パラメータを永久強化可能！</span>
                </li>
              </ul>
            </div>

            {/* Infinite Endless Launch Button */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => startNewRun(1)}
                className="w-full py-4.5 bg-gradient-to-r from-indigo-600 via-violet-650 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border border-indigo-500/30 hover:border-indigo-400 rounded-2xl flex flex-col items-center justify-center gap-0.5 group transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-2">
                  <Play className="w-5 h-5 fill-white text-white group-hover:scale-110 transition-transform animate-pulse" />
                  <span className="text-lg font-black tracking-widest text-white leading-none">深淵に向かう (START)</span>
                </div>
                <span className="text-[10px] text-slate-300 group-hover:text-white transition-colors tracking-wide mt-0.5">
                  撃墜されるまで進む、無限スクロールバトル
                </span>
              </button>
            </div>

            {/* Hangar Upgrades Access Button */}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  audio.playGatePass();
                  setGameState('UPGRADE_SHOP');
                }}
                className="w-full p-4 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold rounded-xl flex items-center justify-center gap-2 group cursor-pointer transition-all"
              >
                <ShoppingBag className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                <span>永久強化格納庫 (ハンガー) へ</span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            
            {/* Audio Muted HUD */}
            <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-850 pt-2 mt-1">
              <span>バージョン v2.3 (安定版)</span>
              <button 
                onClick={() => {
                  const m = audio.toggleMute();
                  setIsMuted(m);
                }}
                className="flex items-center gap-1 hover:text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-850 cursor-pointer"
              >
                {isMuted ? '消音中 (ON)' : 'サウンド再生中 (OFF)'}
              </button>
            </div>
          </motion.div>
        )}

        {/* State B: ACTIVE GAMEPLAY */}
        {gameState === 'PLAYING' && (
          <motion.div 
            key="game-active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full flex justify-center py-1"
          >
            <GameCanvas
              gameState={gameState}
              setGameState={setGameState}
              playerStats={playerStats}
              setPlayerStats={setPlayerStats}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              onBossDefeated={handleBossDefeated}
            />
          </motion.div>
        )}

        {/* State C: THE ROGUELITE SHOP & STAGE REMEDY */}
        {gameState === 'UPGRADE_SHOP' && (
          <motion.div 
            key="upgrade-shop"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col gap-5 backdrop-blur-sm relative"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-500 via-amber-500 to-indigo-500" />
            
            {/* Congrats Stage clearance if any */}
            {sessionGoldEarned > 0 ? (
              <div className="text-center bg-gradient-to-r from-yellow-950/30 via-slate-900/40 to-yellow-950/30 p-4 border border-yellow-800/40 rounded-2xl flex flex-col gap-1 items-center animate-pulse">
                <Award className="w-10 h-10 text-yellow-500 mb-1" />
                <h2 className="text-xl font-black text-yellow-400 tracking-widest uppercase">STAGE {playerStats.stage} CLEAR!</h2>
                <p className="text-xs text-slate-300">
                  敵艦隊旗艦ボスの撃破に成功しました！
                </p>
                <div className="flex gap-4 mt-2 font-mono text-xs">
                  <span className="text-yellow-400 font-bold">💰 +{sessionGoldEarned}G</span>
                  <span className="text-indigo-400 font-bold">🏆 +{sessionScoreEarned}pts</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center bg-slate-950 px-4 py-3 rounded-xl border border-slate-800/60">
                <span className="text-sm text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  🛠️ 整備格納庫 (ハンガー)
                </span>
                <span className="text-xs text-slate-500">艦船ステータス永続強化</span>
              </div>
            )}

            {/* Wallet details */}
            <div className="flex justify-between items-center bg-slate-950/50 p-3.5 rounded-xl border border-yellow-905/20 leading-none">
              <span className="text-xs text-slate-400">パーツ開発資金:</span>
              <div className="flex items-center gap-1.5 text-yellow-400 font-mono text-lg font-black">
                <Coins className="w-5 h-5 fill-yellow-500/20" />
                <span>{playerGold} gold</span>
              </div>
            </div>

            {/* Shop Upgrade levels list */}
            <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1">
              {upgrades.map(up => {
                const isMax = up.level >= up.maxLevel;
                const canAfford = playerGold >= up.cost;

                return (
                  <div 
                    key={up.id}
                    className="flex justify-between items-center bg-slate-950/40 border border-slate-800/70 p-3 rounded-xl hover:border-slate-700 transition"
                  >
                    <div className="flex gap-3 items-center max-w-[70%]">
                      <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 flex-shrink-0">
                        {getUpgradeIcon(up.icon)}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-white leading-none">{up.name}</span>
                          <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono font-bold">
                            Lv.{up.level}/{up.maxLevel}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">{up.description}</p>
                      </div>
                    </div>

                    <button
                      disabled={isMax || !canAfford}
                      onClick={() => purchaseUpgrade(up)}
                      className={`px-3 py-2 rounded-lg font-mono font-bold text-xs flex flex-col items-center justify-center border transition-all w-24 cursor-pointer ${
                        isMax 
                          ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                          : !canAfford
                            ? 'bg-red-950/10 border-red-900/30 text-red-500 hover:bg-red-950/20'
                            : 'bg-yellow-950/40 border-yellow-500 hover:bg-yellow-500 hover:text-slate-950 text-yellow-400 active:scale-95'
                      }`}
                    >
                      {isMax ? (
                        <span>MAXED</span>
                      ) : (
                        <>
                          <span className="text-[9px] text-slate-400 group-hover:text-slate-900">UPGRADE</span>
                          <span className="leading-none mt-0.5">{up.cost}G</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Stage Clearance buttons router */}
            <div className="flex flex-col gap-2 mt-2">
              {sessionGoldEarned > 0 ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => setGameState('START')}
                    className="flex-1 p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    メニューに戻る
                  </button>
                  <button
                    onClick={proceedToNextStage}
                    className="flex-1 p-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-all shadow-lg"
                  >
                    <span>次ステージに出撃 (St. {playerStats.stage + 1})</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setGameState('START')}
                  className="w-full p-4 bg-indigo-600 hover:bg-indigo-505 text-white font-bold text-sm rounded-xl cursor-pointer transition-all"
                >
                  ハンガーを出る (メニューに戻る)
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* State D: GAME OVER */}
        {gameState === 'GAMEOVER' && (
          <motion.div 
            key="game-over"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-slate-900/90 border border-slate-850 p-6 rounded-3xl shadow-xl flex flex-col gap-6 backdrop-blur-sm relative items-center text-center"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-red-600" />
            
            <div className="p-4 bg-red-950/40 border border-red-900/40 rounded-full text-red-500 animate-pulse">
              <Shield className="w-12 h-12" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-red-500 tracking-wider">MISSION FAILED</h2>
              <p className="text-xs text-slate-400 mt-1">機体耐久値が低下、もしくは敵機を逃し過ぎました。</p>
            </div>

            {/* Run score metrics */}
            <div className="w-full bg-slate-950/60 border border-slate-850 p-4 rounded-2xl flex flex-col gap-2 font-mono">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">最高到達セクター:</span>
                <span className="text-white font-bold">Sector {playerStats.stage}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">獲得スコア:</span>
                <span className="text-indigo-400 font-bold">{playerStats.score} pts</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-900 pt-2">
                <span className="text-slate-500">回収ゴールド:</span>
                <span className="text-yellow-500 font-bold flex items-center gap-0.5">
                  💰 {playerGold} G
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-normal max-w-[85%]">
              獲得したゴールドは格納庫で機体の耐久値、攻撃力、連射速度の永続的な強化パーツ開発に使いましょう。繰り返す度により強く遠くまで這い上がれます！
            </p>

            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => startNewRun(playerStats.stage)}
                className="w-full p-4 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>セクター {playerStats.stage} から再挑戦</span>
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    audio.playGatePass();
                    setGameState('UPGRADE_SHOP');
                  }}
                  className="flex-1 p-3 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-750 text-xs font-bold rounded-xl text-yellow-400 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>格納庫で機体開発</span>
                </button>

                <button
                  onClick={() => setGameState('START')}
                  className="flex-1 p-3 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-750 text-xs font-bold rounded-xl text-slate-400 cursor-pointer"
                >
                  メニューに戻る
                </button>
              </div>
            </div>

            <div className="border-t border-slate-850 w-full pt-4 flex justify-center">
              <button
                onClick={() => {
                  if (confirm('進捗状況とゴールド、ハイスコアを永久消去しますか？')) {
                    fullRestartTotalReset();
                  }
                }}
                className="text-[10px] text-red-500/50 hover:text-red-500 cursor-pointer"
              >
                データを初期化する
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
