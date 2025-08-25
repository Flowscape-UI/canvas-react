import { test, expect } from '@playwright/test';

// Storybook story: 'Core/Canvas: Basic'
const storyUrl = '/iframe.html?id=core-canvas--basic&args-showHints:false&args-showHistoryPanel:false';

// Helpers to interact with the exposed Zustand store
async function getSelectedVisualGroupId(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    if (!store) throw new Error('__RC_STORE not found on window');
    return store.getState().selectedVisualGroupId as string | null;
  });
}

async function getVisualGroupMembers(page: import('@playwright/test').Page, id: string) {
  return await page.evaluate((vgId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    const vg = store.getState().visualGroups[vgId];
    return vg ? vg.members.slice() : null;
  }, id);
}

async function repositionNodes(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    const { beginHistory, endHistory, updateNode } = store.getState();
    beginHistory('e2e:setup-grouping');
    // Space them out for reliable clicks
    updateNode('n1', { x: 800, y: 300 });
    updateNode('n2', { x: 1000, y: 320 });
    endHistory();
  });
}

// Core test: Ctrl/Cmd+G groups selected nodes into a visual group
// CI runs on Linux (Control). If running locally on macOS, the handler also supports Meta key.
// We use Control+g which works on CI; macOS locally can also work since the code listens to both.
test('Ctrl/Cmd+G creates a visual group from multi-selection and selects it', async ({ page }) => {
  await page.goto(storyUrl);

  const canvas = page.locator('[data-rc-canvas]');
  await expect(canvas).toBeVisible();

  // Add two nodes using the Controls panel
  const addBtn = page.getByRole('button', { name: 'Add' });
  await addBtn.click(); // n1
  await addBtn.click(); // n2

  const n1 = page.locator('[data-rc-nodeid="n1"]');
  const n2 = page.locator('[data-rc-nodeid="n2"]');
  await expect(n1).toBeVisible();
  await expect(n2).toBeVisible();

  // Reposition nodes for ease of selection
  await repositionNodes(page);

  // Select two nodes: click first, then Ctrl-click second to add to selection
  await n1.click();
  await n2.click({ modifiers: ['Control'] });

  // Ensure canvas has focus for keyboard shortcuts
  await canvas.focus();

  // Trigger Ctrl+G (handled by useCanvasNavigation to create a visual group from selection)
  await page.keyboard.press('Control+g');

  // Wait for store to reflect a selected visual group id
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__RC_STORE;
    return Boolean(store && store.getState().selectedVisualGroupId);
  });

  const vgId = await getSelectedVisualGroupId(page);
  expect(vgId).toBeTruthy();

  // Assert the visual group container appears in the DOM with the id
  const container = page.locator(`[data-testid="group-container"][data-parent-id="${vgId}"]`);
  await expect(container).toBeVisible();
  await expect(container.locator('[data-testid="group-container-hit"]')).toBeVisible();

  // Store-level assertion: members include both n1 and n2
  const members = await getVisualGroupMembers(page, vgId!);
  expect(members).toBeTruthy();
  expect(members).toEqual(expect.arrayContaining(['n1', 'n2']));
});
