import type {
  GameContext, GameSystem, GameTime, IAudioSystem, MusicId, PlaySfxOptions, SfxId,
} from '../../core/types';
import { Ambience } from './ambience/Ambience';
import type { AmbienceInput } from './ambience/levels';
import { Listener } from './mix/Listener';
import { Mixer } from './mix/Mixer';
import { MusicDirector } from './music/MusicDirector';
import { MusicPlayer } from './music/MusicPlayer';
import type { TrackId } from './music/types';
import { clampVolume, DEFAULT_VOLUMES, defaultStore, loadVolumes, saveVolumes, type Bus } from './settings';
import { SfxBank } from './sfx/SfxBank';

const DEFAULT_XF = 1.5;
const UNLOCK_XF = 0.5;

/**
 * Fully procedural audio. Nothing touches Web Audio until unlock(): before
 * that, music requests, ducks and volumes are remembered and SFX are dropped.
 * The graph is built once, on the first unlock; SFX and ambience beds render
 * offline in the background and become audible as they finish.
 */
export class AudioSystem implements IAudioSystem, GameSystem {
  readonly name = 'audio';

  private c: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private bank: SfxBank | null = null;
  private music: MusicPlayer | null = null;
  private amb: Ambience | null = null;
  private failed = false;

  private readonly listener = new Listener();
  private readonly store = defaultStore();
  private volumes = { ...DEFAULT_VOLUMES };
  private requested: MusicId = 'none';
  private level = 1;
  private modeDuckLevel = 1;
  private readonly offs: (() => void)[] = [];
  private readonly ambInput: AmbienceInput = { mode: 'boot', zone: 'percy', weather: 'rain', x: 0, z: 0 };

  private readonly director = new MusicDirector({
    mode: () => this.ctx.state.mode,
    zone: () => this.ctx.world.currentZone,
    play: (id, xf) => this.startMusic(id, xf),
    setLevel: (n) => {
      this.level = n;
      this.music?.setLevel(n);
    },
    modeDuck: (n) => {
      this.modeDuckLevel = n;
      this.mixer?.setModeDuck(n);
    },
    gameOverSting: () => {
      if (this.mixer) this.bank?.play('gameover_sting', undefined, this.mixer.music);
    },
  });

  constructor(private readonly ctx: GameContext) {}

  get currentMusic(): MusicId {
    return this.requested;
  }

  init(): void {
    this.volumes = loadVolumes(this.store);
    const { events } = this.ctx;
    const d = this.director;
    this.offs.push(
      events.on('state:changed', ({ to }) => d.onState(to)),
      events.on('zone:changed', () => d.onZone()),
      events.on('combat:start', ({ isBoss }) => d.onCombatStart(isBoss)),
      events.on('combat:end', ({ victory }) => d.onCombatEnd(victory)),
      events.on('boss:phase', ({ phase }) => d.onBossPhase(phase)),
    );
  }

  /** Safe to call any number of times, from a gesture or not; never rejects or waits on the browser. */
  unlock(): Promise<void> {
    const c = this.build();
    if (c && c.state !== 'running') c.resume().catch(() => {});
    return Promise.resolve();
  }

  playSfx(id: SfxId, opts?: PlaySfxOptions): void {
    this.bank?.play(id, opts);
  }

  playMusic(id: MusicId, crossfadeSec = DEFAULT_XF): void {
    this.director.onManual();
    this.startMusic(id, crossfadeSec);
  }

  duck(amount: number, realDuration: number): void {
    this.mixer?.duck(amount, realDuration);
  }

  setVolume(bus: Bus, value: number): void {
    this.volumes[bus] = clampVolume(value, this.volumes[bus]);
    saveVolumes(this.store, this.volumes);
    this.mixer?.setVolume(bus, this.volumes[bus]);
  }

  getVolume(bus: Bus): number {
    return this.volumes[bus];
  }

  update(time: GameTime): void {
    if (!this.amb) return;
    const s = this.ambInput;
    s.mode = this.ctx.state.mode;
    s.zone = this.ctx.world.currentZone;
    s.weather = this.ctx.world.weather;
    s.x = this.listener.pos.x;
    s.z = this.listener.pos.z;
    this.amb.update(time.realDt, s);
  }

  lateUpdate(): void {
    if (this.c) this.listener.place(this.c.listener, this.ctx.engine.camera);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.failed = true;
    if (!this.c) return;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.music?.dispose();
    this.amb?.dispose();
    this.bank?.stopAll();
    this.mixer?.dispose();
    this.c?.close().catch(() => {});
    this.c = this.mixer = this.bank = this.music = this.amb = null;
  }

  private startMusic(id: MusicId, crossfade: number): void {
    if (id === this.requested) return;
    this.requested = id;
    this.music?.play(id, crossfade);
  }

  /** Build the graph once and replay everything requested before unlock. */
  private build(): AudioContext | null {
    if (this.c || this.failed || typeof AudioContext !== 'function') return this.c;
    try {
      const c = (this.c = new AudioContext({ latencyHint: 'interactive' }));
      const mixer = (this.mixer = new Mixer(c, this.volumes));
      mixer.setModeDuck(this.modeDuckLevel);
      const bank = (this.bank = new SfxBank(c, mixer.sfx, this.listener.pos));
      this.music = new MusicPlayer(c, mixer.music, this.onTrackEnd);
      this.music.setLevel(this.level);
      if (this.requested !== 'none') this.music.play(this.requested, UNLOCK_XF);
      const amb = (this.amb = new Ambience(c, mixer.ambience, (id, o) => bank.play(id, o, mixer.ambience)));
      document.addEventListener('visibilitychange', this.onVisibility);
      void bank.renderAll().then(() => amb.render());
    } catch (err) {
      this.failed = true;
      console.warn('[audio] Web Audio unavailable; running silent', err);
    }
    return this.c;
  }

  private readonly onTrackEnd = (id: TrackId): void => {
    if (id === this.requested) this.requested = 'none';
    this.director.onTrackEnd();
  };

  private readonly onVisibility = (): void => {
    const c = this.c;
    if (!c || c.state === 'closed') return;
    (document.hidden ? c.suspend() : c.resume()).catch(() => {});
  };
}
