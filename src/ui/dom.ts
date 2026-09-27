import type { IInputManager, InputAction } from '../core/types';

/** Create an element, optionally with classes, a parent and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', parent?: HTMLElement, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** Toggle a class only when it actually changes (no needless style invalidation). */
export function toggle(node: Element, cls: string, on: boolean): void {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}

export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Screen-space placement of a world-anchored element (centre-bottom on the point). */
export function place(node: HTMLElement, x: number, y: number): void {
  node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
}

/** wasPressed + consume in one step: "I handled this press". */
export function take(input: IInputManager, action: InputAction): boolean {
  if (!input.wasPressed(action)) return false;
  input.consume(action);
  return true;
}

/** Restart a one-shot WAAPI animation on `node`, cancelling the previous one. */
export function play(
  node: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions,
): Animation {
  for (const a of node.getAnimations()) a.cancel();
  return node.animate(keyframes, options);
}
