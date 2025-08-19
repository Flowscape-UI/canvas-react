# @flowscape-ui/canvas-react — Vision / Архитектура и стек

Документ описывает стек технологий, архитектуру, модель данных/состояния, стратегию истории и сохранения изменений, а также принципы производительности.

## Стек технологий

- React 18+ (функциональные компоненты, Context, hooks)
- TypeScript 5+
- Bun (пакетный менеджер и рантайм для скриптов)
- Rollup 4+ (бандл ESM, генерация .d.ts)
  - @rollup/plugin-node-resolve, @rollup/plugin-commonjs
  - @rollup/plugin-typescript (или typescript + rollup-plugin-dts)
  - @rollup/plugin-replace (NODE_ENV)
  - rollup-plugin-terser (production minification)
  - rollup-plugin-esbuild (dev: быстрые TS/JS трансформации)
  - rollup-plugin-serve (dev server)
  - rollup-plugin-livereload (live reload)
  - альтернатива: rollup-plugin-dev (объединяет serve + livereload)
  - rollup-plugin-visualizer (анализ размера бандла)
- Dev-инфраструктура
  - ESLint (@typescript-eslint) + Prettier
  - Vitest + React Testing Library (unit/integration)
  - Playwright (e2e демо-примеры)
  - Storybook 8 с builder Vite (`@storybook/react-vite`) — витрина и визуальные тесты
  - Changesets (семантические релизы) + GitHub Actions (CI/CD, `oven-sh/setup-bun`)

## Цели архитектуры

- Чёткое разделение слоёв: ядро состояния, рендер React, плагины.
- Контролируемый/неконтролируемый режимы использования (как у React-контролируемых компонентов).
- Производительность: минимальные перерендеры, виртуализация, spatial index, rAF-циклы.
- История (Undo/Redo) через командную модель и патчи, с возможностью сериализации.

## Структура пакета

- src/
  - core/ — ядро: координаты, камера, операции, история, события
  - state/ — стор, экшены, селекторы, типы патчей и команд
  - react/ — компоненты, контексты, хуки
  - plugins/ — rulers, helper-lines, clipboard, backgrounds
  - render/ — слои отрисовки, overlay-хендлеры, стили
  - theme/ — токены, CSS-переменные, адаптеры (MUI, AntD, shadcn)
  - types/ — публичные типы (Node, CanvasState, Command, Patch и т.д.)
  - utils/ — математика, quadtree (или RBush), hit-testing, memo
  - index.ts — публичный API

## Модель координат и слои

- Координатные системы:
  - world — координаты объектов (независимы от зума/скролла)
  - screen — пиксели экрана (зависимы от зума/скролла)
- Камера: `{ zoom: number; offset: { x, y } }`, преобразования `world <-> screen`.
- Слои:
  - Base (фон/паттерны)
  - Content (узлы, направляющие, rulers)
  - Overlay (хендлеры, курсоры, рамка выделения) — с нормализацией размера под zoom

## Модель данных

- Node: `{ id: string; parentId?: string; label?: string; data?: any; position: { x: number; y: number }; dimensions?: { w: number; h: number }; selected?: boolean; rotation?: number; borderRadius?: number }`
- Группы — дерево через `parentId`.
- Канвас: `{ camera, nodesIndex, selection, history, settings }`
  - settings: `{ theme?: ThemeId | ThemeSpec; background?: BackgroundSpec; appearance?: AppearanceSpec }`
  - ThemeSpec: набор токенов/переменных (CSS variables) и overrides под проект.
  - BackgroundSpec: `{ type: 'grid'|'dots'|'image'|'gradient'|'solid'|'custom', options?: {...} }`.
  - AppearanceSpec: глобальные параметры внешнего вида (бордер-радиусы, тени, цвета выделения, толщина границ и т.п.).
- Индекс для hit-testing и видимости: quadtree/RBush (bbox-интервалы).

## Состояние и стор

