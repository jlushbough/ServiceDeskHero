import { test, expect } from '@playwright/test';
import { TICKETS } from '../js/rush-tickets.js';
import { BOSSES } from '../js/rush-bosses.js';
import * as Engine from '../js/rush-engine.js';
import { incidentSource } from '../js/rush-projects.js';

// Only the local static server is reachable. Test play never sends production feedback.
async function boot(page) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.clock.install({time: new Date('2026-10-01T12:00:00Z')});
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-01T12:00:02Z'));
}
const ticketTabs = ['inc', 'req'];
const deskTab = (page, tab) => page.locator(`[data-desk-tab="${tab}"]`);
async function openDesk(page, tab, filter = 'active') {
  if (await deskTab(page, tab).getAttribute('aria-selected') !== 'true') await deskTab(page, tab).click();
  const status = page.locator(`[data-desk-filter="${filter}"]`);
  if (tab !== 'training' && await status.getAttribute('aria-pressed') !== 'true') await status.click();
}
async function workspaceState(page) {
  return {
    tab: await page.locator('[data-desk-tab][aria-selected="true"]').getAttribute('data-desk-tab'),
    filter: await page.locator('[data-desk-filter][aria-pressed="true"]').getAttribute('data-desk-filter'),
    ticket: await page.locator('#ticket-detail').getAttribute('data-selected-ticket'),
  };
}
async function restoreWorkspace(page, state) {
  if (!(await page.locator('#game').isVisible())) return;
  await openDesk(page, state.tab, state.filter || 'active');
  if (state.ticket && await page.locator('#ticket-detail').getAttribute('data-selected-ticket') !== state.ticket && await page.locator(`#queue [data-ticket="${state.ticket}"]`).count()) {
    await page.locator(`#queue [data-ticket="${state.ticket}"]`).click();
  }
}
async function openCount(page) {
  const text = await page.locator('#open-total').innerText();
  expect(text).toMatch(/\d+/);
  return Number(text.match(/\d+/)[0]);
}
async function expectOpenCount(page, count) {
  await expect.poll(() => openCount(page)).toBe(count);
}
async function findOpenTicket(page) {
  if (await page.locator('#ticket-title').isVisible() && await page.locator('#history-status').isHidden()) return true;
  for (const tab of ticketTabs) {
    await openDesk(page, tab);
    const first = page.locator('#queue [data-ticket]').first();
    if (await first.count()) { await first.click(); return true; }
  }
  return false;
}
const routineSources = [...TICKETS, ...BOSSES.flatMap(boss => boss.stages)];
const projectIncidentSources = Engine.PROJECTS.map(project => incidentSource(project, 2));
async function currentSource(page) {
  const title = await page.locator('#ticket-title').innerText();
  const source = [...routineSources, ...projectIncidentSources].find(ticket => ticket.title === title);
  expect(source, `authored ticket exists for ${title}`).toBeTruthy();
  return source;
}
async function acknowledge(page) {
  const ack = page.locator('#acknowledge-button');
  if (await ack.isVisible()) await ack.click();
  await expect(page.locator('#action-area')).toBeVisible();
}
async function clickAction(page, kind = 'fix') {
  await page.locator('#fix-view-button').click();
  const source = await currentSource(page), action = source.actions.find(a => a.kind === kind);
  expect(action, `${source.id} has a ${kind} response`).toBeTruthy();
  const button = page.locator('#actions button').filter({hasText: action.label});
  await expect(button).toHaveCount(1); await expect(button).toBeEnabled(); await button.click();
  return action;
}
async function fix(page) {
  await acknowledge(page); await clickAction(page); await page.clock.fastForward(2500);
}
async function ready(page) {
  if (await page.locator('#results').isVisible()) return false;
  if (await findOpenTicket(page)) return true;
  const skip = page.locator('#skip-idle-button');
  if (await skip.isVisible() && await skip.isEnabled()) await skip.click();
  else {
    // Pending causal reports may outlive the finite routine deck. Never skip an open issue.
    for (let seconds = 0; seconds < 121 && !(await findOpenTicket(page)); seconds++) {
      if (await page.locator('#results').isVisible()) return false;
      await page.clock.fastForward(1000);
    }
  }
  await findOpenTicket(page);
  await expect(page.locator('#ticket-title')).toBeVisible();
  return true;
}
const projectButton = (page, id, action) => page.locator(`[data-project="${id}"][data-project-action="${action}"]`);
async function doProject(page, id, action, milliseconds) {
  const previous = await workspaceState(page);
  await openDesk(page, action === 'remediate' ? 'ktlo' : 'projects');
  const button = projectButton(page, id, action);
  await expect(button).toBeVisible(); await expect(button).toBeEnabled();
  await button.click();
  if (milliseconds) await page.clock.fastForward(milliseconds);
  await restoreWorkspace(page, previous);
}
async function completeAvailableProjects(page) {
  const previous = await workspaceState(page);
  await openDesk(page, 'projects');
  for (const project of Engine.PROJECTS) {
    const button = projectButton(page, project.id, 'test');
    if (await button.isVisible() && await button.isEnabled()) {
      await doProject(page, project.id, 'test', 18100);
      await doProject(page, project.id, 'release', 6100);
    }
  }
  await restoreWorkspace(page, previous);
}
async function finishSafe(page, inspect = async () => {}) {
  for (let step = 0; step < 24 && await page.locator('#game').isVisible(); step++) {
    await completeAvailableProjects(page);
    if (!(await ready(page))) break;
    await inspect(await currentSource(page));
    await fix(page);
  }
  await expect(page.locator('#results')).toBeVisible();
}
async function slaSeconds(page) {
  const text = await page.locator('#sla-time').innerText();
  expect(text).toMatch(/^\d+:\d{2}$/);
  const [minutes, seconds] = text.split(':').map(Number);
  return minutes * 60 + seconds;
}
async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
}
async function selectSeverity(page, severity) {
  await openDesk(page, 'inc');
  const card = page.locator('#queue button').filter({hasText: new RegExp(`SEV ${severity}`)});
  await expect(card).toHaveCount(1); await card.click();
}
async function assertNoIncidents(page) {
  const previous = await workspaceState(page);
  await openDesk(page, 'inc');
  await expect(page.locator('#queue button').filter({hasText: /SEV [12]/})).toHaveCount(0);
  await restoreWorkspace(page, previous);
}
async function hidePage(page) {
  // Exercise the real listener deterministically in headless CI.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#pause-dialog')).toBeVisible();
}
async function revealPage(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Returning to a tab does not silently resume any clock.
  await expect(page.locator('#pause-dialog')).toBeVisible();
  await page.locator('#resume-button').click();
}

