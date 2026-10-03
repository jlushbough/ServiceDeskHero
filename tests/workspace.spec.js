import { test, expect } from '@playwright/test';
import { TICKETS } from '../js/rush-tickets.js';
import { PROJECTS } from '../js/rush-projects.js';

// Exercise the public UI against the local fixture server only. No account or feedback traffic.
async function boot(page, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.clock.install({time: new Date('2026-10-01T12:00:00Z')});
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-01T12:00:02Z'));
  await page.locator('#start-button').click();
  await expect(page.locator('#game')).toBeVisible();
}
const tab = (page, name) => page.locator(`[data-desk-tab="${name}"]`);
const filter = (page, name) => page.locator(`[data-desk-filter="${name}"]`);
async function openDesk(page, name, status = 'active') {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
  if (name !== 'training') await filter(page, status).click();
}
async function currentTab(page) {
  return page.locator('[data-desk-tab][aria-selected="true"]').getAttribute('data-desk-tab');
}
async function selectedId(page) {
  const id = await page.locator('#ticket-detail').getAttribute('data-selected-ticket');
  expect(id, 'ticket detail exposes the displayed ticket identity').toBeTruthy();
  return id;
}
async function slaSeconds(page) {
  const text = await page.locator('#sla-time').innerText();
  expect(text).toMatch(/^\d+:\d{2}$/);
  const [minutes, seconds] = text.split(':').map(Number);
  return minutes * 60 + seconds;
}
async function acknowledge(page) {
  await page.locator('#acknowledge-button').click();
  await expect(page.locator('#action-area')).toBeVisible();
}
async function fixCurrent(page) {
  const title = await page.locator('#ticket-title').innerText();
  const source = TICKETS.find(item => item.title === title);
  expect(source, `routine source for ${title}`).toBeTruthy();
  await page.locator('#fix-view-button').click();
  await page.locator('#actions button').filter({hasText: source.actions.find(action => action.kind === 'fix').label}).click();
  await page.clock.fastForward(2500);
}
async function assertViewport(page) {
  const size = await page.evaluate(() => ({
    width: window.innerWidth, height: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    scrollX: window.scrollX, scrollY: window.scrollY,
  }));
  expect(size.documentWidth, 'active game must not need horizontal document scrolling').toBeLessThanOrEqual(size.width + 1);
  expect(size.documentHeight, 'active game must not need vertical document scrolling').toBeLessThanOrEqual(size.height + 1);
  expect(size.scrollX).toBe(0);
  expect(size.scrollY).toBe(0);
  for (const selector of ['.hud', '#pause-button', '#time', '#score', '#morale-number']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${selector} remains visible`).not.toBeNull();
    expect(box.x, `${selector} left edge`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `${selector} top edge`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${selector} right edge`).toBeLessThanOrEqual(size.width + 1);
    expect(box.y + box.height, `${selector} bottom edge`).toBeLessThanOrEqual(size.height + 1);
  }
}
async function assertContainedScroll(page, selector, required = false) {
  const before = await page.locator('.hud').boundingBox();
  const geometry = await page.locator(selector).evaluate(element => {
    element.scrollTop = 0; element.scrollLeft = 0;
    const style = getComputedStyle(element);
    const height = element.clientHeight, width = element.clientWidth;
    const contentHeight = element.scrollHeight, contentWidth = element.scrollWidth;
    element.scrollTop = contentHeight; element.scrollLeft = contentWidth;
    return {height, width, contentHeight, contentWidth, overflowY:style.overflowY, overflowX:style.overflowX,
      scrollTop:element.scrollTop, scrollLeft:element.scrollLeft};
  });
  expect(geometry.height, `${selector} has usable height`).toBeGreaterThan(0);
  expect(geometry.width, `${selector} has usable width`).toBeGreaterThan(0);
  const vertical = geometry.contentHeight > geometry.height + 1;
  const horizontal = geometry.contentWidth > geometry.width + 1;
  if (required) expect(vertical || horizontal, `${selector} contains enough content to exercise scrolling`).toBe(true);
  if (vertical) {
    expect(['auto', 'scroll'], `${selector} owns its vertical overflow`).toContain(geometry.overflowY);
    expect(geometry.scrollTop, `${selector} can reach its lower content`).toBeGreaterThan(0);
  }
  if (horizontal) {
    expect(['auto', 'scroll'], `${selector} owns its horizontal overflow`).toContain(geometry.overflowX);
    expect(geometry.scrollLeft, `${selector} can reach its rightmost content`).toBeGreaterThan(0);
  }
  const after = await page.locator('.hud').boundingBox();
  expect(after.y).toBeCloseTo(before.y, 1);
  await assertViewport(page);
}
// A computed-color smoke test for ordinary copy and enabled controls. Check every
// gradient stop conservatively; screenshot review still covers the overall visual design.
async function assertTextContrast(page, selector) {
  const ratios = await page.locator(selector).evaluateAll(elements => {
    const rgba = value => {
      const numbers = value.match(/[\d.]+/g)?.map(Number);
      if (!numbers || numbers.length < 3) throw new Error(`Unsupported computed color: ${value}`);
      return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1];
    };
    const blend = (front, back) => front.slice(0, 3).map((value, index) => value * front[3] + back[index] * (1 - front[3]));
    const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    return elements.filter(element => element.getClientRects().length && !element.closest('[hidden]')).map(element => {
      const ancestors = []; for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
      let backgrounds = [[255, 255, 255]];
      for (const node of ancestors) {
        const style = getComputedStyle(node), color = rgba(style.backgroundColor);
        if (color[3] === 1) backgrounds = [color.slice(0, 3)];
        else backgrounds = backgrounds.map(background => blend(color, background));
        const stops = style.backgroundImage.match(/rgba?\([^)]*\)/g)?.map(rgba) || [];
        if (stops.length) backgrounds = backgrounds.flatMap(background => [background, ...stops.map(stop => blend(stop, background))]);
      }
      const foreground = rgba(getComputedStyle(element).color);
      const ratio = Math.min(...backgrounds.map(background => {
        const text = luminance(blend(foreground, background)), behind = luminance(background);
        return (Math.max(text, behind) + .05) / (Math.min(text, behind) + .05);
      }));
      return {text:element.textContent.trim().slice(0, 70), ratio};
    });
  });
  expect(ratios.length, `${selector} has visible text to check`).toBeGreaterThan(0);
  for (const sample of ratios) expect(sample.ratio, `text contrast for “${sample.text}”`).toBeGreaterThanOrEqual(4.5);
}
async function assertControlsReachable(page, selector) {
  const controls = page.locator(selector);
  let checked = 0;
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
    await control.scrollIntoViewIfNeeded();
    await control.click({trial:true});
    const box = await control.boundingBox(), viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await control.focus();
    await expect(control).toBeFocused();
    await assertViewport(page);
    checked++;
  }
  expect(checked, `${selector} includes reachable enabled controls`).toBeGreaterThan(0);
}

