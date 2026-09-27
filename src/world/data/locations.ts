/**
 * Named anchors and interaction hotspots. Each position is chosen against the
 * furniture table: vendors stand behind their counters facing the customers,
 * callers stand in front of the booth facing it.
 */
import { Vector3 } from 'three';
import type { HotspotDef, LocationId, WorldLocation } from '../../core/types';

const HALF_PI = Math.PI / 2;

const L = (x: number, z: number, yaw: number): WorldLocation => ({ position: new Vector3(x, 0, z), yaw });

export const LOCATIONS: Readonly<Record<LocationId, WorldLocation>> = {
  player_start: L(-63, -6, Math.PI),
  percy_curry_fishball: L(-57.2, -24, -HALF_PI),
  percy_cha_chaan_teng: L(-71.1, -37, HALF_PI),
  percy_payphone: L(-58, -46, HALF_PI),
  percy_informant: L(-58.5, -18, -0.4),
  percy_alley: L(-83, -58, HALF_PI),
  percy_north: L(-64, -108, Math.PI),
  hennessy_center: L(-10, 2.4, HALF_PI),
  hennessy_newsstand: L(-27.8, 1.4, 0),
  hennessy_payphone: L(20, 21.9, 0),
  sogo_crossing: L(82, 12, 0),
  sogo_plaza: L(85, 33, Math.PI),
  sogo_plaza_entry: L(85, 22.5, 0),
  sogo_payphone: L(56, 21.9, 0),
  sogo_dai_pai_dong: L(68, 42, HALF_PI),
  typhoon_entry: L(-63, -152, Math.PI),
  typhoon_promenade: L(-45, -163, Math.PI),
  typhoon_pier: L(-31, -188, -HALF_PI),
  typhoon_payphone: L(-80, -152.1, 0),
  typhoon_crab_boat: L(20, -191.3, 0),
  substory_pager: L(-40, 22.6, 0),
  substory_debt: L(-118, 20.4, 0),
};

const HOTSPOT_RADIUS = 1.6;

const vendor = (id: HotspotDef['id'], x: number, z: number, shopId: HotspotDef['shopId']): HotspotDef => ({
  id,
  kind: 'vendor',
  position: new Vector3(x, 0, z),
  radius: HOTSPOT_RADIUS,
  label: '購買',
  shopId,
});

const payphone = (id: HotspotDef['id'], x: number, z: number): HotspotDef => ({
  id,
  kind: 'payphone',
  position: new Vector3(x, 0, z),
  radius: HOTSPOT_RADIUS,
  label: '打電話',
});

const pager = LOCATIONS.substory_pager.position;

export const HOTSPOTS: readonly HotspotDef[] = [
  vendor('hs_curry_fishball', -60, -24, 'shop_curry_fishball'),
  vendor('hs_cha_chaan_teng', -70.4, -39.2, 'shop_cha_chaan_teng'),
  vendor('hs_newsstand', -30, 2.8, 'shop_newsstand'),
  vendor('hs_crab_boat', 20, -187.8, 'shop_crab_boat'),
  payphone('hs_payphone_percy', -57.7, -46),
  payphone('hs_payphone_hennessy', 20, 22.2),
  payphone('hs_payphone_sogo', 56, 22.2),
  payphone('hs_payphone_typhoon', -80, -151.8),
  { id: 'hs_lost_pager', kind: 'pickup', position: pager.clone(), radius: HOTSPOT_RADIUS, label: '拾起' },
];