test('desktop safe projects and twelve routine fixes complete a clean shift without any forced Sev1/2', async ({page}, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('sdh_save_v2', JSON.stringify({tickets:420, lifetimeTickets:9001, level:7, gameStarted:1}));
    localStorage.setItem('sdh_rush_v1', JSON.stringify({'rush-engineer':99999}));
    localStorage.setItem('sdh_shift_v2', JSON.stringify({'rush-engineer':88888}));
  });
  await boot(page); await assertNoOverflow(page);
  await expect(page.locator('#best-label')).not.toContainText('99,999');
  await expect(page.locator('#best-label')).not.toContainText('88,888');
  await page.screenshot({path:testInfo.outputPath('01-desktop-lobby.png'), fullPage:true});
  await page.locator('#start-button').click(); await expect(page.locator('#time')).toHaveText('0 / 14');
  const normals = new Set(), stages = new Set();
  await finishSafe(page, async source => {
    await assertNoIncidents(page);
    await expect(page.locator('#sla-rule')).toHaveText('Sev 3 · starts when you acknowledge');
    if (TICKETS.some(t => t.id === source.id)) {
      expect(normals.has(source.id)).toBe(false); normals.add(source.id);
    } else {
      stages.add(source.id);
      if (stages.size === 1) {
        await expect(page.locator('#time')).toHaveText('4 / 14');
        await expect(page.locator('#sla-time')).toHaveText('Not started');
        await page.screenshot({path:testInfo.outputPath('02-desktop-printer.png'), fullPage:true});
      }
    }
  });
  expect(normals.size).toBe(12); expect(stages.size).toBe(4);
  await expect(page.locator('#game')).toBeHidden();
  await expect(page.locator('#result-status')).toHaveText('SHIFT COMPLETE');
  await expect(page.locator('#result-fixed')).toHaveText('14');
  await expect(page.locator('#result-breakdown')).toContainText('0 missed · 0 wrong moves');
  await expect(page.locator('#result-breakdown')).toContainText('Bosses defeated: 2/2');
  await expect(page.locator('#result-breakdown')).toContainText('Incidents: 0 recovered · 0 missed · 0 prevented');
  await expect(page.locator('#result-breakdown')).toContainText('Projects: 2 completed');
  await expect(page.locator('#result-achievements')).toContainText('The Pager Sleeps Tonight');
  expect(Number((await page.locator('#final-score').innerText()).replaceAll(',', ''))).toBeGreaterThan(3000);
  await page.screenshot({path:testInfo.outputPath('03-desktop-report.png'), fullPage:true});
  const saves = await page.evaluate(() => ({career:JSON.parse(localStorage.getItem('sdh_save_v2')), oldRush:JSON.parse(localStorage.getItem('sdh_rush_v1')), oldShift:JSON.parse(localStorage.getItem('sdh_shift_v2')), contact:JSON.parse(localStorage.getItem('sdh_contact_v3'))}));
  expect(saves.career.tickets).toBe(420); expect(saves.career.lifetimeTickets).toBe(9001);
  expect(saves.oldRush['rush-engineer']).toBe(99999); expect(saves.oldShift['rush-engineer']).toBe(88888);
  expect(saves.contact['dungeon-engineer']).toBeGreaterThan(0);
  await page.locator('#share-button').click(); await expect(page.locator('#share-status')).not.toBeEmpty();
  await page.locator('#replay-button').click();
  await expect(page.locator('#score')).toHaveText('0'); await expect(page.locator('#time')).toHaveText('0 / 14');
  await expect(page.locator('#sla-time')).toHaveText('Not started');
  await expect(page.locator('#case-notes')).toContainText('No evidence collected');
  await expect(projectButton(page, Engine.PROJECTS[0].id, 'test')).toBeEnabled();
  await expect(page.locator('#acknowledge-button')).toBeVisible(); expect(errors).toEqual([]);
});

