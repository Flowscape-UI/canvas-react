# @flowscape-ui/canvas-react — Tasklist / Дорожная карта

Документ описывает подробный, масштабируемый план разработки библиотеки, процесс релизов и автодеплоя, безопасность, контроль качества и будущие итерации (MVP→Beta→…∞).

Связанные документы:

- Идея и функционал: `doc/idea.md`
- Видение, архитектура и стек: `doc/vision.md`

## Версионирование и выпуск релизов

- Семантическое версионирование (SemVer): MAJOR.MINOR.PATCH
  - До стабильной API — мажорная версия 0: `0.x.y`.
  - Первый релиз MVP: `v0.1.0`.
  - Каждое инкрементальное MVP: `v0.(x+1).0`.
  - Патчи: `v0.x.(y+1)` для исправлений без изменений API.
- Инструменты: Changesets + GitHub Actions Release workflow
  - Разработчики создают changeset: `bunx changeset` (тип изменения и описание).
  - Action `changesets/action@v1` открывает/обновляет Release PR с авто-бампом версии и changelog.
  - После мержа PR в `main` автоматически публикуется в npm и ставится git-tag.
- Бранчи и защита:
  - `main` — защищённая ветка (только через PR, обязательные статусы: CI, Pages (optional), CodeQL/Gitleaks (если включены)).
  - Фича-ветки: `feat/*`, `fix/*`, `chore/*`.
- Превью/пререлизы (опционально): теги `next` с `changeset pre enter next` — по согласованию.

## MVP-планирование (масштабируемая модель)

- Модель итераций: сериями MVP с чёткими границами.
- Базовый набор:
  - MVP-0.1 (Core Canvas): навигация, зум, базовые узлы, выбор/перетаскивание, история, Storybook, Pages, CI/CD, безопасность.
  - MVP-0.2 (Usability): рамочное выделение, группировка, copy/paste, helper lines, rulers, начальная сериализация.
  - Beta-0.3 (Performance & Extensibility): виртуализация, spatial index, плагины, темизация и фон, адаптеры тем, стабильный API.
- Шаблон будущих MVP-N: см. раздел «Шаблон MVP-N» в конце.

## Процессы CI/CD и автодеплой

- CI (`.github/workflows/ci.yml`):
  - `setup-bun`, `bun install --frozen-lockfile`, `typecheck`, `lint`, `test`, `build`, `storybook:build`.
- Release (`.github/workflows/release.yml`):
  - На `push` в `main`: Changesets Action создаёт/обновляет Release PR. После мержа — `publish` в npm.
  - Секреты: `NPM_TOKEN`; включить `NPM_CONFIG_PROVENANCE: true`.
- Pages (`.github/workflows/pages.yml`):
  - На `push` в `main`: сборка Storybook → публикация в GitHub Pages.
  - Включить Pages: Settings → Pages → Source: GitHub Actions.
- Security workflows (рекомендуется): CodeQL, Gitleaks, Dependabot (см. `doc/vision.md`).

## Безопасность и секреты (кратко)

- Никогда не коммитим `.env`/`.npmrc`. В репозитории держим только `.env.example`.
- `.gitignore` должен исключать: `.env*`, `node_modules/`, `dist/`, `storybook-static/`, `coverage/`, отчёты Playwright.
- В Actions используем только `secrets`. Токены не логируем. Права минимальные.
- Контент npm-пакета ограничен `package.json#files`. Проверка `npm pack --dry-run` в CI.

---

## Глобальная таблица задач (MVP-0.1 → Beta-0.3)

Статусы: pending | in_progress | blocked | done

### Project

| ID   | Задача            | Описание                                                                      | Старт      | Дедлайн    | Статус | Ссылки                                                                    |
| ---- | ----------------- | ----------------------------------------------------------------------------- | ---------- | ---------- | ------ | ------------------------------------------------------------------------- |
| P-01 | Scaffolding (Bun) | `package.json`, `tsconfig.json`, `rollup.config.ts`, базовая структура `src/` | 2025-08-18 | 2025-08-20 | done   | `doc/vision.md`                                                           |
| P-02 | Repo policies     | `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`                                | 2025-08-18 | 2025-08-22 | done   | `/.github/SECURITY.md`, `/.github/CONTRIBUTING.md`, `/.github/CODEOWNERS` |

### CI/CD

| ID    | Задача           | Описание                                                               | Старт      | Дедлайн    | Статус | Ссылки                                            |
| ----- | ---------------- | ---------------------------------------------------------------------- | ---------- | ---------- | ------ | ------------------------------------------------- |
| CI-01 | CI workflow      | `.github/workflows/ci.yml` (typecheck/lint/test/build/storybook:build) | 2025-08-19 | 2025-08-20 | done   | `doc/vision.md`, `/.github/workflows/ci.yml`      |
| CI-02 | Release workflow | `.github/workflows/release.yml` (Changesets + npm publish)             | 2025-08-20 | 2025-08-21 | done   | `doc/vision.md`, `/.github/workflows/release.yml` |
| CI-03 | Pages workflow   | `.github/workflows/pages.yml` (Storybook → Pages)                      | 2025-08-20 | 2025-08-21 | done   | `doc/vision.md`, `/.github/workflows/pages.yml`   |

