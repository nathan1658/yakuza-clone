# 古惑仔：銅鑼灣之龍 — Architecture

A 3D action RPG set in 1990s Causeway Bay (銅鑼灣). Yakuza-style: free roam through dense neon streets, seamless street brawls, and heat actions.

Stack: **Vite 8 · TypeScript 7 (strict) · Three.js 0.186 · Rapier 3D 0.21 (compat) · Web Audio (fully procedural, no asset files)**.

The single source of truth for every cross-module API is **`src/core/types.ts`**. Read it fully before writing code.

---

## 1. Module map and ownership

| Dir | Owner | Entry class (constructor) | Implements |
|---|---|---|---|
| `src/core/` | Core | `GameEngine(container, input, physics)`, `InputManager(container)`, `PhysicsWorld.create()` (async static), `CameraRig(ctx)`, `SaveSystem(ctx)` | IEngine, IInputManager, IPhysicsWorld, ICameraRig+GameSystem, ISaveSystem+GameSystem |
| `src/core/types.ts`, `math.ts`, `EventBus.ts`, `InteractionRegistry.ts`, `GameInstance.ts`, `src/state/`, `src/main.ts` | Lead (integration) | – | – |
| `src/entities/` | Entities | `EntityManager(ctx)` | IEntityManager+GameSystem |
| `src/world/` | World & Graphics | `World(ctx)`; `world/rendering/PostProcessing` | IWorld+GameSystem, IRenderPipeline |
| `src/combat/` | Combat | `CombatSystem(ctx)` | ICombatSystem+GameSystem |
| `src/narrative/` | Narrative | `Narrative(ctx)` | INarrative+GameSystem |
| `src/ui/` | UI | `UIManager(ctx, uiRoot)` | IUIManager+GameSystem |
| `src/inventory/` | UI | `Inventory(ctx)` | IInventory+GameSystem |
| `src/assets/audio/` | Audio | `AudioSystem(ctx)` | IAudioSystem+GameSystem |

Each module may create any number of internal files inside its own directory.

## 2. Hard rules

1. **Talk through `ctx` interfaces and the EventBus only.** Never import a concrete class from another module's directory. Importing *types* and the runtime helpers exported by `src/core/types.ts` (`CG`, `interactionGroups`, `FIXED_DT`, `ZONE_NAMES`) and by `src/core/math.ts` (`clamp`, `lerp`, `ease`, `damp`, `wrapAngle`, `lerpAngle`, `yawTo`, `turnTowards`, `TAU`) is fine. `GameInstance.ts` is the only exception.
2. **Constructors only store `ctx`.** All wiring happens in `init()`. In `init()` you may use only the systems earlier in the init order:
   `save → audio → ui → cameraRig → world → entities → interactions → inventory → combat → narrative`.
   Touch anything later lazily: in the first `update()` or in an event handler.
3. **Update order** (lateUpdate runs in the same order):
   `narrative → entities → interactions → combat → world → cameraRig → audio → ui → save`.
   The camera moves in `lateUpdate`. Audio listener placement and UI screen-space projection also go in `lateUpdate`.
4. **New events use module augmentation.** Declare them from your own directory instead of editing `types.ts`:
   ```ts
   declare module '../core/types' { interface GameEvents { 'combat:whatever': { n: number } } }
   ```
5. **`verbatimModuleSyntax` is on.** Use `import type` for type-only imports.
   - Three.js addons come from `three/addons/...`.
   - Rapier: `import RAPIER from '@dimforge/rapier3d-compat'`.
6. **`strict`, `noUnusedLocals` and `noUnusedParameters` are on.** Prefix intentionally unused parameters with `_`.
7. **Gameplay uses `time.dt`** (scaled, so bullet time works). UI tweens, camera easing and audio use `time.realDt`.
8. **No asset files.** All meshes, textures (canvas), shaders and audio are procedural. The only external resource is the Google Fonts CSS in `index.html` (Noto Sans TC / Noto Serif TC).
9. **Performance budget:** 60 fps at 1080p on an M1-class laptop.
   - Target fewer than 600 draw calls. Merge static geometry by material and instance repeated props.
   - Allow at most about 12 dynamic shadow casters near the player.
   - Don't allocate in hot loops. Reuse scratch `Vector3`s.
10. **All player-facing text is Traditional Chinese, written as colloquial Cantonese (廣東話口語).** Use English only for small glosses and subtitles, and only where the interface allows (`gloss`, `nameEn`).
11. **Tests:** pure logic gets vitest tests next to the code (`*.test.ts`, node environment, no DOM or WebGL).
12. **Debug:** in dev, `window.__game` is the `GameContext`. URL flags:
    - `?debug`
    - `?skipIntro` skips the title and intro cutscene.
    - `?chapter=N` starts at chapter N.
    - `?god` makes the player take no damage.

