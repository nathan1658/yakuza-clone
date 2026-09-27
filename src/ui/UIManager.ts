import './ui.css';
import type {
  DialogueLineView, GameContext, GameEvents, GameSystem, GameTime, InputAction, IUIManager, ShopId, ZoneId,
} from '../core/types';
import type { Host } from './Host';
import { ModalStack } from './Modal';
import { Projector } from './Projector';
import { el, take, toggle } from './dom';
import { Clock } from './logic/Clock';
import { BossBar } from './hud/BossBar';
import { DamageNumbers } from './hud/DamageNumbers';
import { EnemyBars } from './hud/EnemyBars';
import { HeatPrompt } from './hud/HeatPrompt';
import { InteractPrompt } from './hud/InteractPrompt';
import { LockReticle } from './hud/LockReticle';
import { Minimap } from './hud/Minimap';
import { ObjectivePanel } from './hud/ObjectivePanel';
import { StatusPanel } from './hud/StatusPanel';
import { TouchControls } from './hud/TouchControls';
import { DialogueBox } from './modal/DialogueBox';
import { PauseMenu, type PauseTab } from './modal/PauseMenu';
import { QTEPrompt } from './modal/QTEPrompt';
import { ShopMenu } from './modal/ShopMenu';
import { ChapterCard } from './overlay/ChapterCard';
import { DebugOverlay } from './overlay/DebugOverlay';
import { Fader } from './overlay/Fader';
import { HeatActionName } from './overlay/HeatActionName';
import { Letterbox } from './overlay/Letterbox';
import { LocationBanner } from './overlay/LocationBanner';
import { QuestBanner } from './overlay/QuestBanner';
import { Subtitle } from './overlay/Subtitle';
import { Toasts, type ToastKind } from './overlay/Toasts';
import { ControlsOverlay } from './screens/ControlsOverlay';
import { Credits } from './screens/Credits';
import { GameOverScreen } from './screens/GameOverScreen';
import { LoadingScreen } from './screens/LoadingScreen';
import { TitleScreen } from './screens/TitleScreen';

/** Every component, created in init(). */
interface Parts {
  readonly hud: HTMLElement;
  readonly lockHint: HTMLElement;
  readonly touch: TouchControls;
  readonly status: StatusPanel;
  readonly objective: ObjectivePanel;
  readonly minimap: Minimap;
  readonly boss: BossBar;
  readonly prompt: InteractPrompt;
  readonly enemies: EnemyBars;
  readonly reticle: LockReticle;
  readonly heatPrompt: HeatPrompt;
  readonly damage: DamageNumbers;
  readonly subtitle: Subtitle;
  readonly toasts: Toasts;
  readonly location: LocationBanner;
  readonly questBanner: QuestBanner;
  readonly heatName: HeatActionName;
  readonly chapter: ChapterCard;
  readonly letterbox: Letterbox;
  readonly fader: Fader;
  readonly debug: DebugOverlay;
  readonly dialogue: DialogueBox;
  readonly qte: QTEPrompt;
  readonly shop: ShopMenu;
  readonly controls: ControlsOverlay;
  readonly pause: PauseMenu;
  readonly title: TitleScreen;
  readonly gameOver: GameOverScreen;
  readonly credits: Credits;
}

/**
 * DOM UI over the canvas. Owns no game state: the HUD pulls from ctx every
 * frame and writes the DOM only when a value changed; world-anchored bits are
 * projected in lateUpdate, after the camera rig has moved.
 */
export class UIManager implements IUIManager, GameSystem, Host {
  readonly name = 'ui';
  readonly clock = new Clock();
  readonly modals: ModalStack;
  readonly projector: Projector;
  private parts: Parts | null = null;
  private loading: LoadingScreen | null = null;
  private hudAllowed = true;
  private hudOn = false;
  private readonly unsubscribe: (() => void)[] = [];

  constructor(readonly ctx: GameContext, private readonly root: HTMLElement) {
    root.classList.add('yk-ui');
    this.modals = new ModalStack(() => ctx.engine.time.frame);
    this.projector = new Projector(() => ctx.engine.camera);
  }

  private get p(): Parts {
    if (!this.parts) throw new Error('[UI] used before init()');
    return this.parts;
  }

  // --- GameSystem ------------------------------------------------------------