### Security

| ID     | Задача                | Описание                                                     | Старт      | Дедлайн    | Статус  | Ссылки          |
| ------ | --------------------- | ------------------------------------------------------------ | ---------- | ---------- | ------- | --------------- |
| SEC-01 | .gitignore/.npmignore | Исключения для секретов/артефактов; `files` в `package.json` | 2025-08-19 | 2025-08-19 | done    | `doc/vision.md` |
| SEC-02 | CodeQL                | Настроить `CodeQL` workflow                                  | 2025-08-22 | 2025-08-22 | done    | `/.github/workflows/codeql.yml` |
| SEC-03 | Gitleaks              | Настроить `Gitleaks` workflow                                | 2025-08-22 | 2025-08-22 | done    | `/.github/workflows/gitleaks.yml` |
| SEC-04 | Dependabot            | `.github/dependabot.yml` (npm + actions)                     | 2025-08-22 | 2025-08-22 | done    | `/.github/dependabot.yml` |

### Core

| ID      | Задача            | Описание                                                | Старт      | Дедлайн    | Статус  |
| ------- | ----------------- | ------------------------------------------------------- | ---------- | ---------- | ------- |
| CORE-01 | Координаты/камера | Модель `world/screen`, `zoom`, `offset`, преобразования | 2025-08-19 | 2025-08-23 | pending |
| CORE-02 | Ввод/события      | Pointer/Wheel/Keyboard, жесты навигации                 | 2025-08-20 | 2025-08-24 | pending |
| CORE-03 | Store и селекторы | Лёгкий стор, подписки/селекторы, API-хуки               | 2025-08-20 | 2025-08-25 | pending |
| CORE-04 | Узлы (CRUD)       | Типы узлов, добавление/удаление/обновление              | 2025-08-21 | 2025-08-26 | pending |
| CORE-05 | Select & DnD      | Выбор/снятие, перетаскивание узлов                      | 2025-08-22 | 2025-08-27 | pending |
| CORE-06 | История           | Командная модель, undo/redo, coalescing                 | 2025-08-23 | 2025-08-28 | pending |

### UI & Docs

| ID     | Раздел | Задача          | Описание                                     | Старт      | Дедлайн    | Статус  |
| ------ | ------ | --------------- | -------------------------------------------- | ---------- | ---------- | ------- |
| UI-01  | UI     | Canvas/NodeView | Базовый рендер узлов, overlay-хендлеры       | 2025-08-22 | 2025-08-27 | pending |
| UI-02  | UI     | Background      | Лёгкий фон: grid/dots (один вариант для MVP) | 2025-08-24 | 2025-08-27 | pending |
| DOC-01 | Docs   | Storybook       | Конфиг 8.x (Vite), примеры, аддоны           | 2025-08-21 | 2025-08-26 | pending |

### QA

| ID    | Задача           | Описание                                | Старт      | Дедлайн    | Статус  |
| ----- | ---------------- | --------------------------------------- | ---------- | ---------- | ------- |
| QA-01 | Unit/Integration | Vitest + RTL: ядро/редьюсеры/компоненты | 2025-08-21 | 2025-08-28 | pending |
| QA-02 | E2E (минимум)    | Playwright: smoke (навигация/зум)       | 2025-08-26 | 2025-08-29 | pending |

### Release

| ID      | Задача          | Описание                                      | Старт                             | Дедлайн    | Статус     | Ссылки                                                      |
| ------- | --------------- | --------------------------------------------- | --------------------------------- | ---------- | ---------- | ----------------------------------------------------------- | ------- | --- |
| REL-01  | Changesets init | Инициализация Changesets, первый changeset    | 2025-08-21                        | 2025-08-21 | done       | `/.changeset/config.json`, `/.changeset/initial-release.md` |
| REL-02  | v0.1.0 (MVP)    | Срез функционала, релиз в npm, Pages доступен | 2025-08-29                        | 2025-08-30 | pending    |                                                             |
| POST-01 | Post            | Мониторинг                                    | Size-limit/Bundle analyzer, отчёт | -          | 2025-08-30 | 2025-09-01                                                  | pending |     |

> Примечание: даты ориентировочные, можно корректировать релиз-план по мере прогресса.

### Критерии готовности MVP-0.1 (Definition of Done)

- Функционал:
  - Навигация: pan/zoom (мышь/тачпад), диапазон зума 10–500%.
  - Узлы: создание/удаление/обновление; выбор, перетаскивание.
  - История: undo/redo, coalescing при drag.
  - Фон: один из вариантов (grid или dots).