test('unacknowledged Sev3 can be read indefinitely while random routine arrivals accumulate', async ({page}) => {
  await boot(page); await page.locator('#start-button').click();
  const title = await page.locator('#ticket-title').innerText();
  await expect(page.locator('#sla-time')).toHaveText('Not started');
  await expect(page.locator('#action-area')).toBeHidden();
  await page.keyboard.press('1'); await page.keyboard.press('2'); await page.keyboard.press('3');
  await page.clock.fastForward(29000); await expectOpenCount(page, 1);
  await page.clock.fastForward(92000); expect(await openCount(page)).toBeGreaterThanOrEqual(2);
  await page.clock.fastForward(3600000);
  await expect(page.locator('#ticket-title')).toHaveText(title); await expectOpenCount(page, 12);
  await expect(page.locator('#game')).toBeVisible(); await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#score')).toHaveText('0'); await expect(page.locator('#time')).toHaveText('0 / 14');
  await expect(page.locator('#morale-number')).toHaveText('100%'); await expect(page.locator('#sla-time')).toHaveText('Not started');
  await assertNoIncidents(page); await acknowledge(page); await expect(page.locator('#sla-time')).toHaveText('15:00');
  await page.clock.fastForward(1100); expect(await slaSeconds(page)).toBe(899);
  await page.keyboard.press('a'); expect(await slaSeconds(page)).toBe(899);
  await page.locator('#pause-button').click();
  const paused = await page.locator('#sla-time').innerText();
  await page.clock.fastForward(1800000); await expect(page.locator('#sla-time')).toHaveText(paused);
  await page.locator('#resume-button').click(); await expect(page.locator('#sla-time')).toHaveText(paused);
  await page.clock.fastForward(1100); expect(await slaSeconds(page)).toBe(898);
  await expect(page.locator('#ticket-title')).toHaveText(title); await expect(page.locator('#time')).toHaveText('0 / 14');
});

