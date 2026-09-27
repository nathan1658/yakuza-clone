import { Box3, FogExp2, Group, Vector2, Vector3 } from 'three';
import type {
  GameContext,
  GameSystem,
  GameTime,
  HotspotDef,
  IWorld,
  LocationId,
  MinimapData,
  PropSpawn,
  TerritoryDef,
  TriggerDef,
  WeatherKind,
  WorldLocation,
  ZoneId,
} from '../core/types';
import { buildBuildings } from './build/buildings';
import { buildFurniture } from './build/furniture';
import { buildGround } from './build/ground';
import { buildHarbour } from './build/harbour';
import { createPager } from './build/pager';
import type { Pager } from './build/pager';
import { buildSigns } from './build/signs';
import { createSky } from './build/sky';
import { createSkyline } from './build/skyline';
import { buildOverhead } from './build/tram';
import { COLLIDERS } from './data/colliders';
import { HARBOUR_SIGNS } from './data/harbour';
import { BOUNDS } from './data/layout';
import { HOTSPOTS, LOCATIONS } from './data/locations';
import { MINIMAP } from './data/minimap';
import { PEDESTRIAN_PATHS } from './data/paths';
import { mulberry32 } from './data/rng';
import { SIGNS } from './data/signs';
import { SKYLINE_SIGNS } from './data/skyline';
import { sampleRing } from './data/spawnRing';
import { PROP_SPAWNS, TERRITORIES } from './data/spawns';
import { CAR_SIGNS } from './data/trams';
import { TriggerSet } from './data/TriggerSet';
import { clearLineXZ, isWalkableXZ } from './data/walkable';
import { ZoneTracker } from './data/ZoneTracker';
import { zoneAt } from './data/zones';
import { createRain } from './fx/rain';
import { createSplashes } from './fx/splashes';
import { createVideoScreen, SCREEN_LIGHT } from './fx/videoScreen';
import type { VideoScreen } from './fx/videoScreen';
import { WeatherState } from './fx/weather';
import { Batcher } from './rendering/Batcher';
import { LightRig } from './rendering/LightRig';
import { BATCH_STYLES, createMaterials } from './rendering/materials';
import { PostProcessing } from './rendering/PostProcessing';
import { Reflection } from './rendering/Reflection';
import { createSignAtlas, loadSignFonts } from './rendering/signAtlas';
import { createUniforms } from './rendering/uniforms';
import { TramLine } from './TramLine';

const FOG_COLOR = 0x1b1830;
/** How far ahead of the camera the shadow box and point lights centre. */
const FOCUS_AHEAD = 9;

/** A macrotask break so the loading screen can paint between build stages. */
const yieldFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Causeway Bay, 1990s: streets, buildings, furniture, lights, weather and
 * the queries the rest of the game asks of them. Built procedurally in
 * init(); per frame it tracks the player's zone and triggers, blends the
 * weather, runs the trams and the big screen, and moves the shadow/light
 * focus with the camera.
 */
export class World implements IWorld, GameSystem {
  readonly name = 'world';
  onBuildProgress?: (progress: number, label: string) => void;

  readonly bounds = new Box3(
    new Vector3(BOUNDS.minX, BOUNDS.minY, BOUNDS.minZ),
    new Vector3(BOUNDS.maxX, BOUNDS.maxY, BOUNDS.maxZ),
  );

  private readonly root = new Group();
  private readonly uniforms = createUniforms();
  private readonly fog = new FogExp2(FOG_COLOR, 0.011);
  private readonly weatherState = new WeatherState('rain');
  private readonly zones = new ZoneTracker();
  private readonly triggers = new TriggerSet(
    (triggerId) => this.ctx.events.emit('trigger:enter', { triggerId }),
    (triggerId) => this.ctx.events.emit('trigger:exit', { triggerId }),
  );
  private readonly paths: readonly Vector3[][] = PEDESTRIAN_PATHS.map((line) => line.map(([x, z]) => new Vector3(x, 0, z)));
  private readonly rng = mulberry32(0x5eed);
  private readonly focus = new Vector3();
  private readonly forward = new Vector3();
  private readonly buffer = new Vector2();
  private lights: LightRig | null = null;
  private trams: TramLine | null = null;
  private screen: VideoScreen | null = null;
  private pager: Pager | null = null;

  constructor(private readonly ctx: GameContext) {}

  get currentZone(): ZoneId {
    return this.zones.current;
  }

  get weather(): WeatherKind {
    return this.weatherState.kind;
  }

