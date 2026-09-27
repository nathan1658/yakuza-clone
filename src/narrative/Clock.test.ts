import { describe, expect, it } from 'vitest';
import { Clock } from './Clock';

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Clock', () => {
  it('resolves waits once enough real time has ticked', async () => {
    const c = new Clock();
    const done: string[] = [];
    void c.wait(1).then(() => done.push('a'));
    void c.wait(0.5).then(() => done.push('b'));
    c.tick(0.4);
    await flush();
    expect(done).toEqual([]);
    c.tick(0.2);
    await flush();
    expect(done).toEqual(['b']);
    c.tick(0.5);
    await flush();
    expect(done).toEqual(['b', 'a']);
  });

  it('zero or negative waits resolve on the next tick', async () => {
    const c = new Clock();
    let hit = false;
    void c.wait(-3).then(() => (hit = true));
    await flush();
    expect(hit).toBe(false);
    c.tick(0);
    await flush();
    expect(hit).toBe(true);
  });
});