test('an unhelpful optional question never blocks diagnostic evidence or a correct fix', async ({page}) => {
  await boot(page); await page.locator('#start-button').click(); await acknowledge(page);
  const source = await currentSource(page), question = source.investigations.find(i => i.id.endsWith('-leading'));
  const diagnostic = source.investigations.find(i => i.kind === 'diagnostic');
  expect(question, 'every beginner case offers a realistically unhelpful leading question').toBeTruthy();
  await expect(page.locator('#active-ticket')).not.toContainText(source.clue);
  await page.locator('#contact-user-button').click();
  await page.locator(`[data-inquiry="${question.id}"]`).click();
  await expect(page.locator('#work-label')).toContainText('Contacting');
  await page.keyboard.press('1'); await page.clock.fastForward(500); await hidePage(page);
  const pending = await page.locator('#work-seconds').innerText();
  await page.clock.fastForward(60000); await expect(page.locator('#work-seconds')).toHaveText(pending);
  await expect(page.locator('#case-notes .evidence-item')).toHaveCount(0);
  await revealPage(page); await page.clock.fastForward(1600);
  await expect(page.locator('#case-notes')).toContainText(question.reply);
  await expect(page.locator('#case-notes')).toContainText(question.evidence);
  await expect(page.locator(`[data-inquiry="${question.id}"]`)).toBeDisabled();
  await expect(page.locator('#score')).toHaveText('0'); await expect(page.locator('#time')).toHaveText('0 / 14');
  await page.clock.fastForward(120000); expect(await openCount(page)).toBeGreaterThan(1);
  await page.locator('#diagnostics-button').click(); await page.locator(`[data-inquiry="${diagnostic.id}"]`).click();
  await openDesk(page, 'req'); await page.locator('#queue [data-ticket]').first().click(); const otherTitle = await page.locator('#ticket-title').innerText();
  expect(otherTitle).not.toBe(source.title); await page.clock.fastForward(4100);
  await expect(page.locator('#case-notes')).not.toContainText(diagnostic.evidence);
  await openDesk(page, 'inc'); await page.locator('#queue [data-ticket]').filter({hasText:source.title}).click();
  await expect(page.locator('#ticket-title')).toHaveText(source.title);
  await expect(page.locator('#case-notes')).toContainText(diagnostic.evidence);
  await expect(page.locator('#case-notes .evidence-item')).toHaveCount(2);
  await fix(page); await expect(page.locator('#resolved-label')).toHaveText('1 ticket closed');
  await ready(page); await acknowledge(page);
  await expect(page.locator('#case-notes')).toContainText('No evidence collected');
  // Direct fixing remains possible without collecting any evidence on the next case.
  await fix(page); await expect(page.locator('#resolved-label')).toHaveText('2 tickets closed');
});

