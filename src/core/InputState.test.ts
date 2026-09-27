import { describe, expect, it } from 'vitest';
import { InputState } from './InputState';
import { BINDINGS, sourceLabel } from './InputManager';
import type { InputAction } from './types';

const DT = 1 / 60;

function make(): InputState<InputAction> {
  return new InputState<InputAction>(BINDINGS);
}

describe('InputState', () => {
  it('latches a press on the next beginFrame and clears it at endFrame', () => {
    const s = make();
    s.press('KeyJ');
    expect(s.wasPressed('lightAttack')).toBe(false); // not latched yet
    expect(s.isDown('lightAttack')).toBe(true);
    s.beginFrame(DT);
    expect(s.wasPressed('lightAttack')).toBe(true);
    s.endFrame();
    s.beginFrame(DT);
    expect(s.wasPressed('lightAttack')).toBe(false);
    expect(s.isDown('lightAttack')).toBe(true);
  });

  it('a press and release inside one frame still counts as pressed', () => {
    const s = make();
    s.press('Space');
    s.release('Space');
    s.beginFrame(DT);
    expect(s.wasPressed('dodge')).toBe(true);
    expect(s.wasReleased('dodge')).toBe(true);
    expect(s.isDown('dodge')).toBe(false);
  });

  it('one source drives several actions and each can be consumed separately', () => {
    const s = make();
    s.press('KeyE');
    s.beginFrame(DT);
    expect(s.wasPressed('interact')).toBe(true);
    expect(s.wasPressed('confirm')).toBe(true);
    s.consume('confirm');
    expect(s.wasPressed('confirm')).toBe(false);
    expect(s.wasPressed('interact')).toBe(true);
  });

  it('two sources of one action produce a single press / release edge', () => {
    const s = make();
    s.press('KeyW');
    s.beginFrame(DT);
    s.endFrame();
    s.press('ArrowUp');
    s.beginFrame(DT);
    expect(s.wasPressed('moveForward')).toBe(false);
    s.endFrame();
    s.release('KeyW');
    s.beginFrame(DT);
    expect(s.wasReleased('moveForward')).toBe(false);
    expect(s.isDown('moveForward')).toBe(true);
    s.endFrame();
    s.release('ArrowUp');
    s.beginFrame(DT);
    expect(s.wasReleased('moveForward')).toBe(true);
    expect(s.isDown('moveForward')).toBe(false);
  });

  it('ignores key repeat, unbound sources and releases of unheld sources', () => {
    const s = make();
    s.press('KeyJ');
    s.beginFrame(DT);
    s.endFrame();
    s.press('KeyJ'); // auto-repeat
    s.release('KeyZ');
    s.press('KeyZ');
    s.beginFrame(DT);
    expect(s.wasPressed('lightAttack')).toBe(false);
    expect(s.isBound('KeyZ')).toBe(false);
    s.release('Mouse0'); // never pressed (e.g. the click that grabbed pointer lock)
    expect(s.isDown('lightAttack')).toBe(true);
  });

  it('consumeBuffered honours the window and consumes exactly once', () => {
    const s = make();
    s.press('KeyJ');
    s.release('KeyJ');
    s.beginFrame(DT);
    s.endFrame();
    for (let i = 0; i < 9; i++) {
      s.beginFrame(DT);
      s.endFrame();
    }
    // 10 frames ≈ 0.167 s have passed since the press.
    s.beginFrame(DT);
    expect(s.consumeBuffered('lightAttack', 0.1)).toBe(false);
    expect(s.consumeBuffered('lightAttack', 0.25)).toBe(true);
    expect(s.consumeBuffered('lightAttack', 0.25)).toBe(false);
  });

  it('consume() also empties the buffer, and consumeBuffered hides this frame press', () => {
    const s = make();
    s.press('Space');
    s.beginFrame(DT);
    s.consume('dodge');
    expect(s.consumeBuffered('dodge', 1)).toBe(false);
    s.endFrame();

    s.press('KeyK');
    s.beginFrame(DT);
    expect(s.consumeBuffered('heavyAttack', 0.2)).toBe(true);
    expect(s.wasPressed('heavyAttack')).toBe(false);
  });

  it('releaseAll emits release edges and clears held state', () => {
    const s = make();
    s.press('KeyW');
    s.press('ShiftLeft');
    s.beginFrame(DT);
    s.endFrame();
    s.releaseAll();
    s.beginFrame(DT);
    expect(s.wasReleased('moveForward')).toBe(true);
    expect(s.wasReleased('sprint')).toBe(true);
    expect(s.isDown('sprint')).toBe(false);
  });

  it('tap() produces a press without holding the action', () => {
    const s = make();
    s.tap('pause');
    s.beginFrame(DT);
    expect(s.wasPressed('pause')).toBe(true);
    expect(s.isDown('pause')).toBe(false);
    expect(s.wasPressed('cancel')).toBe(false);
  });

  it('rejects unknown actions loudly', () => {
    const s = make();
    expect(() => s.isDown('nope' as InputAction)).toThrow(/unknown action/);
  });
});

describe('bindings', () => {
  it('match the documented defaults', () => {
    expect(BINDINGS.lightAttack).toEqual(['KeyJ', 'Mouse0']);
    expect(BINDINGS.heavyAttack).toEqual(['KeyK', 'Mouse2']);
    expect(BINDINGS.confirm).toEqual(['Enter', 'Space', 'KeyE']);
    expect(BINDINGS.cancel).toEqual(['Escape', 'Backspace']);
  });

  it('labels sources for prompts', () => {
    const labels = (Object.keys(BINDINGS) as InputAction[]).map((a) => [a, sourceLabel(BINDINGS[a][0])]);
    expect(Object.fromEntries(labels)).toMatchObject({
      lightAttack: 'J',
      heavyAttack: 'K',
      guard: 'L',
      dodge: 'SPACE',
      sprint: 'SHIFT',
      pause: 'ESC',
      cycleTarget: 'TAB',
      choice1: '1',
      debug: 'F3',
      confirm: 'ENTER',
    });
    expect(sourceLabel('Mouse0')).toBe('LMB');
    expect(sourceLabel('Mouse2')).toBe('RMB');
    expect(sourceLabel('ArrowUp')).toBe('↑');
  });
});