- Внутренний стор ядра (легковесный), без внешних зависимостей.
  - Реализация через подписки/сигналы + селекторы, аналогична Zustand, но встроенная.
  - Публичный API предоставляет хуки-обёртки: `useCanvas()`, `useNodes(selector)`, `useCamera()`, `useSelection()`, `useHistory()`.
- Режимы:
  - Uncontrolled: библиотека хранит состояние, эмитит события (onChange, onSelectionChange, onHistoryChange).
  - Controlled: пользователь передает `nodes`, `camera`, подписывается на `onChange` и сам обновляет пропсы (one-way data flow).

## История (Undo/Redo) и команды

- Командная модель: каждая пользовательская операция — `Command` с `do()` и `undo()`.
  - Примеры: `AddNode`, `UpdateNode`, `MoveNodes`, `ResizeNode`, `GroupNodes`, `PasteNodes`, `ToggleRuler`, ...
- Хранение истории:
  - Стек команд (undoStack/redoStack) + ограничение размера (конфигurable, напр. 100–500 шагов).
  - Для производительности — патчи (Immer-подобные диффы): храним `forwardPatch` и `inversePatch`.
  - Coalescing: объединение мелких перемещений в один шаг (throttle/flush по mouseup).
- API:
  - `history.undo()`, `history.redo()`, `history.clear()`, `history.limit(n)`
  - Транзакции: `history.begin() / history.commit() / history.rollback()` для составных операций.

## Сохранение и сериализация

- Сериализация `CanvasDocument`:
  - `{ version, nodes, camera, settings, guides, meta }` -> JSON
  - `exportJSON(doc)`, `importJSON(json)`, `hydrate()`/`dehydrate()`
- Адаптеры сохранения:
  - `LocalStorageAdapter` (пример), `IndexedDBAdapter` (для больших данных), `CustomAdapter` интерфейс.
  - Автосейв с debounce и версионированием (`doc.version++`).
  - Внешний вид:
    - `settings.theme`: сохраняется как `{ id, overrides? }` (id — строковый идентификатор или URI профиля темы).
    - `settings.background`: сериализуемые поля `type` и `options` (например, `{ type: 'grid', options: { size: 16, color: '#eee' } }`).

## Взаимодействия и события

- Единый диспетчер ввода (Pointer Events + Wheel + Keyboard).
- Жесты:
  - Pan: MMB/PKM/gesture; Zoom: Ctrl+Wheel, pinch
  - Select/Marquee, DnD, Alt-duplicate, Ctrl+D, Ctrl+C/V/X, Ctrl+H
- Событийная шина (EventBus): `onNodeAdded`, `onNodesMoved`, `onSelectionChanged`, `onZoom`, ...
- Автопрокрутка у краёв: edge-detection + rAF-панорамирование камеры.

## Плагины и расширяемость

- Контракт плагина:
  - lifecycle: `onInit`, `onDestroy`, `onEvent`, `contributeActions`, `contributeUI` (portals в Overlay)
- Базовые плагины:
  - Rulers (Ctrl+H), Helper Lines, Clipboard (изображение/текст -> Node), Backgrounds, Snap/Grid

## Темы, фон и кастомизация

- Подход к стилям: дизайн-токены + CSS-переменные (root: `:root`/контейнер Canvas).
- ThemeProvider и адаптеры тем для сторонних DS:
  - `ThemeAdapterMui(muiTheme)` — маппинг palette/shape -> CSS vars.
  - `ThemeAdapterAntd(antdTheme)` — маппинг tokens -> CSS vars.
  - `ThemeAdapterShadcn({ tokens|twVars })` — совместимость с Tailwind/shadcn (data-атрибуты и CSS vars).