test('unsafe change causes Sev2 at report; recovery teaches the consequence before earned Sev1', async ({page}, testInfo) => {
  await boot(page); await page.locator('#start-button').click();
  const first = Engine.PROJECTS[0].id, second = Engine.PROJECTS[1].id;
  await doProject(page, first, 'unsafeRelease', 2100);
  await assertNoIncidents(page); await page.clock.fastForward(60100); await selectSeverity(page, 2);
  await expect(page.locator('#sla-rule')).toContainText('Sev 2');
  const firstTitle = await page.locator('#ticket-title').innerText();
  expect(await slaSeconds(page)).toBeGreaterThanOrEqual(179); expect(await slaSeconds(page)).toBeLessThanOrEqual(180);
  await expect(page.locator('#acknowledge-button')).toBeVisible();
  await page.clock.fastForward(20000); const remaining = await slaSeconds(page);
  expect(remaining).toBeGreaterThanOrEqual(159); expect(remaining).toBeLessThanOrEqual(160);
  await acknowledge(page); expect(await slaSeconds(page)).toBe(remaining);
  const score = Number((await page.locator('#score').innerText()).replaceAll(',', ''));
  await fix(page);
  expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBeGreaterThan(score);
  await expect(page.locator('#queue button').filter({hasText:firstTitle})).toHaveCount(0);
  await expect(page.locator('#time')).toHaveText('0 / 14');
  const normals = new Set(), printerStages = new Set();
  for (let n = 0; n < 14 && (normals.size < 8 || printerStages.size < 2); n++) {
    await ready(page); const source = await currentSource(page);
    if (TICKETS.some(t => t.id === source.id)) normals.add(source.id);
    else if (BOSSES[0].stages.some(t => t.id === source.id)) printerStages.add(source.id);
    await assertNoIncidents(page); await fix(page);
  }
  expect(normals.size).toBe(8); expect(printerStages.size).toBe(2);
  await assertNoIncidents(page);
  await doProject(page, second, 'unsafeRelease', 2100);
  await assertNoIncidents(page); await page.clock.fastForward(60100); await selectSeverity(page, 1);
  await expect(page.locator('#sla-rule')).toContainText('Sev 1');
  expect(await slaSeconds(page)).toBeGreaterThanOrEqual(59); expect(await slaSeconds(page)).toBeLessThanOrEqual(60);
  await page.screenshot({path:testInfo.outputPath('04-causal-sev1.png'), fullPage:true});
  await page.clock.fastForward(10000); const severeRemaining = await slaSeconds(page);
  await acknowledge(page); expect(await slaSeconds(page)).toBe(severeRemaining);
  await fix(page); await assertNoIncidents(page);
  await finishSafe(page); await expect(page.locator('#result-status')).toHaveText('SHIFT COMPLETE');
  await expect(page.locator('#result-breakdown')).toContainText('0 missed · 0 wrong moves');
  await expect(page.locator('#result-breakdown')).toContainText('Incidents: 2 recovered · 0 missed · 0 prevented');
});

test('preventative remediation cancels an unsafe change risk before any incident is reported', async ({page}) => {
  await boot(page); await page.locator('#start-button').click();
  const project = Engine.PROJECTS[0].id;
  await doProject(page, project, 'unsafeRelease', 2100);
  await doProject(page, project, 'remediate', 18100);
  expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBe(0);
  await page.clock.fastForward(180000); await assertNoIncidents(page);
  await expect(page.locator('#time')).toHaveText('0 / 14');
  await expect(page.locator('#morale-number')).toHaveText('100%');
  await expect(page.locator('#sla-time')).toHaveText('Not started');
  await finishSafe(page); await expect(page.locator('#result-breakdown')).toContainText('0 missed · 0 wrong moves');
  await expect(page.locator('#result-breakdown')).toContainText('Incidents: 0 recovered · 0 missed · 1 prevented');
});

