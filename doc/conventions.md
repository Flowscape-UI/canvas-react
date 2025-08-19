# Conventions (Лучшие практики)

Единый свод правил для разработки `@flowscape-ui/canvas-react`. Соотносится с `doc/workflow.md`, дорожной картой `doc/tasklist.md` и контекстом `doc/vision.md`/`doc/idea.md`.

## 1) Введение

- Цель: единый стиль, предсказуемая архитектура, простая поддержка.
- Мотив: облегчить код-ревью, снижение регрессий, ускорение релизов.

## 2) Стиль кода

- **TypeScript**
  - `strict: true`; избегать `any`, предпочитать `unknown` и явные узкие типы.
  - Публичные API — всегда типизированы; генерировать d.ts.
  - `readonly` и иммутабельность там, где возможно.
  - Утилиты: `type Result<T,E>` для ошибок, `assertNever(x: never)` для исчерпывающих switch.
- **React**
  - Компоненты — функции. Не использовать `React.FC` (для children — явный тип).
  - Экспорт только именованный, без `default`.
  - Стабильные зависимости: `useMemo`/`useCallback` по необходимости; избегать «магических» deps.
- **Импорты**
  - Порядок: стандартная библиотека → внешние пакеты → алиасы проекта → относительные пути.
  - Избегать длинных `../../..`; использовать алиасы через `tsconfig`.
- **Форматирование**
  - Источник истины — Prettier. Конфликтующие правила ESLint отключать.

Пример типобезопасного switch:

```ts
export type Tool = 'pan' | 'select' | 'line';

export function describe(tool: Tool): string {
  switch (tool) {
    case 'pan':
      return 'Pan the canvas';
    case 'select':
      return 'Select nodes';
    case 'line':
      return 'Draw line';
    default:
      return assertNever(tool);
  }
}

export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${String(x)}`);
}
```

## 3) Архитектура и структура

- `src/`
  - `core/` — модель, типы, алгоритмы (без React).
  - `canvas/` — рендер и взаимодействие с Canvas/WebGL/DOM.
  - `components/` — React-компоненты.
  - `hooks/` — React-хуки (логика + композиция).
  - `utils/` — общие утилиты.
  - `types/` — публичные типы.
  - `index.ts` — единственная точка экспорта публичного API.
- Инкапсуляция: внутренние модули не экспортировать из `index.ts`.
- Public API минимален и стабильный; breaking changes только через major.

## 4) Именование

- Файлы: `kebab-case.ts`; компоненты — `PascalCase.tsx`.
- Типы/интерфейсы: `PascalCase`, без префикса `I`.
- Хуки: `useXxx`; обработчики: `handleXxx`; события: `onXxx`.

## 5) Компоненты и хуки

- Компоненты — «тонкие», без бизнес-логики; бизнес-логика — в хуках/`core/`.
- Пропы — явные, без скрытых побочных эффектов; разумные значения по умолчанию.
- Контекст использовать осознанно; избегать «глобального» контекста для всего.
- Стабильные коллбэки и значения в зависимостях эффектов.

## 6) Производительность

- Минимизировать ре-рендеры: мемоизация, корректные ключи списков.
- Батч-обновления: коалесинг событий drag, дебаунс/троттлинг интенсивных входов.
- Canvas: не перерисовывать всё полотно без необходимости; виртуализация viewport.
- Измерять: использовать профилирование React/браузера на критических путях.

## 7) Ошибки и инварианты

- Явные ошибки: бросаем `Error` с понятным сообщением; не «глотать» исключения.
- Защиты на границах API: валидация входов, инварианты, ассершены в dev-сборках.
- Логи — информативные, без утечки секретов.

## 8) Доступность (a11y)

- ARIA-атрибуты для интерактивных элементов.
- Фокус-менеджмент для клавиатурной навигации.
- Горячие клавиши документируем и делаем переопределяемыми.

## 9) Документация

- TSDoc на публичные типы/функции/компоненты.
- Storybook как «живые» примеры API и UX-сценариев.
- Обновлять README и changelog при релизах.

## 10) Тестирование

- Pyramid: больше unit, меньше e2e, но e2e покрывают критические user-flows.
- Unit (Vitest): чистые функции/утилиты, преобразования координат, математика зума.
- Integration: рендер компонент/хуков, обработка событий, взаимодействие с canvas-слоем.
- E2E (Playwright): smoke — пан/зум, выбор, буфер обмена, rulers/helper-lines.
- Детеминированность: без таймингов на удачу; использовать fake timers и стаблы.

Пример unit-теста (Vitest):

```ts
import { describe, it, expect } from 'vitest';
import { worldToScreen } from '../core/coords';

describe('coords', () => {
  it('converts world to screen with zoom and pan', () => {
    expect(worldToScreen({ x: 10, y: 20 }, { zoom: 2, pan: { x: 5, y: -5 } })).toEqual({
      x: 30,
      y: 30,
    });
  });
});
```

## 11) PR/CI процесс

- Небольшие атомарные PR, цель — ≤ 300–400 строк чистых изменений.
- Чек-лист PR:
  - Типы чистые, `tsc --noEmit` зелёный.
  - `bun run build` проходит, артефакты корректны.
  - Тесты добавлены/обновлены и проходят локально/в CI.
  - Обновлена документация/сторис при необходимости.
  - Изменения публичного API — добавлен Changeset.
- CI прогоняет: typecheck, build, тесты, `npm pack --dry-run`.

## 12) Коммиты и релизы

- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `build:`, `chore:`.
- Changesets:
  - Любое изменение публичного API — новый changeset.
  - semver: `major` для breaking, `minor` для фич, `patch` для багфиксов.

## 13) Безопасность и секреты

- Секреты не хранить в репозитории; только шаблоны (`.env.example`).
- Ограничивать пакет через `package.json#files` и `.npmignore`.
- Workflows с минимальными правами; не логировать токены.
- Gitleaks/CodeQL — включены в CI.

## 14) Зависимости

- Минимизировать runtime deps; `react`/`react-dom` — только peerDeps.
- Обновления — через Dependabot/ручные PR; фиксировать версии devDeps.
- Избегать тяжёлых полифиллов; таргет — современные браузеры/Node 18+.

## 15) Качество и линтинг

- ESLint (TS + React), Prettier — обязательны; no unused vars/exports, no default export.
- Запрет неиспользуемого кода; prefer `const`/`readonly`.
- Строгие правила на `any` и неявные `any`.

## 16) Примеры и шаблоны

- Компонент:

```tsx
export type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
};

export function Button({ children, onClick }: ButtonProps) {
  return (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
}
```

- Хук:

```ts
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = React.useRef(fn);
  ref.current = fn;
  return React.useCallback(((...args) => ref.current(...args)) as T, []);
}
```

- Changeset:

```md
---
'@flowscape-ui/canvas-react': minor
---

Add auto-pan behavior and viewport-centered paste positioning.
```

## 17) Ссылки

- См. процесс: `doc/workflow.md`
- Дорожная карта: `doc/tasklist.md`
- Видение/Идея: `doc/vision.md`, `doc/idea.md`