## 3. Game state machine (`src/state/GameStateMachine.ts`)

```
boot ──► title ──► cutscene ◄──► dialogue ◄──► freeRoam ◄──► combat ◄──► heatAction
                      │             │  ▲          │  ▲         │  ▲
                      ▼             ▼  │          ▼  │         ▼  │
                   credits         shop ────────► menu ◄───────┘  gameOver
```

| from | legal `to` |
|---|---|
| boot | title, freeRoam, cutscene |
| title | cutscene, freeRoam, dialogue |
| freeRoam | dialogue, combat, cutscene, menu, shop |
| dialogue | freeRoam, combat, cutscene, shop, dialogue |
| cutscene | freeRoam, combat, dialogue, credits, cutscene |
| combat | heatAction, freeRoam, gameOver, cutscene, dialogue, menu |
| heatAction | combat, freeRoam, cutscene, gameOver |
| menu | freeRoam, combat, title |
| shop | freeRoam, dialogue |
| gameOver | title, freeRoam, cutscene |
| credits | title, freeRoam |

- `engine.paused = true` in `menu` and `shop`. That is the whole difference between those two modes and the rest.
- Any transition **into `title`** (except the first one from boot) triggers `location.reload()`, so returning to the title is a clean restart.
- Modes are **not** adventure/battle subclasses. Every system updates every frame and asks `ctx.state.is(...)` for what it needs. Examples:
  - Enemy brains tick only in `combat`.
  - PlayerController reads input only in `freeRoam` and `combat`.
  - The camera switches mode on `state:changed`.

## 4. App flow (GameInstance)

```
boot:      create ctx → init systems (loading screen) → engine.start()
title:     ui.showTitleScreen() → audio.unlock()
           new      → save.resetAll() → narrative.startNewGame()
           continue → save.load()     → narrative.continueGame()
death:     combat emits 'player:died' → state 'gameOver' → ui.showGameOver()
           retry    → save.load() → narrative.continueGame()   (autosave precedes story fights)
           title    → state 'title' → reload
```

## 5. World layout (metres, north = −Z, east = +X)

```
                 z=-175 ~~~~~~~~~~~~ HARBOUR (water, sampans, floating restaurant) ~~~~~~~~~~
                 z=-150 ══════ 避風塘 Typhoon Shelter promenade  x ∈ [-150, 60] ══════════
                                   │ path / footbridge
          x=-72..-56               │
          波斯富街 Percy Street     │   (dai pai dong alleys branch east/west)
          z ∈ [-130, 0]            │
 z=0  ═════════════════════════ 軒尼詩道 Hennessy Road (tram rails z≈12) ════════════════════
 z=24 ══════════════════════════════════════════════════════╦══ 崇光 Sogo crossing x∈[50,110]
                                                              ║  Sogo building x∈[60,140], z∈[24,80]
                                                              ║  plaza / boss arena x∈[60,110], z∈[24,44]
```

## 6. Story (Traditional Chinese, Cantonese)

**Cast**
- 陳浩南 (player)
- 山雞 (sworn brother, comic relief)
- 蝦叔 (old fisherman informant at the typhoon shelter)
- 咖喱魚蛋 auntie (vendor)
- 大佬B (only mentioned)
- 烏鴉 (東星's wild enforcer, the boss)

**Chapters**
1. **第一章「波斯富街」**
   - 浩南 meets 山雞 on Percy St.
   - 東星 thugs shake down the curry fishball auntie.
   - Tutorial brawl in the alley: basic combo, pick up a folding chair, first heat action.
   - 山雞 says 烏鴉 is moving into Causeway Bay and tells 浩南 to find 蝦叔 at the typhoon shelter.
2. **第二章「避風塘」**
   - 浩南 walks to the promenade and is ambushed by 東星 goons led by a lieutenant.
   - 蝦叔 reveals that 烏鴉 plans to ambush 大佬B at Sogo tonight.
3. **第三章「崇光對決」**
   - At the Sogo crossing: a goon wave, then the showdown with 烏鴉 in the plaza.
   - The boss fight has three phases: table flip hazards, hyper armor, and a QTE finisher.
   - Ending cutscene, then credits, then post-game free roam.

**Substories**
- 「魚蛋佬嘅債」: debt collectors harassing a hawker, resolved with a fight.
- 「失落嘅BB機」: find a lost pager and return it for a reward.

**Anywhere in 東星 territory:** random street encounters, with a cooldown.