- Кастомизация Canvas:
  - Пропсы: `theme`, `themeAdapter`, `background`, `className`, `style`, `components`, `slots`.
  - Фон (`background`): `grid | dots | image | gradient | solid | custom` с настройками (цвет, размер шага, толщина линий, изображение/fit, градиент и т.д.).
  - Компонентные слоты (header/footer/body) у `NodeView`; рендер-пропы для полного контроля.
  - Регистрация типов нод: `{ type: string, renderer: React.FC<NodeRenderProps> }`.
- Интеграции с популярными DS:
  - Material UI: использование существующего `MuiThemeProvider` + `ThemeAdapterMui` для прокидывания palette/shape; поддержка `className`/`sx` через обёртки.
  - AntDesign: передача токенов из `theme` в адаптер, поддержка компакт/темных тем.
  - shadcn (Tailwind): поддержка `className`, `data-[state]` атрибутов (`data-selected`, `data-hovered`, `data-resizing`) для вариаций Tailwind; плагин с CSS vars.
- Сериализация внешнего вида: в `settings` сохраняем `theme.id` и `overrides`, `background` (без функций/рендеров, только данные).
- Перформанс-трюки: смена темы меняет CSS vars на контейнере, минимизируя перерендеры React; фон-«grid/dots» рисуется легковесно (Canvas/SVG) с кэшированием.

## Рендер и производительность

- Рендер узлов как HTML-элементов в React с абсолютным позиционированием.
- Виртуализация видимости (viewport c padding) — рендерим только видимые узлы.
- Spatial index для hit-testing и быстрого выделения рамкой.
- Мемоизация компонент узлов (`React.memo` + селекторы по id).
- Обновления камеры/drag — через rAF, без лишних setState.
- Overlay-хендлеры компенсируют zoom (обратный scale), размер постоянный в screen px.

## Безопасность и устойчивость

- Санитизация текста из буфера обмена.
- Ограничения на размеры изображений и типы.
- Защита от утери работы: автосейв + резервное копирование в IndexedDB (best-effort).

## Публичный API (черновик)

- Компоненты: `Canvas`, `NodeView`
- Хуки: `useCanvas`, `useNodes`, `useCamera`, `useSelection`, `useHistory`
- Действия: `addNode`, `updateNode`, `removeNode`, `groupNodes`, `copy`, `paste`, `cut`, `duplicate`, `undo`, `redo`
- Сериализация: `exportJSON`, `importJSON`, `usePersistence(adapter)`
- Темизация и внешний вид:
  - `ThemeProvider`, `useTheme`
  - `ThemeAdapter` тип и готовые адаптеры: `ThemeAdapterMui`, `ThemeAdapterAntd`, `ThemeAdapterShadcn`
  - Пропсы `Canvas`:
    - `theme?: ThemeId | ThemeSpec`
    - `themeAdapter?: ThemeAdapter`
    - `background?: BackgroundSpec`
    - `className?: string`, `style?: React.CSSProperties`
    - `components?: Partial<ComponentsRegistry>` (например, `Node`, `Selection`, `Handles`)
    - `slots?: Partial<Slots>` (header/footer/body для нод)

## Пример использования

```tsx
import { Canvas, ThemeProvider, ThemeAdapterMui } from '@flowscape-ui/canvas-react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';

const muiTheme = createTheme();

export function Editor() {
  return (
    <MuiThemeProvider theme={muiTheme}>
      <ThemeProvider adapter={ThemeAdapterMui(muiTheme)}>
        <Canvas
          className="h-full"
          background={{
            type: 'grid',
            options: { size: 16, color: 'var(--rcv-grid)' },
          }}
          initialNodes={[{ id: '1', position: { x: 0, y: 0 }, label: 'Hello' }]}
          onChange={(doc) => console.log('changed', doc)}
          history={{ limit: 200 }}
          plugins={['rulers', 'helperLines', 'clipboard']}
          components={
            {
              /* Node: CustomNode, Selection: CustomSelection, ... */
            }
          }
        />
      </ThemeProvider>
    </MuiThemeProvider>
  );
}
```

## Rollup: сборка