test('projects compete with ticket work, can be interrupted, and must be completed or safely deferred', async ({page}) => {
  await boot(page); await page.locator('#start-button').click(); await acknowledge(page);
  const first = Engine.PROJECTS[0].id, second = Engine.PROJECTS[1].id;
  await expect(projectButton(page, second, 'test')).toHaveCount(0);
  await doProject(page, first, 'test', 1100);
  for (const button of await page.locator('#actions button').all()) await expect(button).toBeDisabled();
  expect(await slaSeconds(page)).toBe(899);
  await expect(page.locator('#cancel-work-button')).toBeVisible(); await page.locator('#cancel-work-button').click();
  await expect(page.locator('#work-status')).toBeHidden();
  await expect(projectButton(page, first, 'test')).toBeEnabled();
  await expect(projectButton(page, first, 'release')).toHaveCount(0);
  await doProject(page, first, 'test', 18100);
  await expect(projectButton(page, first, 'release')).toBeEnabled();
  await doProject(page, first, 'defer', 0);
  await expect(page.locator('#score')).toHaveText('0'); await assertNoIncidents(page);
  for (let step = 0; step < 16; step++) { await ready(page); await fix(page); }
  await expect(page.locator('#time')).toHaveText('14 / 14');
  await expect(page.locator('#results')).toBeHidden(); await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#skip-idle-button')).toBeDisabled();
  await doProject(page, second, 'defer', 0);
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#result-breakdown')).toContainText('Projects: 0 completed · 0 pts');
});

test('an unacknowledged Sev2 expires once at its report-time deadline', async ({page}) => {
  await boot(page); await page.locator('#start-button').click();
  await doProject(page, Engine.PROJECTS[0].id, 'unsafeRelease', 2100);
  await page.clock.fastForward(60100); await selectSeverity(page, 2);
  await expect(page.locator('#acknowledge-button')).toBeVisible();
  await page.clock.fastForward(179000); await expect(page.locator('#sla-time')).toHaveText('0:01');
  await page.clock.fastForward(2000); await assertNoIncidents(page);
  await expect(page.locator('#morale-number')).toHaveText('86%');
  await page.clock.fastForward(300000); await expect(page.locator('#morale-number')).toHaveText('86%');
  await expect(page.locator('#time')).toHaveText('0 / 14');
});

test('390px Faker earns both bosses: high-tech catches a bluff; low-tech extends SLA without fixing', async ({page}, testInfo) => {
  await page.setViewportSize({width:390, height:844}); await boot(page);
  await page.locator('#faker-class').click(); await assertNoOverflow(page);
  await page.screenshot({path:testInfo.outputPath('05-mobile-lobby.png'), fullPage:true});
  await page.locator('#start-button').click();
  let caught = false, fooled = false;
  await finishSafe(page, async () => {
    await acknowledge(page); const bluff = page.locator('#bluff-button');
    if (await bluff.isVisible() && await bluff.isEnabled()) {
      const title = await page.locator('#ticket-title').innerText(), stage = await page.locator('#boss-status').innerText();
      const progress = await page.locator('#time').innerText(), deadline = await slaSeconds(page);
      const score = Number((await page.locator('#score').innerText()).replaceAll(',', ''));
      const morale = Number((await page.locator('#morale-number').innerText()).replace('%', ''));
      await bluff.click(); await page.clock.fastForward(900);
      await expect(page.locator('#ticket-title')).toHaveText(title); await expect(page.locator('#boss-status')).toHaveText(stage, {useInnerText:true});
      await expect(page.locator('#time')).toHaveText(progress); await expect(bluff).toBeDisabled();
      if (stage.includes('8/10')) {
        caught = true; expect(progress).toBe('4 / 14');
        await expect(page.locator('#outcome')).toContainText('Bluff detected');
        await expect(page.locator('#morale-number')).toHaveText(`${morale - 10}%`);
        expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBe(score);
        expect(await slaSeconds(page)).toBeLessThanOrEqual(deadline);
      } else {
        fooled = true; expect(progress).toBe('13 / 14');
        await expect(page.locator('#outcome')).toContainText('+10s');
        await expect(page.locator('#morale-number')).toHaveText(`${Math.min(100, morale + 10)}%`);
        expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBe(score + 175);
        expect(await slaSeconds(page)).toBeGreaterThanOrEqual(deadline + 9);
        await page.screenshot({path:testInfo.outputPath('06-mobile-friday.png'), fullPage:true});
      }
      await assertNoOverflow(page);
    }
  });
  expect(caught).toBe(true); expect(fooled).toBe(true);
  await expect(page.locator('#result-fixed')).toHaveText('14');
  await expect(page.locator('#result-breakdown')).toContainText('Bosses defeated: 2/2'); await assertNoOverflow(page);
  await page.screenshot({path:testInfo.outputPath('07-mobile-report.png'), fullPage:true});
});

