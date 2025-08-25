import { test, expect } from '@playwright/test';

// Target Storybook story: title 'Core/Canvas', story export 'Basic' => id 'core-canvas--basic'
const storyUrl = '/iframe.html?id=core-canvas--basic&args-showHints:false&args-showHistoryPanel:false';

// Helper to extract transform components from an element
async function readTransform(page: import('@playwright/test').Page, selector: string) {
  const t = await page.$eval(selector, (el) => {
    const s = getComputedStyle(el as HTMLElement).transform;
    return s || 'none';
  });
  if (!t || t === 'none') return { a: 1, d: 1, tx: 0, ty: 0 };
  // matrix(a, b, c, d, tx, ty)
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return { a: 1, d: 1, tx: 0, ty: 0 };
  const [a, , , d, tx, ty] = m[1].split(',').map((v) => parseFloat(v.trim()));
  return { a, d, tx, ty };
}

// Dispatch a ctrl+wheel event at the canvas to trigger zoom
async function zoomWithCtrl(page: import('@playwright/test').Page, canvasSel: string, deltaY: number) {
  await page.$eval(canvasSel, (el, dy) => {
    el.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: dy as number,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        ctrlKey: true,
      }),
    );
  }, deltaY);
}

test('pan and zoom work in Core/Canvas: Basic story', async ({ page }) => {
  await page.goto(storyUrl);

  const canvas = page.locator('[data-rc-canvas]');
  await expect(canvas).toBeVisible();

  // World layer is the element inside canvas that has transform applied
  const worldSel = '[data-rc-canvas] div[style*="transform:"]';

  const before = await readTransform(page, worldSel);

  // Pan: drag on empty canvas area
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 150, { steps: 10 });
  await page.mouse.up({ button: 'middle' });

  const afterPan = await readTransform(page, worldSel);
  expect(Math.abs(afterPan.tx - before.tx)).toBeGreaterThan(10);
  expect(Math.abs(afterPan.ty - before.ty)).toBeGreaterThan(10);

  // Zoom in using ctrl+wheel
  const beforeZoom = afterPan;
  await zoomWithCtrl(page, '[data-rc-canvas]', -300);
  await page.waitForTimeout(200);
  const afterZoomIn = await readTransform(page, worldSel);
  expect(afterZoomIn.a).toBeGreaterThan(beforeZoom.a);
  expect(afterZoomIn.d).toBeGreaterThan(beforeZoom.d);
});