- Выходы: ESM + типы (.d.ts), sourcemap
- Treeshake, external для peerDeps (react, react-dom)
- Минификация только для prod
- Пример конфигурации (в репозитории): `rollup.config.ts` + `tsconfig.json`
- Dev-настройки:
  - Watch: `rollup -c -w`
  - Плагины: `rollup-plugin-serve`, `rollup-plugin-livereload`, `rollup-plugin-esbuild`
  - Альтернатива: `rollup-plugin-dev` (serve + livereload в одном)
  - Рекомендация: для демо/песочницы использовать Storybook dev server или Vite-пример, а Rollup оставить для сборки пакета

## Скрипты (package.json, Bun)

- Рекомендуемые поля:
  - `"packageManager": "bun@1.1.9"`
  - `engines`: `{ "node": ">=18", "bun": ">=1.1.0" }`
  - `publishConfig`: `{ "access": "public" }`

```json
{
  "packageManager": "bun@1.1.9",
  "scripts": {
    "dev": "bun run storybook",
    "dev:rollup": "rollup -c -w",
    "build": "rollup -c",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --check .",
    "format:fix": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "storybook": "storybook dev -p 6006",
    "storybook:build": "storybook build",
    "changeset": "changeset",
    "release": "changeset version",
    "publish:ci": "bun install --frozen-lockfile && bun run build && changeset publish",
    "prepack": "bun run build"
  }
}
```

- Пояснения:
  - Для локальной разработки основной вход — `storybook` (горячая перезагрузка, примеры компонентов).
  - `dev:rollup` — наблюдение за бандлом библиотеки (если требуется отдельный дев‑сервер).
  - `publish:ci` используется в релизном workflow (см. ниже) и публикует в npm через Changesets.

## CI/CD (GitHub Actions + Changesets)

- Секреты:
  - `NPM_TOKEN` — токен публикации в npm (доступ `publish`), добавляется в Secrets репозитория/организации.

### .github/workflows/ci.yml

```yaml
name: CI
on:
  push:
    branches: ['**']
  pull_request:
    branches: ['**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.9
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run test
      - run: bun run build
      - run: bun run storybook:build
```

### .github/workflows/release.yml

```yaml
name: Release
on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write # для тэгов и релиз‑PR от Changesets
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: bun install --frozen-lockfile
      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          # При наличии непубликованных changeset-ов создаст/обновит релиз‑PR (version bump + changelog).
          # Когда PR смёржен в main, выполнит `publish`:
          publish: bun run publish:ci
          title: 'chore: release'
          commit: 'chore: release'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- Версионирование:
  - Используется Changesets. Разработчики добавляют файлы в `.changeset/` командой `bunx changeset`.
  - `release` workflow создаёт PR с версионированием и changelog; после мержа публикует в npm.
  - Для монорепо/нескольких пакетов Changesets масштабируется без изменений.

### Публикация Storybook на GitHub Pages

- Подход: отдельный workflow, который билдит Storybook и выкатывает на GitHub Pages (официальные экшены Pages).
- Требуется включить Pages: Settings → Pages → Build and deployment → Source: GitHub Actions.
- Результирующий URL: `https://<org-or-user>.github.io/<repo>/` (или кастомный CNAME).

#### .github/workflows/pages.yml