for (const viewport of [
  {width:1440, height:900},
  {width:320, height:740},
  {width:390, height:844},
  {width:844, height:390},
]) {
  test(`${viewport.width}x${viewport.height} workspace contains scrolling, keeps HUD visible, and exposes all controls`, async ({page}, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await boot(page, viewport);
    await assertViewport(page);
    await page.screenshot({path:testInfo.outputPath('workspace-initial.png'), fullPage:true});
    // Unacknowledged reports provide a full list without changing any deadlines.
    await page.clock.fastForward(3600000);
    await expect(page.locator('#open-total')).toContainText('12');
    for (const name of ['inc', 'req']) {
      await openDesk(page, name);
      await expect(page.locator('#queue [data-ticket]').first()).toBeVisible();
      await assertContainedScroll(page, '#queue', name === 'inc' && viewport.height < 850);
      await assertControlsReachable(page, '#queue [data-ticket]');
    }
    await openDesk(page, 'inc');
    await page.locator('#queue [data-ticket]').first().click();
    await acknowledge(page);
    // Generate authentic longer detail content rather than injecting layout-only fixtures.
    for (const mode of ['#contact-user-button', '#diagnostics-button']) {
      await page.locator(mode).click();
      const inquiries = await page.locator('#investigation-options [data-inquiry]').evaluateAll(buttons => buttons.map(button => button.dataset.inquiry));
      for (const id of inquiries) {
        await page.locator(`[data-inquiry="${id}"]`).click();
        await page.clock.fastForward(4100);
      }
    }
    await expect(page.locator('#case-notes .evidence-item')).not.toHaveCount(0);
    await page.locator('#fix-view-button').click();
    await assertTextContrast(page, '#active-ticket .clue p, #approach-hint, #actions button:not(:disabled) .action-label, [data-desk-tab]');
    await assertContainedScroll(page, '#ticket-detail', true);
    await assertControlsReachable(page, '#ticket-detail button');
    await assertControlsReachable(page, '[data-desk-tab]');
    await assertControlsReachable(page, '#desk-filters button');
    await assertControlsReachable(page, '.desk-foot button');
    await page.screenshot({path:testInfo.outputPath('workspace-investigated.png'), fullPage:true});
    for (const name of ['projects', 'ktlo', 'training']) {
      await openDesk(page, name);
      await assertViewport(page);
      await assertContainedScroll(page, name === 'training' ? '#training-workspace' : '#task-workspace');
      if (name === 'projects') await assertControlsReachable(page, '[data-project-action]');
      if (name === 'training') {
        await expect(page.locator('#desk-filters')).toBeHidden();
        await assertControlsReachable(page, '#training-workspace summary');
      }
    }
    // The short landscape viewport must also keep the pause dialog operable.
    await page.locator('#pause-button').click();
    await expect(page.locator('#pause-dialog')).toBeVisible();
    await page.locator('#resume-button').click();
    await assertViewport(page);
    expect(errors).toEqual([]);
  });
}