- Качество:
  - Unit/Integration тесты с покрытием ключевых функций.
  - E2E smoke (навигация/зум).
- Инфраструктура:
  - CI зелёный на PR/`main`.
  - Pages Storybook доступен из README и About.
  - Release workflow публикует в npm с provenance.
- Безопасность:
  - `.gitignore`/`.npmignore` актуальны, `files` ограничивает пакет.
  - Secrets используются корректно, Gitleaks/CodeQL настроены (если включены в фазе).

---

## План MVP-0.2 (Usability)

| ID     | Этап          | Задача              | Описание                                    | Ответственный | Старт      | Дедлайн    | Статус  |
| ------ | ------------- | ------------------- | ------------------------------------------- | ------------- | ---------- | ---------- | ------- |
| SEL-01 | Select        | Маркировка рамкой   | Прямоугольное выделение области             | -             | 2025-09-01 | 2025-09-03 | pending |
| GRP-01 | Group         | Группировка         | Структура parentId + совместное перемещение | -             | 2025-09-01 | 2025-09-04 | pending |
| CLP-01 | Clipboard     | Copy/Paste/Cut      | Копирование/вырезка/вставка узлов           | -             | 2025-09-02 | 2025-09-05 | pending |
| RUL-01 | Rulers        | Rulers/Helper lines | Включение Ctrl+H, добавление/удаление линий | -             | 2025-09-03 | 2025-09-06 | pending |
| SER-01 | Serialization | JSON I/O            | `exportJSON`/`importJSON` (минимум)         | -             | 2025-09-04 | 2025-09-07 | pending |
| REL-03 | Release       | v0.2.0              | Публичный релиз                             | -             | 2025-09-07 | 2025-09-08 | pending |

Критерии: стабильно работает рамочное выделение/группы/буфер/линейки, JSON экспорт/импорт.

---

## План Beta-0.3 (Performance & Extensibility)

- Виртуализация видимости (viewport padding).
- Spatial index (quadtree/RBush) для быстрого hit-testing.
- Плагины (контракт, базовые: rulers/helper-lines/clipboard/backgrounds).
- Темизация/фон (ThemeProvider, BackgroundSpec), адаптеры MUI/AntD/shadcn.
- Полировка API и документации.

| ID       | Этап    | Задача        | Описание                              | Ответственный | Старт      | Дедлайн    | Статус  |
| -------- | ------- | ------------- | ------------------------------------- | ------------- | ---------- | ---------- | ------- |
| PERF-01  | Perf    | Виртуализация | Рендер только видимых узлов           | -             | 2025-09-09 | 2025-09-12 | pending |
| PERF-02  | Perf    | Spatial index | Quadtree/RBush интеграция             | -             | 2025-09-09 | 2025-09-13 | pending |
| EXT-01   | Ext     | Плагин-API    | Контракты плагинов и базовые плагины  | -             | 2025-09-10 | 2025-09-15 | pending |
| THEME-01 | Theme   | Темизация     | CSS vars + ThemeProvider, адаптер MUI | -             | 2025-09-11 | 2025-09-16 | pending |
| DOC-02   | Docs    | Документация  | Примеры/гайды/README бейджи           | -             | 2025-09-15 | 2025-09-17 | pending |
| REL-04   | Release | v0.3.0        | Публичный релиз                       | -             | 2025-09-17 | 2025-09-18 | pending |

---

## Процессы (подробно)

- Разработка:
  - Рабочие ветки с короткими PR. Conventional commits (рекомендация) для ясности истории.
  - Code review + авто-проверки (CI) обязательны перед merge.
- Тестирование:
  - Unit: Vitest. Integration: RTL. E2E: Playwright (trace/video в CI по падениям).
  - Порог покрытия — нарастить после MVP (>70% по core).
- Сборка и релиз:
  - Rollup 4, peerDeps: `react`, `react-dom`, `exports`/`files` корректно настроены.
  - Changesets управляет версиями и changelog; публикация через Release workflow.
- Деплой Storybook:
  - Автовыкладка в GitHub Pages при каждом `main` push. Ссылка в README и About.
- Безопасность:
  - Secrets только в GitHub Secrets. Нет утечек в логи. Gitleaks/CodeQL/Dependabot.

---

## Шаблон MVP-N (для масштабирования)

1. Scope: чёткий список задач/историй.
2. API Impact: изменения API и план миграции.
3. Acceptance criteria: тесты/демо/документация.
4. План работ: таблица задач (ID/описание/даты/статусы).
5. Риски и откаты: что делаем при регрессии/проблемах.
6. Релиз: Changesets, версия `v0.(n).0`, npm publish, Storybook обновлён.

---

## Обновление статусов

- Статусы задач обновляются по мере прогресса. Блокеры фиксируются явно в комментариях к задачам/PR.
- После закрытия этапа обновляется changelog (Changesets) и релизится версия по плану.