```yaml
name: Storybook Pages
on:
  push:
    branches:
      - main

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.9
      - run: bun install --frozen-lockfile
      - run: bun run storybook:build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: storybook-static

  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- Рекомендации по ссылкам:
  - В `README.md` добавить ссылку/бейдж на Pages Storybook.
  - В разделе About репозитория указать Website: URL Pages.
  - При желании — добавить ссылку в описание npm-пакета (поле `homepage`).

Пример бейджа для README:

```md
[![Storybook](https://img.shields.io/badge/Storybook-Live-FF4785?logo=storybook&logoColor=white)](https://<org-or-user>.github.io/<repo>/)
```

## Безопасность и секреты

- .gitignore (обязательно):
  - `.env`, `.env.local`, `.env.*.local`, `.npmrc`
  - `node_modules/`, `dist/`, `storybook-static/`, `coverage/`
  - артефакты тестов/репортов: `playwright-report/`, `test-results/`
  - прочее: `.DS_Store`, `*.log`
- .env-policy:
  - Коммитим только пример `.env.example` с пустыми плейсхолдерами.
  - В библиотеке .env не обязателен; переменные окружения нужны только для демо/стендов.
- GitHub Actions и секреты:
  - Используем только `secrets` (напр., `NPM_TOKEN`). Не логируем значения, не печатаем команды с токенами.
  - Минимальные `permissions` для jobs (указаны в workflows выше).
  - Публикация в npm: включить проверяемое происхождение (provenance) — задайте `NPM_CONFIG_PROVENANCE: true` в `release` job.
  - Пример (фрагмент `release.yml`):
    ```yaml
    env:
      NPM_CONFIG_PROVENANCE: true
    ```
- Состав пакета (npm):
  - Используем поле `files` в `package.json` для whitelisting (например, `dist`, `src/types` при необходимости).
  - Исключаем Storybook, тесты, конфиги CI из пакета.
  - Перед публикацией проверять содержимое: `npm pack --dry-run` (локально или в CI как чек).
- Скрипты (дополнительно, рекомендации):
  - `clean`: удалить `dist`, `storybook-static`, `coverage` (например, `rimraf dist storybook-static coverage`).
  - `coverage`: `vitest run --coverage`.
  - `analyze`: сборка с `rollup-plugin-visualizer` (включать по флагу окружения, напр. `ANALYZE=1`).
- Автоматические проверки безопасности:
  - Secret scanning: включить GitHub Advanced Security (если доступно) или добавить Gitleaks.
    Пример workflow `gitleaks.yml`:
    ```yaml
    name: Gitleaks
    on: [push, pull_request]
    jobs:
      scan:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: gitleaks/gitleaks-action@v2
            with:
              args: 'detect --no-banner --redact --verbose'
    ```
  - CodeQL (SAST) для JS/TS — базовая настройка:
    ```yaml
    name: CodeQL
    on:
      push:
        branches: ['main']
      pull_request:
        branches: ['main']
      schedule:
        - cron: '0 3 * * 0'
    jobs:
      analyze:
        permissions:
          contents: read
          security-events: write
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: github/codeql-action/init@v3
            with:
              languages: javascript-typescript
          - uses: github/codeql-action/analyze@v3
    ```
  - Dependabot для обновлений зависимостей и GitHub Actions.
    Пример `.github/dependabot.yml`:
    ```yaml
    version: 2
    updates:
      - package-ecosystem: 'npm'
        directory: '/'
        schedule:
          interval: 'weekly'
      - package-ecosystem: 'github-actions'
        directory: '/'
        schedule:
          interval: 'weekly'
    ```
- Политика веток:
  - Защитить `main`: требовать успешный CI, запрет прямых пушей, squash/merge через PR.
  - Включить required reviews/статусы (CI, CodeQL, Gitleaks — при использовании).

## Тестирование и качество

- Unit: Vitest (core, utils, reducers)
- React: React Testing Library (интеракции)
- E2E: Playwright (демо-примеры на Storybook)
- Линт/формат: ESLint + Prettier, pre-commit hooks (lint-staged + simple-git-hooks)
- Size-limit и bundle analyzer на CI

## Roadmap MVP → Beta

1. Core: камера, координаты, стор, события
2. Узлы: CRUD, drag, select, рамка, группировка
3. История: команды, undo/redo, coalescing
4. Плагины: rulers, helper-lines, clipboard
5. Вставка изображений/текста, автопрокрутка у краёв
6. Виджет zoom/x/y, фоны
7. Сериализация + LocalStorageAdapter
8. Виртуализация и spatial index
9. Документация и Storybook, примеры
10. CI/CD, релиз npm