  async init(): Promise<void> {
    const scene = this.ctx.engine.scene;
    this.root.name = 'world';
    scene.add(this.root);
    const batch = new Batcher(BATCH_STYLES);

    await this.stage(0, '鋪路');
    buildGround(batch);

    await this.stage(0.2, '起樓');
    buildBuildings(batch);
    buildOverhead(batch);
    const sources = buildHarbour(batch);
    this.root.add(createSkyline(this.uniforms));
    this.addColliders();

    await this.stage(0.45, '掛招牌');
    sources.push(...buildFurniture(batch));
    const fixed = [...SIGNS, ...HARBOUR_SIGNS, ...SKYLINE_SIGNS];
    const boards = [...fixed, ...CAR_SIGNS];
    await loadSignFonts(boards);
    const atlas = createSignAtlas(boards);
    const signs = buildSigns(batch, fixed, atlas, this.uniforms);
    this.root.add(signs.mesh);
    sources.push(...signs.lights);
    this.screen = createVideoScreen(batch);
    this.root.add(this.screen.mesh);
    sources.push(SCREEN_LIGHT);

    await this.stage(0.65, '開霓虹');
    this.lights = new LightRig(sources);
    this.lights.attach(this.root);

    await this.stage(0.85, '落雨');
    this.root.add(createSky(this.uniforms), createRain(this.uniforms), createSplashes(this.uniforms));
    scene.fog = this.fog;
    const materials = createMaterials(this.uniforms);
    batch.flush(this.root, materials);
    this.trams = new TramLine(this.ctx);
    this.trams.build(this.root, { body: materials.flat, glow: materials.glow, signs: signs.mesh.material }, atlas);
    this.pager = createPager();
    this.root.add(this.pager.root);
    this.ctx.engine.setRenderPipeline(new PostProcessing(this.ctx.engine, new Reflection(this.uniforms)));
    this.onBuildProgress?.(1, '落雨');
  }

  update(time: GameTime): void {
    const u = this.uniforms;
    u.uTime.value = time.elapsed;
    u.uRealTime.value = time.realElapsed;
    this.weatherState.update(time.dt);
    const w = this.weatherState.current;
    u.uRain.value = w.rain;
    u.uWet.value = w.wet;
    this.fog.density = w.fog;
    u.uViewHalfHeight.value = this.ctx.engine.renderer.getDrawingBufferSize(this.buffer).y / 2;

    const player = this.ctx.entities.player;
    const p = player.position;
    const change = this.zones.update(p.x, p.z);
    if (change) this.ctx.events.emit('zone:changed', change);
    this.triggers.update(p.x, p.y, p.y + player.height, p.z);

    this.trams?.update(time);
    this.screen?.update(time.realElapsed, w.rain);
    this.showPager(time.realElapsed);

    // The camera moves after this system, so this trails it by a frame; the
    // shadow box and the 4 Hz light picks don't mind.
    const camera = this.ctx.engine.camera;
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.focus.copy(camera.position).addScaledVector(this.forward, FOCUS_AHEAD);
    this.focus.y = 0;
    this.lights?.update(this.focus, time.realDt);
  }

  getLocation(id: LocationId): WorldLocation {
    return LOCATIONS[id];
  }

  getZoneAt(position: Vector3): ZoneId {
    return zoneAt(position.x, position.z);
  }

  getHotspots(): readonly HotspotDef[] {
    return HOTSPOTS;
  }

  getPropSpawns(): readonly PropSpawn[] {
    return PROP_SPAWNS;
  }

  getTerritories(): readonly TerritoryDef[] {
    return TERRITORIES;
  }

  getPedestrianPaths(): readonly Vector3[][] {
    return this.paths;
  }

  getMinimapData(): MinimapData {
    return MINIMAP;
  }

  getSpawnPoints(center: Vector3, minR: number, maxR: number, count: number): Vector3[] {
    // A spawn behind a railing could never reach the fight at the centre.
    const ok = (x: number, z: number): boolean => isWalkableXZ(x, z) && clearLineXZ(center.x, center.z, x, z);
    const points = sampleRing(this.rng, center.x, center.z, minR, maxR, count, ok);
    return points.map(([x, z]) => new Vector3(x, 0, z));
  }

  isWalkable(position: Vector3): boolean {
    return isWalkableXZ(position.x, position.z);
  }

  addTrigger(def: TriggerDef): void {
    this.triggers.add(def);
  }

  removeTrigger(id: string): void {
    this.triggers.remove(id);
  }

  setWeather(weather: WeatherKind, transitionSec = 0): void {
    this.weatherState.set(weather, transitionSec);
  }

  private async stage(progress: number, label: string): Promise<void> {
    this.onBuildProgress?.(progress, label);
    await yieldFrame();
  }

  /** The lost pager lies there until the story says it was picked up. */
  private showPager(t: number): void {
    if (!this.pager) return;
    const picked = Boolean(this.ctx.narrative.getFlag('pager_picked'));
    this.pager.root.visible = !picked;
    if (!picked) this.pager.update(t);
  }

  private addColliders(): void {
    const physics = this.ctx.physics;
    for (const c of COLLIDERS) {
      const centre = new Vector3(c.x, c.y, c.z);
      if (c.kind === 'box') physics.createStaticBox(centre, new Vector3(c.hx, c.hy, c.hz), c.rotY);
      else physics.createStaticCylinder(centre, c.hh, c.r);
    }
  }
}
