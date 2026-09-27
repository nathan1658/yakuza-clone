/**
 * The lost pager (substory_pager): a black case face up on the pavement,
 * its screen lit and its LED blinking a missed page. World hides it while
 * the narrative's 'pager_picked' flag is set.
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { LOCATIONS } from '../data/locations';

/** Half as big again as life, or it would be a speck from the camera. */
const CASE = { w: 0.09, h: 0.026, d: 0.062 } as const;
/** HDR red, so bloom turns the tiny LED into a glint you notice from the kerb. */
const LED_GAIN = 8;

export interface Pager {
  readonly root: Group;
  /** Real time: two quick flashes every two seconds. */
  update(realElapsed: number): void;
}

export function createPager(): Pager {
  const { position, yaw } = LOCATIONS.substory_pager;
  const root = new Group();
  root.name = 'world:pager';
  root.position.copy(position);
  root.rotation.y = yaw + 0.5;

  const body = new Mesh(new BoxGeometry(CASE.w, CASE.h, CASE.d), new MeshLambertMaterial({ color: 0x1c1d20 }));
  body.position.y = CASE.h / 2;
  body.receiveShadow = true;
  const screen = new Mesh(new BoxGeometry(CASE.w * 0.62, 0.002, CASE.d * 0.5), new MeshBasicMaterial({ color: 0x9fd36a }));
  screen.position.set(-CASE.w * 0.1, CASE.h + 0.001, -CASE.d * 0.1);
  const ledMaterial = new MeshBasicMaterial({ color: 0xff2010 });
  ledMaterial.color.multiplyScalar(LED_GAIN);
  const led = new Mesh(new BoxGeometry(0.01, 0.004, 0.01), ledMaterial);
  led.position.set(CASE.w * 0.36, CASE.h + 0.002, CASE.d * 0.3);
  root.add(body, screen, led);

  return {
    root,
    update(t) {
      const p = t % 2;
      led.visible = p < 0.08 || (p > 0.22 && p < 0.3);
    },
  };
}
