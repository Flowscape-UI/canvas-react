import { test, expect } from '@playwright/test';

// Storybook story: 'Core/Canvas: Basic'
const storyUrl =
  '/iframe.html?id=core-canvas--basic&args-showHints:false&args-showHistoryPanel:false';

async function getNode(page: import('@playwright/test').Page, id: string) {
  return await page.evaluate((nodeId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    return store.getState().nodes[nodeId];
  }, id);
}

async function repositionNodes(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    const { beginHistory, endHistory, updateNode } = store.getState();
    beginHistory('e2e:setup-dragscope');
    // Space them out for reliable clicks
    updateNode('n1', { x: 800, y: 300 });
    updateNode('n2', { x: 1000, y: 320 });
    endHistory();
  });
}

async function createTwoNodesAndGroup(page: import('@playwright/test').Page) {
  const canvas = page.locator('[data-rc-canvas]');
  const addBtn = page.getByRole('button', { name: 'Add' });
  await addBtn.click(); // n1
  await addBtn.click(); // n2
  await repositionNodes(page);

  const n1 = page.locator('[data-rc-nodeid="n1"]');
  const n2 = page.locator('[data-rc-nodeid="n2"]');
  await expect(n1).toBeVisible();
  await expect(n2).toBeVisible();

  // Select n1 then Ctrl+Click n2 to multi-select
  await n1.click();
  await n2.click({ modifiers: ['Control'] });
  await canvas.focus();

  // Group via Ctrl+G
  await page.keyboard.press('Control+g');
}

function center(box: { x: number; y: number; width: number; height: number }) {
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

async function clickEmptyCanvas(page: import('@playwright/test').Page) {
  const canvas = page.locator('[data-rc-canvas]');
  const cbox = await canvas.boundingBox();
  if (!cbox) throw new Error('Canvas box not found');
  const x = cbox.x + 10;
  const y = cbox.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

async function dragNode(page: import('@playwright/test').Page, id: string, dx: number, dy: number) {
  const loc = page.locator(`[data-rc-nodeid="${id}"]`);
  const box = await loc.boundingBox();
  if (!box) throw new Error(`Bounding box for ${id} not found`);
  const { cx, cy } = center(box);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
  await page.mouse.up();
}

async function doubleClick(page: import('@playwright/test').Page, selector: string) {
  await page.locator(selector).dblclick();
}

async function doubleClickAndHoldDrag(
  page: import('@playwright/test').Page,
  selector: string,
  dx: number,
  dy: number,
) {
  const loc = page.locator(selector);
  const box = await loc.boundingBox();
  if (!box) throw new Error('Bounding box not found');
  const { cx, cy } = center(box);
  await page.mouse.move(cx, cy);
  // First click
  await page.mouse.down();
  await page.mouse.up();
  // Small delay under double-click threshold
  await page.waitForTimeout(50);
  // Second click and hold, then drag
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
  await page.mouse.up();
}

// Test 1: Two separate double-clicks toggle to node-only; drag moves only n1
test('double-click toggling to node: drag moves only the clicked node', async ({ page }) => {
  await page.goto(storyUrl);

  await createTwoNodesAndGroup(page);

  const n1Sel = '[data-rc-nodeid="n1"]';

  // Clear selection to avoid selection overlay intercepting dblclick
  await clickEmptyCanvas(page);

  // First double-click -> groupLocal (no visible change for single-level group)
  await doubleClick(page, n1Sel);
  // Second double-click -> node mode
  await doubleClick(page, n1Sel);

  // Wait for inner-edit to target n1 to guarantee node-only scope
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    return store && store.getState().innerEditNodeId === 'n1';
  });

  const before1 = await getNode(page, 'n1');
  const before2 = await getNode(page, 'n2');

  await dragNode(page, 'n1', 80, 0);

  const after1 = await getNode(page, 'n1');
  const after2 = await getNode(page, 'n2');

  expect(after1.x - before1.x).toBeGreaterThan(60);
  expect(after2.x).toBeCloseTo(before2.x, 0); // n2 did not move
});

// Test 2: Double-click-and-hold pre-toggles to node; drag within hold moves only n1
test('double-click-and-hold: pre-toggle to node and drag only n1', async ({ page }) => {
  await page.goto(storyUrl);

  await createTwoNodesAndGroup(page);

  const before1 = await getNode(page, 'n1');
  const before2 = await getNode(page, 'n2');

  await doubleClickAndHoldDrag(page, '[data-rc-nodeid="n1"]', 70, 0);

  const after1 = await getNode(page, 'n1');
  const after2 = await getNode(page, 'n2');

  expect(after1.x - before1.x).toBeGreaterThan(50);
  expect(after2.x).toBeCloseTo(before2.x, 0);
});

// Test 3: Clicking outside resets drag scope; drag moves group again
test('outside click resets to default: drag moves the group again', async ({ page }) => {
  await page.goto(storyUrl);

  await createTwoNodesAndGroup(page);

  // Enter node mode
  const n1Sel = '[data-rc-nodeid="n1"]';
  // Clear selection to avoid overlay intercept
  await clickEmptyCanvas(page);
  await doubleClick(page, n1Sel); // -> groupLocal
  await doubleClick(page, n1Sel); // -> node

  // Wait for inner-edit to target n1 to guarantee node-only scope
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    return store && store.getState().innerEditNodeId === 'n1';
  });

  // Click outside the group: on empty canvas area (top-left)
  const canvas = page.locator('[data-rc-canvas]');
  const cbox = await canvas.boundingBox();
  if (!cbox) throw new Error('Canvas box not found');
  await page.mouse.move(cbox.x + 10, cbox.y + 10);
  await page.mouse.down();
  await page.mouse.up();

  // Wait for inner-edit to be cleared by document-level handler
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    return store && store.getState().innerEditNodeId == null;
  });

  const before1 = await getNode(page, 'n1');
  const before2 = await getNode(page, 'n2');

  // Drag n1; default selects the group and moves both
  await dragNode(page, 'n1', 60, 0);

  const after1 = await getNode(page, 'n1');
  const after2 = await getNode(page, 'n2');

  expect(after1.x - before1.x).toBeGreaterThan(40);
  expect(after2.x - before2.x).toBeGreaterThan(40);
});