test('ticket Hold keeps its SLA running; Resume and resolved history retain evidence and identity', async ({page}) => {
  await boot(page, {width:390, height:844});
  const name = await currentTab(page), id = await selectedId(page);
  const title = await page.locator('#ticket-title').innerText();
  await acknowledge(page);
  await page.locator('#diagnostics-button').click();
  await page.locator('#investigation-options [data-inquiry]').first().click();
  await page.clock.fastForward(4100);
  const evidence = await page.locator('#case-notes .evidence-item').innerText();
  const before = await slaSeconds(page);
  await page.locator('#hold-button').click();
  await openDesk(page, name, 'active');
  await expect(page.locator(`#queue [data-ticket="${id}"]`)).toHaveCount(0);
  await openDesk(page, name, 'hold');
  await page.locator(`#queue [data-ticket="${id}"]`).click();
  await expect(page.locator('#hold-button')).toContainText(/resume/i);
  await expect(page.locator('#ticket-title')).toHaveText(title);
  await expect(page.locator('#case-notes .evidence-item')).toHaveText(evidence, {useInnerText:true});
  await page.clock.fastForward(60100);
  const held = await slaSeconds(page);
  expect(before - held).toBeGreaterThanOrEqual(60);
  expect(before - held).toBeLessThanOrEqual(61);
  for (const button of await page.locator('#actions button').all()) await expect(button).toBeDisabled();
  await page.keyboard.press('1');
  await expect(page.locator('#work-status')).toBeHidden();
  await page.locator('#pause-button').click();
  await page.clock.fastForward(180000);
  await page.locator('#resume-button').click();
  expect(await slaSeconds(page)).toBe(held);
  await page.locator('#hold-button').click();
  await openDesk(page, name, 'active');
  await page.locator(`#queue [data-ticket="${id}"]`).click();
  expect(await slaSeconds(page)).toBe(held);
  await expect(page.locator('#acknowledge-button')).toBeHidden();
  await fixCurrent(page);
  const score = await page.locator('#score').innerText();
  await openDesk(page, name, 'resolved');
  await page.locator(`#queue [data-history-ticket="${id}"]`).click();
  await expect(page.locator('#ticket-title')).toHaveText(title);
  await expect(page.locator('#history-status')).toContainText(/resolved|fixed|closed/i);
  await expect(page.locator('#case-notes .evidence-item')).toHaveText(evidence, {useInnerText:true});
  await expect(page.locator('#action-area')).toBeHidden();
  await expect(page.locator('#acknowledge-button')).toBeHidden();
  await expect(page.locator('#hold-button')).toBeHidden();
  await page.keyboard.press('1'); await page.keyboard.press('a');
  await page.clock.fastForward(3000);
  await expect(page.locator('#score')).toHaveText(score);
  await assertViewport(page);
});

