/**
 * Composition root. The ONLY file that imports concrete classes across modules.
 *
 * Init order (a system's init() may use systems EARLIER in this list only;
 * anything later must be touched lazily — first update() or an event):
 *   save → audio → ui → cameraRig → world → entities → interactions
 *        → inventory → combat → narrative
 *
 * Update order (engine registration order; lateUpdate runs in the same order):
 *   narrative → entities → interactions → combat → world → cameraRig
 *        → audio → ui → save
 */
import { EventBus } from './EventBus';
import { GameEngine } from './GameEngine';
import { InputManager } from './InputManager';
import { PhysicsWorld } from './PhysicsWorld';
import { CameraRig } from './CameraRig';
import { SaveSystem } from './SaveSystem';
import { InteractionRegistry } from './InteractionRegistry';
import { GameStateMachine } from '../state/GameStateMachine';
import { AudioSystem } from '../assets/audio/AudioSystem';
import { World } from '../world/World';
import { EntityManager } from '../entities/EntityManager';
import { CombatSystem } from '../combat/CombatSystem';
import { Inventory } from '../inventory/Inventory';
import { Narrative } from '../narrative/Narrative';
import { UIManager } from '../ui/UIManager';
import type { GameContext, GameEvents, GameSystem } from './types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export class GameInstance {
  private ctx!: GameContext;

  constructor(
    private readonly gameRoot: HTMLElement,
    private readonly uiRoot: HTMLElement,
  ) {}

  async boot(): Promise<void> {
    const events = new EventBus<GameEvents>();
    const input = new InputManager(this.gameRoot);
    const physics = await PhysicsWorld.create();
    const engine = new GameEngine(this.gameRoot, input, physics);

    const ctx = {} as Mutable<GameContext>;
    ctx.debug = parseDebugFlags(location.search);
    ctx.events = events;
    ctx.input = input;
    ctx.physics = physics;
    ctx.engine = engine;
    ctx.state = new GameStateMachine(events);
    ctx.interactions = new InteractionRegistry(ctx);
    ctx.save = new SaveSystem(ctx);
    ctx.audio = new AudioSystem(ctx);
    ctx.ui = new UIManager(ctx, this.uiRoot);
    ctx.cameraRig = new CameraRig(ctx);
    ctx.world = new World(ctx);
    ctx.entities = new EntityManager(ctx);
    ctx.inventory = new Inventory(ctx);
    ctx.combat = new CombatSystem(ctx);
    ctx.narrative = new Narrative(ctx);
    this.ctx = ctx;

    const sys = (x: unknown) => x as GameSystem;
    const initOrder = [
      ctx.save, ctx.audio, ctx.ui, ctx.cameraRig, ctx.world, ctx.entities,
      ctx.interactions, ctx.inventory, ctx.combat, ctx.narrative,
    ].map(sys);
    const updateOrder = [
      ctx.narrative, ctx.entities, ctx.interactions, ctx.combat, ctx.world,
      ctx.cameraRig, ctx.audio, ctx.ui, ctx.save,
    ].map(sys);

    ctx.world.onBuildProgress = (p, label) => ctx.ui.showLoading(p, label);
    for (const [i, s] of initOrder.entries()) {
      ctx.ui.showLoading(i / initOrder.length, s.name);
      await s.init();
    }
    for (const s of updateOrder) engine.addSystem(s);

    this.wireAppFlow();
    if (ctx.debug.enabled) (window as unknown as { __game: GameContext }).__game = ctx;

    engine.start();
    ctx.ui.hideLoading();
    await this.enterTitle();
  }

  /** App-level reactions that belong to no single module. */
  private wireAppFlow(): void {
    const { ctx } = this;

    ctx.events.on('state:changed', ({ from, to }) => {
      ctx.engine.paused = to === 'menu' || to === 'shop';
      // Returning to title is a clean process restart. No partial-reset bugs.
      if (to === 'title' && from !== 'boot') location.reload();
    });

    ctx.events.on('player:died', () => void this.gameOver());

    // Browsers only start audio from a user gesture; take the first one we get.
    const unlock = () => void ctx.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  private async enterTitle(): Promise<void> {
    const { ctx } = this;
    if (ctx.debug.skipIntro || ctx.debug.chapter !== null) return this.newGame();
    ctx.state.transition('title');
    const choice = await ctx.ui.showTitleScreen(ctx.save.hasSave());
    await ctx.audio.unlock();
    if (choice === 'continue' && ctx.save.load()) {
      ctx.events.emit('game:loaded', {});
      await ctx.narrative.continueGame();
      return;
    }
    await this.newGame();
  }

  private async newGame(): Promise<void> {
    const { ctx } = this;
    ctx.save.resetAll();
    ctx.events.emit('game:newGame', {});
    await ctx.narrative.startNewGame();
  }

  private async gameOver(): Promise<void> {
    const { ctx } = this;
    if (!ctx.state.transition('gameOver')) return;
    const choice = await ctx.ui.showGameOver();
    if (choice === 'retry' && ctx.save.load()) {
      // A retry is a fresh attempt: the pre-fight autosave can hold almost no HP, which would loop into certain death.
      ctx.entities.player.hp = ctx.entities.player.maxHp;
      ctx.events.emit('game:loaded', {});
      await ctx.narrative.continueGame();
      return;
    }
    ctx.state.transition('title');
  }
}

function parseDebugFlags(search: string): GameContext['debug'] {
  const q = new URLSearchParams(search);
  const chapter = q.get('chapter');
  return {
    enabled: q.has('debug') || import.meta.env.DEV,
    chapter: chapter === null ? null : Number(chapter) || 1,
    skipIntro: q.has('skipIntro'),
    god: q.has('god'),
  };
}