test('320px keyboard ACK, wrong response, single-patch return and duplicate action guard', async ({page}) => {
  await page.setViewportSize({width:320, height:740}); await boot(page); await assertNoOverflow(page);
  await page.locator('#start-button').click(); await assertNoOverflow(page);
  const title = await page.locator('#ticket-title').innerText();
  await page.keyboard.press('1'); await expect(page.locator('#score')).toHaveText('0');
  await page.keyboard.press('a'); await expect(page.locator('#action-area')).toBeVisible();
  const wrong = await clickAction(page, 'wrong'); await page.clock.fastForward(2500);
  await expect(page.locator('#outcome')).toContainText(wrong.outcome); await expect(page.locator('#morale-number')).toHaveText('90%');
  await expect(page.locator('#actions button').filter({hasText:wrong.label})).toBeDisabled();
  await expect(page.locator('#time')).toHaveText('0 / 14');
  await page.keyboard.press('p'); await expect(page.locator('#pause-dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#pause-dialog')).not.toBeVisible();
  const patch = await clickAction(page, 'patch'); await page.clock.fastForward(900);
  await expect(page.locator('#empty-ticket')).toBeVisible(); await expectOpenCount(page, 0);
  await expect(page.locator('#skip-idle-button')).toBeDisabled();
  await expect(page.locator('#time')).toHaveText('0 / 14'); await expect(page.locator('#resolved-label')).toHaveText('0 tickets closed');
  await page.clock.fastForward(11000); await expect(page.locator('#ticket-title')).toHaveText(title);
  await expect(page.locator('#acknowledge-button')).toBeHidden();
  await expect(page.locator('#actions button').filter({hasText:patch.label})).toBeDisabled();
  expect(await slaSeconds(page)).toBeLessThan(890);
  await clickAction(page); await page.keyboard.press('1'); await page.keyboard.press('2'); await page.keyboard.press('3');
  await page.clock.fastForward(2500);
  await expect(page.locator('#resolved-label')).toHaveText('1 ticket closed'); await expect(page.locator('#time')).toHaveText('1 / 14');
  await ready(page); await expect(page.locator('#acknowledge-button')).toBeVisible(); await assertNoOverflow(page);
});

test('career fresh-save picker and preview feedback remain safe', async ({page}) => {
  await boot(page); await page.getByRole('link', {name:/Career mode/}).click();
  await expect(page.locator('#difficulty-modal')).toBeVisible(); await page.locator('[data-difficulty="easy"]').click();
  await expect(page.locator('#main-clicker')).toBeVisible(); await page.locator('#btn-close-help').click();
  await page.locator('#main-clicker').click(); await expect(page.locator('#tickets-display')).not.toHaveText('0');
  await page.locator('#btn-feedback').click(); await expect(page.locator('#feedback-status')).toContainText('disabled in previews');
  await expect(page.locator('#btn-submit-feedback')).toBeDisabled();
});

test('First Shift stays playable with blocked storage and reduced motion', async ({page}) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
  });
  await page.emulateMedia({reducedMotion:'reduce'}); await boot(page); await page.locator('#start-button').click();
  await fix(page); await expect(page.locator('#resolved-label')).toHaveText('1 ticket closed');
  await expect(page.locator('#time')).toHaveText('1 / 14');
  await ready(page); await expect(page.locator('#sla-time')).toHaveText('Not started'); expect(errors).toEqual([]);
});