test('a held acknowledged ticket expires once at its original deadline and remains in history', async ({page}) => {
  await boot(page);
  const name = await currentTab(page), id = await selectedId(page);
  const title = await page.locator('#ticket-title').innerText();
  await acknowledge(page); await page.locator('#hold-button').click();
  await page.clock.fastForward(900100);
  await openDesk(page, name, 'hold');
  await expect(page.locator(`#queue [data-ticket="${id}"]`)).toHaveCount(0);
  await openDesk(page, name, 'resolved');
  await page.locator(`#queue [data-history-ticket="${id}"]`).click();
  await expect(page.locator('#ticket-title')).toHaveText(title);
  await expect(page.locator('#history-status')).toContainText(/missed|expired/i);
  await expect(page.locator('#morale-number')).toHaveText('86%');
  await page.clock.fastForward(300000);
  await expect(page.locator('#morale-number')).toHaveText('86%');
  await expect(page.locator(`#queue [data-history-ticket="${id}"]`)).toHaveCount(1);
});

test('project filters support holding and resuming an unreleased task', async ({page}) => {
  await boot(page);
  const id = PROJECTS[0].id;
  await openDesk(page, 'projects');
  await page.locator(`[data-project="${id}"][data-project-action="hold"]`).click();
  await openDesk(page, 'projects', 'hold');
  const resume = page.locator(`[data-project="${id}"][data-project-action="resume"]`);
  await expect(resume).toBeVisible();
  await resume.click();
  await openDesk(page, 'projects', 'active');
  await expect(page.locator(`[data-project="${id}"][data-project-action="test"]`)).toBeEnabled();
  await page.locator(`[data-project="${id}"][data-project-action="defer"]`).click();
  await openDesk(page, 'projects', 'resolved');
  await expect(page.locator('#projects')).toContainText(PROJECTS[0].title);
  await expect(page.locator('#projects')).toContainText(/deferred/i);
  await expect(page.locator(`[data-project="${id}"][data-project-action]`)).toHaveCount(0);
});