  init(): void {
    this.parts = this.build();
    const on = <K extends keyof GameEvents>(type: K, fn: (e: GameEvents[K]) => void) =>
      this.unsubscribe.push(this.ctx.events.on(type, fn));
    const p = this.parts;
    on('combat:hit', (hit) => p.damage.spawn(hit));
    on('boss:hp', ({ hp, maxHp }) => p.boss.setHp(hp, maxHp));
    on('boss:phase', ({ phase }) => p.boss.setPhase(phase));
    on('zone:changed', ({ to }) => { if (this.hudOn) p.location.show(to); });
    on('quest:completed', ({ questId, kind }) => this.questCompleted(questId, kind));
    on('save:failed', () => this.toast('儲存失敗', 'warning'));
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  update(time: GameTime): void {
    const p = this.p;
    const { input, state, debug } = this.ctx;
    const dt = time.realDt;
    this.clock.tick(dt);
    this.modals.update(dt, input);
    if (this.modals.empty && state.is('freeRoam', 'combat')) this.menuHotkeys(p);
    if (debug.enabled && take(input, 'debug')) p.debug.toggle();
    this.hudOn = this.hudAllowed && state.is('freeRoam', 'combat');
    toggle(p.hud, 'is-on', this.hudOn);
    // Esc-closing a menu can't re-grab the mouse (Esc is no user gesture): say a click will.
    toggle(p.lockHint, 'is-on', !input.pointerLocked);
    toggle(this.root, 'is-touch', input.touch);
    p.touch.update(this.hudOn, state.is('combat'));
    p.boss.suppress(!this.hudOn);
    if (this.hudOn) {
      p.status.update();
      p.objective.update();
    }
    p.debug.update(dt);
  }

  lateUpdate(): void {
    const p = this.p;
    const on = this.hudOn;
    this.projector.begin();
    p.prompt.update(on);
    p.enemies.update(on);
    p.reticle.update(on);
    p.heatPrompt.update(on);
    p.damage.update();
    if (on) p.minimap.draw(this.clock.now);
  }

  dispose(): void {
    for (const off of this.unsubscribe.splice(0)) off();
    window.removeEventListener('resize', this.onResize);
  }

  // --- IUIManager ------------------------------------------------------------

  presentLine(line: DialogueLineView): Promise<number> {
    return this.p.dialogue.present(line);
  }

  hideDialogue(): void {
    this.p.dialogue.hide();
  }

  showSubtitle(text: string, speaker?: string, durationSec?: number): void {
    this.p.subtitle.show(text, speaker, durationSec);
  }

  toast(text: string, kind?: ToastKind): void {
    this.p.toasts.push(text, kind);
  }

  showLocationBanner(zone: ZoneId): void {
    this.p.location.show(zone);
  }

  showChapterTitle(chapter: string, title: string, subtitleEn?: string): Promise<void> {
    this.ctx.audio.playSfx('chapter_sting');
    return this.p.chapter.show(chapter, title, subtitleEn);
  }

  showHeatActionName(nameZh: string, nameEn: string): void {
    this.p.heatName.show(nameZh, nameEn);
  }

  showBossBar(name: string, title: string): void {
    this.p.boss.show(name, title);
  }

  hideBossBar(): void {
    this.p.boss.hide();
  }

  runQTE(keys: InputAction[], windowSec: number): Promise<boolean> {
    return this.p.qte.start(keys, windowSec);
  }

  openShop(shop: ShopId): Promise<void> {
    return this.p.shop.open(shop);
  }

  openPauseMenu(tab?: PauseTab): void {
    this.p.pause.open(tab);
  }

  closePauseMenu(): void {
    this.p.pause.close();
  }

  showTitleScreen(hasSave: boolean): Promise<'new' | 'continue'> {
    return this.p.title.show(hasSave);
  }

  showGameOver(): Promise<'retry' | 'title'> {
    return this.p.gameOver.show();
  }

  showCredits(): Promise<void> {
    return this.p.credits.show();
  }

  setLetterbox(on: boolean): void {
    this.p.letterbox.set(on);
  }

  fade(toBlack: boolean, durationSec: number): Promise<void> {
    return this.p.fader.fade(toBlack, durationSec);
  }

  setHudVisible(visible: boolean): void {
    this.hudAllowed = visible;
  }

  /** Works before init(): the loading screen needs nothing but its own DOM. */
  showLoading(progress: number, label: string): void {
    this.loading ??= new LoadingScreen(this.root);
    this.loading.set(progress, label);
  }

  hideLoading(): void {
    this.loading?.finish();
    this.loading = null;
  }

  // --- internals -------------------------------------------------------------

  private build(): Parts {
    const { root, clock, ctx } = this;
    const hud = el('div', 'yk-hud', root);
    const touch = new TouchControls(hud, ctx.input);
    const anchored = el('div', 'yk-anchored', hud);
    const controls = new ControlsOverlay(this, root);
    return {
      hud,
      lockHint: el('div', 'yk-lockhint', hud, '點擊畫面以控制鏡頭'),
      touch,
      enemies: new EnemyBars(anchored, this),
      prompt: new InteractPrompt(anchored, this),
      reticle: new LockReticle(anchored, this),
      heatPrompt: new HeatPrompt(anchored, this),
      damage: new DamageNumbers(anchored, this),
      status: new StatusPanel(hud, ctx),
      objective: new ObjectivePanel(hud, ctx),
      minimap: new Minimap(hud, ctx),
      boss: new BossBar(hud),
      toasts: new Toasts(root, clock),
      location: new LocationBanner(root, clock),
      questBanner: new QuestBanner(root),
      heatName: new HeatActionName(root),
      letterbox: new Letterbox(root),
      fader: new Fader(root, clock),
      dialogue: new DialogueBox(this, root),
      subtitle: new Subtitle(root, clock),
      chapter: new ChapterCard(root, clock),
      qte: new QTEPrompt(this, root),
      shop: new ShopMenu(this, root),
      controls,
      pause: new PauseMenu(this, root, controls),
      title: new TitleScreen(this, root, controls),
      gameOver: new GameOverScreen(this, root),
      credits: new Credits(this, root),
      debug: new DebugOverlay(root, ctx),
    };
  }

  /** Esc opens the system tab, I the items tab. Only in free roam / combat with nothing else open. */
  private menuHotkeys(p: Parts): void {
    const { input } = this.ctx;
    if (take(input, 'pause')) p.pause.open('system');
    else if (take(input, 'inventory')) p.pause.open('inventory');
  }

  private questCompleted(questId: string, kind: GameEvents['quest:completed']['kind']): void {
    const quest = this.ctx.narrative.getQuests().find((q) => q.id === questId);
    this.p.questBanner.show(kind, quest?.titleZh ?? '');
    this.ctx.audio.playSfx('quest_complete');
  }

  private readonly onResize = (): void => {
    this.projector.resize(window.innerWidth, window.innerHeight);
    this.p.minimap.resize();
  };
}
