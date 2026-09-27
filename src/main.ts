import { GameInstance } from './core/GameInstance';

const gameRoot = document.getElementById('game-root')!;
const uiRoot = document.getElementById('ui-root')!;

new GameInstance(gameRoot, uiRoot).boot().catch((err: unknown) => {
  console.error(err);
  uiRoot.innerHTML = `<div style="position:fixed;inset:0;display:grid;place-items:center;
    background:#000;color:#f55;font:16px 'Noto Sans TC',sans-serif;pointer-events:auto;padding:24px;text-align:center">
    <div><h2>啟動失敗 · Failed to start</h2><pre style="white-space:pre-wrap;color:#ccc">${
      String((err as Error)?.stack ?? err).replace(/</g, '&lt;')
    }</pre></div></div>`;
});