test('workspace tabs support keyboard navigation and ticket shortcuts stay scoped to the visible queue', async ({page}) => {
  await boot(page, {width:320, height:740});
  await page.clock.fastForward(3600000);
  await openDesk(page, 'inc');
  await tab(page, 'inc').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'req')).toBeFocused();
  await expect(tab(page, 'req')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tab(page, 'training')).toBeFocused();
  await expect(tab(page, 'training')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab(page, 'inc')).toBeFocused();
  await expect(tab(page, 'inc')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'training')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'inc')).toBeFocused();
  await openDesk(page, 'req');
  const cards = page.locator('#queue [data-ticket]');
  expect(await cards.count()).toBeGreaterThan(1);
  await cards.first().click();
  const first = await selectedId(page), second = await cards.nth(1).getAttribute('data-ticket');
  await page.keyboard.press('e');
  expect(await selectedId(page)).toBe(second);
  expect(await currentTab(page)).toBe('req');
  await page.keyboard.press('q');
  expect(await selectedId(page)).toBe(first);
  await page.keyboard.press('a');
  await expect(page.locator('#sla-time')).toHaveText('15:00');
  await page.keyboard.press('p');
  await expect(page.locator('#resume-button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-dialog')).not.toBeVisible();
  await expect(page.locator('#pause-button')).toBeFocused();
  await assertViewport(page);
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`new arrivals show a textual badge without changing focus (${reducedMotion})`, async ({page}) => {
    await page.emulateMedia({reducedMotion});
    await boot(page);
    const arrival = (await page.locator('#next-arrival').innerText()).match(/(\d+):(\d{2})/);
    expect(arrival, 'the next report countdown is visible before switching workspaces').toBeTruthy();
    const milliseconds = (Number(arrival[1]) * 60 + Number(arrival[2])) * 1000 + 100;
    await openDesk(page, 'training');
    await tab(page, 'training').focus();
    await page.clock.fastForward(milliseconds);
    // The fixed daily deck's second case is a service request, arriving while Training is open.
    const requestTab = tab(page, 'req'), badge = page.locator('[data-unread="req"]');
    await expect(badge).toBeVisible();
    expect(Number(await badge.innerText())).toBeGreaterThan(0);
    await expect(tab(page, 'training')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'training')).toBeFocused();
    await expect(requestTab).toHaveClass(/new-arrival/);
    const animation = await requestTab.evaluate(element => {
      const style = getComputedStyle(element);
      return {name: style.animationName, iterations: style.animationIterationCount};
    });
    if (reducedMotion === 'reduce') expect(animation.name).toBe('none');
    else {
      expect(animation.name).not.toBe('none');
      expect(animation.iterations.split(',').map(value => value.trim())).not.toContain('infinite');
    }
    await openDesk(page, 'req');
    await expect(badge).toBeHidden();
    await expect(page.locator('#queue [data-ticket]').first()).toBeVisible();
    await expect(page.locator('#queue [data-unread-ticket]')).toHaveCount(0);
    await assertViewport(page);
  });
}

test('global risk and incident notices remain actionable away from ticket workspaces', async ({page}) => {
  await boot(page, {width:320, height:740});
  const project = PROJECTS[0].id;
  await openDesk(page, 'projects');
  await page.locator(`[data-project="${project}"][data-project-action="unsafeRelease"]`).click();
  await page.clock.fastForward(2100);
  await openDesk(page, 'training');
  await expect(page.locator('#desk-alert-button')).toBeVisible();
  await page.locator('#desk-alert-button').click();
  await expect(tab(page, 'ktlo')).toHaveAttribute('aria-selected', 'true');
  await expect(filter(page, 'hold')).toBeHidden();
  await expect(page.locator(`[data-project="${project}"][data-project-action="remediate"]`)).toBeVisible();
  await openDesk(page, 'training');
  await tab(page, 'training').focus();
  await page.clock.fastForward(60100);
  await expect(tab(page, 'training')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'training')).toBeFocused();
  await expect(page.locator('#desk-alert-button')).toBeVisible();
  await page.locator('#desk-alert-button').click();
  await expect(tab(page, 'inc')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#sla-rule')).toContainText('Sev 2');
  await expect(page.locator('#acknowledge-button')).toBeVisible();
  expect(await slaSeconds(page)).toBeGreaterThanOrEqual(179);
  await assertViewport(page);
});


test('System log can close, reopen, and dismiss with Escape without leaking gameplay shortcuts', async ({page}) => {
  await boot(page, {width:320, height:740});
  const title = await page.locator('#ticket-title').innerText();
  await page.locator('#system-button').click();
  await expect(page.locator('#system-dialog')).toBeVisible();
  await expect(page.locator('#close-system-button')).toBeFocused();
  await page.keyboard.press('a'); await page.keyboard.press('1');
  await expect(page.locator('#sla-time')).toHaveText('Not started');
  await expect(page.locator('#score')).toHaveText('0');
  await page.locator('#close-system-button').click();
  await expect(page.locator('#system-dialog')).not.toBeVisible();
  await expect(page.locator('#system-button')).toBeFocused();
  await page.locator('#system-button').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#system-dialog')).not.toBeVisible();
  await expect(page.locator('#pause-dialog')).not.toBeVisible();
  await expect(page.locator('#system-button')).toBeFocused();
  await expect(page.locator('#ticket-title')).toHaveText(title);
  await assertViewport(page);
});
