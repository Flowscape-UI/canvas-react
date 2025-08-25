import { test, expect } from '@playwright/test';

// Storybook story: 'Core/Canvas: Basic'
const storyUrl =
  '/iframe.html?id=core-canvas--basic&args-showHints:false&args-showHistoryPanel:false';

// Helpers to interact with the exposed Zustand store
async function getNodeXY(page: import('@playwright/test').Page, id: string) {
  return await page.evaluate((nid) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    if (!store) throw new Error('__RC_STORE not found on window');
    const n = store.getState().nodes[nid];
    return n ? { x: n.x, y: n.y } : null;
  }, id);
}

async function bumpHistory(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    return store.getState().historyPast.length as number;
  });
}

test('dragging a group container moves all descendants (including grandchildren)', async ({
  page,
}) => {
  await page.goto(storyUrl);

  const canvas = page.locator('[data-rc-canvas]');
  await expect(canvas).toBeVisible();

  // Add three nodes using the Controls panel
  const addBtn = page.getByRole('button', { name: 'Add' });
  await addBtn.click(); // n1
  await addBtn.click(); // n2
  await addBtn.click(); // n3

  const n1 = page.locator('[data-rc-nodeid="n1"]');
  const n2 = page.locator('[data-rc-nodeid="n2"]');
  const n3 = page.locator('[data-rc-nodeid="n3"]');
  await expect(n1).toBeVisible();
  await expect(n2).toBeVisible();
  await expect(n3).toBeVisible();

  // Reposition nodes to avoid overlap
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    const { beginHistory, endHistory, updateNode } = store.getState();
    beginHistory('e2e:setup-group-drag');
    updateNode('n1', { x: 800, y: 300 });
    updateNode('n2', { x: 1000, y: 320 });
    updateNode('n3', { x: 1180, y: 340 });
    endHistory();
  });

  // Create hierarchy programmatically: n1 is parent of n2
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    store.getState().groupNodes('n1', ['n2']);
  });

  // Nest n3 under n2 (grandchild of n1)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    store.getState().groupNodes('n2', ['n3']);
  });

  // Create a visual group from selection (UI-only group container)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    const { selectOnly, addToSelection, createVisualGroupFromSelection } = store.getState();
    selectOnly('n1');
    addToSelection('n2');
    createVisualGroupFromSelection();
  });

  // Resolve the visual group id and ensure its container is present
  const vgId = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    return store.getState().selectedVisualGroupId as string;
  });
  expect(vgId).toBeTruthy();
  const containerHit = page.locator(
    `[data-testid="group-container"][data-parent-id="${vgId}"] [data-testid="group-container-hit"]`,
  );
  await expect(containerHit).toBeVisible();

  // Record positions before
  const before1 = await getNodeXY(page, 'n1');
  const before2 = await getNodeXY(page, 'n2');
  const before3 = await getNodeXY(page, 'n3');

  const historyBefore = await bumpHistory(page);

  // Drag the container by +50, +40 screen px
  const box = await containerHit.boundingBox();
  if (!box) throw new Error('container bounding box not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy + 40, { steps: 8 });
  await page.mouse.up();

  // Check all moved by same delta (zoom=1 in story)
  const after1 = await getNodeXY(page, 'n1');
  const after2 = await getNodeXY(page, 'n2');
  const after3 = await getNodeXY(page, 'n3');

  expect(after1 && before1 && Math.round(after1.x - before1.x)).toBe(50);
  expect(after1 && before1 && Math.round(after1.y - before1.y)).toBe(40);
  expect(after2 && before2 && Math.round(after2.x - before2.x)).toBe(50);
  expect(after2 && before2 && Math.round(after2.y - before2.y)).toBe(40);
  expect(after3 && before3 && Math.round(after3.x - before3.x)).toBe(50);
  expect(after3 && before3 && Math.round(after3.y - before3.y)).toBe(40);

  // One new history entry should be added
  const historyAfter = await bumpHistory(page);
  expect(historyAfter).toBe(historyBefore + 1);
});
