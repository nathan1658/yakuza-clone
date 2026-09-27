/**
 * Offline measurements for the audio sandbox, exposed as window.__audioLab.
 * Everything renders through the same code the game uses (recipes, Sequencer,
 * beds, Mixer + limiter), so the numbers are the numbers the player hears.
 */
import type { MusicId } from '../../src/core/types';
import { renderBed } from '../../src/assets/audio/ambience/beds';
import { LAYERS, type LayerId } from '../../src/assets/audio/ambience/levels';
import { Mixer } from '../../src/assets/audio/mix/Mixer';
import { Sequencer } from '../../src/assets/audio/music/Sequencer';
import { TRACKS } from '../../src/assets/audio/music/tracks';
import type { TrackId } from '../../src/assets/audio/music/types';
import { DEFAULT_VOLUMES, type Volumes } from '../../src/assets/audio/settings';
import { RECIPES } from '../../src/assets/audio/sfx/recipes';
import { renderRecipe } from '../../src/assets/audio/sfx/render';
import type { AnySfx } from '../../src/assets/audio/sfx/types';

const RATE = 48000;
const db = (x: number) => Math.round(20 * Math.log10(Math.max(x, 1e-9)) * 10) / 10;

export interface Meter { peak: number; peakDb: number; rmsDb: number; clipped: number }

export function meter(buf: AudioBuffer): Meter {
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    for (const x of buf.getChannelData(ch)) {
      const a = Math.abs(x);
      peak = Math.max(peak, a);
      sum += x * x;
      if (a > 1) clipped++;
    }
  }
  const rms = Math.sqrt(sum / (buf.length * buf.numberOfChannels));
  return { peak: Math.round(peak * 1000) / 1000, peakDb: db(peak), rmsDb: db(rms), clipped };
}

async function sfxBuffers(id: AnySfx): Promise<AudioBuffer[]> {
  return renderRecipe(id, RECIPES[id], RATE);
}

/** Every variant of one SFX, after the bank's normalisation. */
export async function renderSfx(id: AnySfx): Promise<Meter[]> {
  return (await sfxBuffers(id)).map(meter);
}

/** One row per SFX: loudest variant peak and RMS, for level balancing. */
export async function sfxTable(): Promise<Record<string, { peakDb: number; rmsDb: number }>> {
  const out: Record<string, { peakDb: number; rmsDb: number }> = {};
  for (const id of Object.keys(RECIPES) as AnySfx[]) {
    const m = await renderSfx(id);
    out[id] = { peakDb: Math.max(...m.map((x) => x.peakDb)), rmsDb: Math.max(...m.map((x) => x.rmsDb)) };
  }
  return out;
}

function sequence(c: BaseAudioContext, id: TrackId, dest: AudioNode, seconds: number, level: number): void {
  const s = new Sequencer(c, TRACKS[id], dest, 0.05);
  s.level = level;
  s.fader.gain.value = 1;
  s.advance(0, seconds);
}

/** A track on its own ("raw") and through the music bus at default volumes and the limiter ("mixed"). */
export async function renderMusic(id: TrackId, seconds = 20, level = 1): Promise<{ raw: Meter; mixed: Meter }> {
  const raw = new OfflineAudioContext(2, RATE * seconds, RATE);
  sequence(raw, id, raw.destination, seconds, level);
  const mixed = new OfflineAudioContext(2, RATE * seconds, RATE);
  sequence(mixed, id, new Mixer(mixed, DEFAULT_VOLUMES).music, seconds, level);
  return { raw: meter(await raw.startRendering()), mixed: meter(await mixed.startRendering()) };
}

export async function renderAmbience(id: LayerId): Promise<Meter> {
  const c = new OfflineAudioContext(2, RATE, RATE);
  return meter(await renderBed(id, c));
}

/**
 * Worst case: every bus at 100 %, boss music at full intensity, all beds up,
 * and a pile of the loudest SFX landing on the same sample twice over.
 */
export async function worstCase(music: TrackId = 'combat_boss', seconds = 8): Promise<{ out: Meter; volumes: Volumes }> {
  const volumes: Volumes = { master: 1, music: 1, sfx: 1, ambience: 1 };
  const c = new OfflineAudioContext(2, RATE * seconds, RATE);
  const mix = new Mixer(c, volumes);
  sequence(c, music, mix.music, seconds, 3);
  for (const id of LAYERS) {
    const src = c.createBufferSource();
    src.buffer = await renderBed(id, c);
    src.loop = true;
    src.connect(mix.ambience);
    src.start(0);
  }
  const hits: AnySfx[] = ['impact_boom', 'punch_heavy', 'heat_action', 'boss_roar', 'glass_break', 'crowd_cheer', 'chair_break', 'kick'];
  for (const id of hits) {
    const [buf] = await sfxBuffers(id);
    for (const t of [2, 2.01, 5]) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(mix.sfx);
      src.start(t);
    }
  }
  return { out: meter(await c.startRendering()), volumes };
}

export async function musicTable(seconds = 20): Promise<Record<string, { raw: Meter; mixed: Meter }>> {
  const out: Record<string, { raw: Meter; mixed: Meter }> = {};
  for (const id of Object.keys(TRACKS) as TrackId[]) out[id] = await renderMusic(id, seconds, id === 'combat_boss' ? 3 : 1);
  return out;
}

export const MUSIC_IDS: readonly MusicId[] = ['none', ...(Object.keys(TRACKS) as TrackId[])];