test('existing career resumes without a difficulty reset and remains separate from First Shift', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('sdh_save_v2', JSON.stringify({tickets:420, lifetimeTickets:9001, level:7, lastSave:Date.now(), lastTick:Date.now(), difficultyId:'medium'}));
    localStorage.setItem('sdh_seen_help', '1');
  });
  await boot(page); await page.getByRole('link', {name:/Career mode/}).click();
  await expect(page.locator('#difficulty-modal')).not.toBeVisible();
  await expect(page.locator('#hero-level')).toHaveText('7'); await expect(page.locator('#tickets-display')).toHaveText('420');
  await page.getByRole('link', {name:/Back to (Rush Hour|First Shift)/}).click();
  await expect(page.locator('#lobby')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sdh_save_v2')).lifetimeTickets)).toBe(9001);
});

test('backgrounding freezes work, arrivals, SLA and returns; next-day replay refreshes the seed', async ({page}) => {
  await boot(page); await page.locator('#start-button').click(); await acknowledge(page); await clickAction(page);
  await page.clock.fastForward(500); await hidePage(page);
  const sla = await page.locator('#sla-time').innerText(), work = await page.locator('#work-seconds').innerText();
  const next = await page.locator('#next-arrival').innerText();
  await page.clock.fastForward(60000);
  await expect(page.locator('#sla-time')).toHaveText(sla); await expect(page.locator('#work-seconds')).toHaveText(work);
  await expect(page.locator('#next-arrival')).toHaveText(next); await expectOpenCount(page, 1);
  await expect(page.locator('#time')).toHaveText('0 / 14');
  await revealPage(page); await page.clock.fastForward(2000); await expect(page.locator('#time')).toHaveText('1 / 14');
  await ready(page); await acknowledge(page); const title = await page.locator('#ticket-title').innerText();
  await clickAction(page, 'patch'); await page.clock.fastForward(900); await expect(page.locator('#empty-ticket')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#pause-dialog')).toBeVisible(); await page.clock.fastForward(60000);
  await expectOpenCount(page, 0); await expect(page.locator('#time')).toHaveText('1 / 14');
  await page.locator('#resume-button').click(); await page.clock.fastForward(11000);
  await expect(page.locator('#ticket-title')).toHaveText(title); await expect(page.locator('#acknowledge-button')).toBeHidden();
  expect(await slaSeconds(page)).toBeGreaterThanOrEqual(888); expect(await slaSeconds(page)).toBeLessThanOrEqual(889);
  await page.locator('#pause-button').click(); await page.locator('#quit-button').click();
  await expect(page.locator('#result-status')).toHaveText('SHIFT ENDED EARLY');
  await expect(page.locator('#result-achievements')).not.toContainText('The Pager Sleeps Tonight');
  await page.clock.setSystemTime(new Date('2026-10-02T00:00:01Z'));
  await page.locator('#replay-button').click(); await page.locator('#pause-button').click(); await page.locator('#quit-button').click();
  await page.locator('#menu-button').click(); await expect(page.locator('#daily-label')).toContainText('10/02');
});

test('pausing unsafe project risk stops the report countdown rather than causing a background incident', async ({page}) => {
  await boot(page); await page.locator('#start-button').click();
  await doProject(page, Engine.PROJECTS[0].id, 'unsafeRelease', 2100);
  await page.clock.fastForward(20000); await hidePage(page);
  await page.clock.fastForward(180000); await assertNoIncidents(page);
  await revealPage(page); await page.clock.fastForward(39000); await assertNoIncidents(page);
  await page.clock.fastForward(2000); await selectSeverity(page, 2);
  expect(await slaSeconds(page)).toBeGreaterThanOrEqual(178);
});
