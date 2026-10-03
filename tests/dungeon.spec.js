import { test, expect } from '@playwright/test';
import { TICKETS } from '../js/rush-tickets.js';
import { BOSSES } from '../js/rush-bosses.js';
import { PROJECTS } from '../js/rush-projects.js';

// Keep playtests local. All progression is earned with public controls and the real
// simulation; the clock only replaces waiting, never injects game state.
async function boot(page, viewport = {width:1440, height:900}) {
  await page.setViewportSize(viewport);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.clock.install({time:new Date('2026-10-01T12:00:00Z')});
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-01T12:00:02Z'));
}
async function start(page) {
  await page.locator('#start-button').click();
  await expect(page.locator('#game')).toBeVisible();
}
async function openDesk(page, tab, filter = 'active') {
  const control = page.locator(`[data-desk-tab="${tab}"]`);
  if (await control.getAttribute('aria-selected') !== 'true') await control.click();
  if (tab !== 'training') {
    const status = page.locator(`[data-desk-filter="${filter}"]`);
    if (await status.getAttribute('aria-pressed') !== 'true') await status.click();
  }
}
async function currentSource(page) {
  const title = await page.locator('#ticket-title').innerText();
  const source = [...TICKETS, ...BOSSES.flatMap(boss => boss.stages)].find(item => item.title === title);
  expect(source, `authored source exists for “${title}”`).toBeTruthy();
  return source;
}
async function acknowledge(page) {
  if (await page.locator('#acknowledge-button').isVisible()) await page.locator('#acknowledge-button').click();
  await expect(page.locator('#action-area')).toBeVisible();
}
async function action(page, kind = 'fix') {
  const source = await currentSource(page), choice = source.actions.find(item => item.kind === kind);
  expect(choice, `${source.id} has a ${kind} action`).toBeTruthy();
  await page.locator('#fix-view-button').click();
  const button = page.locator('#actions button').filter({hasText:choice.label});
  await expect(button).toHaveCount(1);
  await expect(button).toBeEnabled();
  await button.click();
  return choice;
}
async function fix(page) {
  await acknowledge(page);
  await action(page);
  await page.clock.fastForward(2500);
}
async function findOpenTicket(page) {
  if (await page.locator('#ticket-title').isVisible() && await page.locator('#history-status').isHidden()) return true;
  for (const tab of ['inc', 'req']) {
    await openDesk(page, tab);
    const first = page.locator('#queue [data-ticket]').first();
    if (await first.count()) { await first.click(); return true; }
  }
  return false;
}
async function ready(page) {
  if (await page.locator('#results').isVisible()) return false;
  if (await findOpenTicket(page)) return true;
  const skip = page.locator('#skip-idle-button');
  await expect(skip, 'a safe empty desk can advance to the next real report').toBeEnabled();
  await skip.click();
  await findOpenTicket(page);
  await expect(page.locator('#ticket-title')).toBeVisible();
  return true;
}
const projectButton = (page, id, action) => page.locator(`[data-project="${id}"][data-project-action="${action}"]`);
async function deferAvailableProjects(page) {
  await openDesk(page, 'projects');
  for (const project of PROJECTS) {
    const defer = projectButton(page, project.id, 'defer');
    if (await defer.isVisible() && await defer.isEnabled()) await defer.click();
  }
  if (await page.locator('#game').isVisible()) await openDesk(page, 'inc');
}
async function slaSeconds(page) {
  const text = await page.locator('#sla-time').innerText();
  expect(text).toMatch(/^\d+:\d{2}$/);
  const [minutes, seconds] = text.split(':').map(Number);
  return minutes * 60 + seconds;
}
async function openCharacter(page) {
  await page.locator('#character-button').click();
  await expect(page.locator('#character-dialog')).toBeVisible();
  await expect(page.locator('#character-dialog')).toContainText(/paus/i);
  await expect(page.locator('#pause-dialog')).not.toBeVisible();
}
async function closeCharacter(page, method = 'button') {
  if (method === 'escape') await page.keyboard.press('Escape');
  else await page.locator('#close-character-button').click();
  await expect(page.locator('#character-dialog')).not.toBeVisible();
  await expect(page.locator('#pause-dialog')).not.toBeVisible();
  await expect(page.locator('#character-button')).toBeFocused();
}
async function clockSnapshot(page) {
  return page.evaluate(() => Object.fromEntries([
    'time', 'score', 'morale-number', 'sla-time', 'next-arrival', 'work-seconds', 'open-total',
  ].map(id => [id, document.getElementById(id).textContent])));
}
async function assertCompactViewport(page) {
  const viewport = page.viewportSize();
  const dimensions = await page.evaluate(() => ({width:document.documentElement.scrollWidth,
    height:document.documentElement.scrollHeight, x:window.scrollX, y:window.scrollY}));
  expect(dimensions.width, 'the game fits the document width').toBeLessThanOrEqual(viewport.width + 1);
  expect(dimensions.height, 'the active game owns its scrolling').toBeLessThanOrEqual(viewport.height + 1);
  expect(dimensions.x).toBe(0);
  expect(dimensions.y).toBe(0);
  for (const selector of ['.hud', '#character-button', '#pause-button']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${selector} is visible`).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}
async function assertDialogReachable(page, selector = '#character-dialog') {
  const dialog = page.locator(selector), viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  for (const control of await dialog.locator('button:not(:disabled)').all()) {
    if (!(await control.isVisible())) continue;
    await control.scrollIntoViewIfNeeded();
    await control.click({trial:true});
    await control.focus();
    await expect(control).toBeFocused();
    const buttonBox = await control.boundingBox();
    expect(buttonBox.x).toBeGreaterThanOrEqual(-1);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(buttonBox.y).toBeGreaterThanOrEqual(-1);
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  await assertCompactViewport(page);
}

const lobbyAdjust = (page, stat, amount) => page.locator(`[data-start-stat="${stat}"][data-stat-adjust="${amount}"]`);
const statValue = (page, area, stat) => page.locator(`${area} [data-stat="${stat}"] [data-stat-value]`);
const skill = (page, id) => page.locator(`#character-skills [data-skill="${id}"]`);
const gear = (page, id) => page.locator(`#character-gear [data-gear="${id}"]`);
async function expectBuild(page, {floor, level, skills = [], equipment = []}) {
  await expect(page.locator('#dungeon-floor')).toContainText(String(floor));
  await expect(page.locator('#dungeon-level')).toContainText(String(level));
  for (const id of skills) {
    await expect(skill(page, id)).toHaveAttribute('aria-pressed', 'true');
    await expect(skill(page, id)).toBeDisabled();
  }
  for (const id of equipment) {
    await expect(gear(page, id)).toHaveAttribute('aria-pressed', 'true');
    await expect(gear(page, id)).toBeDisabled();
  }
}

test('lobby has exactly two reversible stat points, and Technical changes actual repair time', async ({page}) => {
  await boot(page);
  for (const stat of ['technical', 'insight', 'composure', 'bullshit']) {
    await expect(statValue(page, '#lobby-stats', stat)).toHaveText('0');
    await expect(lobbyAdjust(page, stat, '-1')).toBeDisabled();
  }
  await lobbyAdjust(page, 'technical', '1').click();
  await lobbyAdjust(page, 'technical', '1').click();
  await expect(statValue(page, '#lobby-stats', 'technical')).toHaveText('2');
  for (const stat of ['technical', 'insight', 'composure', 'bullshit']) await expect(lobbyAdjust(page, stat, '1')).toBeDisabled();
  await lobbyAdjust(page, 'technical', '-1').click();
  await lobbyAdjust(page, 'insight', '1').click();
  await expect(statValue(page, '#lobby-stats', 'technical')).toHaveText('1');
  await expect(statValue(page, '#lobby-stats', 'insight')).toHaveText('1');
  await lobbyAdjust(page, 'insight', '-1').click();
  await lobbyAdjust(page, 'technical', '1').click();
  await start(page); await openCharacter(page);
  await expect(statValue(page, '#character-stats', 'technical')).toHaveText('2');
  await expect(statValue(page, '#character-stats', 'insight')).toHaveText('0');
  await expectBuild(page, {floor:1, level:1});
  await closeCharacter(page);
  await acknowledge(page); await action(page);
  const seconds = Number.parseFloat(await page.locator('#work-seconds').innerText());
  expect(seconds, 'two Technical points reduce the real 2.4-second repair').toBeLessThan(2.4);
  expect(seconds).toBeGreaterThan(0);
  await page.clock.fastForward(Math.ceil(seconds * 1000) + 200);
  await expect(page.locator('#time')).toHaveText('1 / 14');
  await expect(page.locator('#resolved-label')).toHaveText('1 ticket closed');
});

test('Insight speeds actual conversations and Composure reduces a wrong move’s morale loss', async ({page}) => {
  await boot(page);
  await lobbyAdjust(page, 'insight', '1').click();
  await lobbyAdjust(page, 'composure', '1').click();
  await start(page); await acknowledge(page);
  await action(page, 'wrong'); await page.clock.fastForward(2500);
  const morale = Number.parseFloat(await page.locator('#morale-number').innerText());
  expect(morale, 'Composure mitigates the ordinary ten-point penalty').toBeGreaterThan(90);
  expect(morale).toBeLessThan(100);
  await expect(page.locator('#time')).toHaveText('0 / 14');
  const source = await currentSource(page), question = source.investigations.find(item => item.kind === 'question');
  await page.locator('#contact-user-button').click();
  await page.locator(`[data-inquiry="${question.id}"]`).click();
  expect(Number.parseFloat(await page.locator('#work-seconds').innerText()), 'Insight changes actual conversation duration').toBeLessThan(2);
  await page.clock.fastForward(2100);
  await expect(page.locator('#case-notes')).toContainText(question.evidence);
  await fix(page);
  await expect(page.locator('#time')).toHaveText('1 / 14');
});

test('320px fictional inbox keeps its clock contract, grants one assist, and remembers a repaired evening promise', async ({page}, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await boot(page, {width:320, height:740}); await start(page); await acknowledge(page);
  const ticket = await page.locator('#ticket-detail').getAttribute('data-selected-ticket');
  await page.locator('#inbox-button').click();
  await expect(page.locator('#inbox-dialog')).toBeVisible();
  await expect(page.locator('#inbox-dialog')).toContainText(/fictional work chat/i);
  const before = await slaSeconds(page);
  for (const key of ['1', '2', '3', 'a', 'q', 'e']) await page.keyboard.press(key);
  await page.clock.fastForward(5100);
  expect(await slaSeconds(page), 'the inbox explicitly keeps work SLA clocks running').toBeLessThan(before);
  await expect(page.locator('#work-status')).toBeHidden();
  await expect(page.locator('#ticket-detail')).toHaveAttribute('data-selected-ticket', ticket);
  await expect(page.locator('#score')).toHaveText('0');
  await assertDialogReachable(page, '#inbox-dialog');
  await page.locator('#close-inbox-button').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('fictional-inbox.png'), fullPage:true});
  const reply = (message, choice) => page.locator(`[data-message="${message}"][data-message-choice="${choice}"]`);
  await reply('mira-thread', 'check-facts').click();
  await expect(page.locator('#inbox-count')).toHaveText('1');
  await expect(page.locator('#assist-count')).toContainText('4 left');
  await expect(page.locator('#inbox-result')).toContainText('DNS museum');
  await expect(page.locator('[data-message="mira-thread"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#inbox-dialog')).not.toBeVisible();
  await expect(page.locator('#inbox-button')).toBeFocused();
  await page.locator('#inbox-button').click();
  await expect(page.locator('.message-reply')).toContainText('Facts have entered the chat');
  await expect(page.locator('#assist-count')).toContainText('4 left');
  await reply('rowan-plan', 'promise-tea').click();
  await expect(page.locator('#inbox-count')).toHaveText('0');
  await expect(page.locator('[data-message-choice]')).toHaveCount(0);
  await page.keyboard.press('p');
  await expect(page.locator('#inbox-dialog')).not.toBeVisible();
  await expect(page.locator('#pause-dialog')).toBeVisible();
  const paused = await clockSnapshot(page);
  await page.clock.fastForward(60000);
  expect(await clockSnapshot(page)).toEqual(paused);
  await page.locator('#quit-button').click();
  await expect(page.locator('#result-status')).toHaveText('SHIFT ENDED EARLY');
  await page.locator('#go-home-button').click();
  await expect(page.locator('#next-day-button')).toBeDisabled();
  await page.locator('[data-evening="packet"]').click();
  await expect(page.locator('#conversation-context')).toContainText(/promised Rowan quiet tea/i);
  await expect(page.locator('[data-conversation="remember"]')).toHaveCount(0);
  await expect(page.locator('[data-conversation="keep-small"]')).toBeEnabled();
  await page.locator('[data-conversation="check-in"]').click();
  await expect(page.locator('#conversation-result')).toContainText(/no automatic promise tomorrow/i);
  await page.locator('#next-day-button').click();
  await expect(page.locator('#game')).toBeVisible();
  await page.locator('#inbox-button').click();
  await expect(page.locator('#inbox-dialog')).toContainText('Yesterday you checked the facts with me');
  await expect(page.locator('#inbox-dialog')).toContainText('Thanks for checking what I meant yesterday');
  await expect(reply('mira-thread', 'check-facts')).toBeEnabled();
  await expect(reply('rowan-plan', 'promise-tea')).toBeEnabled();
  await expect(page.locator('#assist-count')).toContainText('3 left');
  await reply('mira-thread', 'back-claim').click();
  await expect(page.locator('#inbox-result')).toContainText(/Tomorrow’s audit may confirm or contradict/i);
  await expect(page.locator('#assist-count')).toContainText('3 left');
  await page.locator('#close-inbox-button').click();
  await page.locator('#pause-button').click();
  await page.locator('#quit-button').click();
  await page.locator('#go-home-button').click();
  await page.locator('[data-evening="rest"]').click();
  await page.locator('[data-conversation="remember"]').click();
  await page.locator('#next-day-button').click();
  await expect(page.locator('#outcome')).toContainText(/audit (confirms|contradicts) it/i);
  await expect(page.locator('#outcome')).toContainText(/backed Mira’s claim before the evidence arrived/i);
  await expect(page.locator('#assist-count')).toContainText(/(2|4) left/);
  await page.screenshot({path:testInfo.outputPath('delayed-morning-consequence.png'), fullPage:true});
  await page.clock.fastForward(5000);
  await page.locator('#inbox-button').click();
  await expect(page.locator('[data-morning-briefing]')).toContainText(/audit (confirms|contradicts) it/i);
  await expect(page.locator('[data-morning-briefing]')).toContainText(/backed Mira’s claim before the evidence arrived/i);
  await expect(page.locator('[data-morning-briefing]')).toContainText(/starting morale|start with/i);
  await expect(page.locator('[data-morning-briefing]')).toContainText(/workday.*handed/i);
  await page.screenshot({path:testInfo.outputPath('persistent-morning-briefing.png'), fullPage:true});
  await page.locator('#close-inbox-button').click();
  await assertCompactViewport(page);
  expect(errors).toEqual([]);
});

for (const viewport of [{width:1440, height:900}, {width:390, height:844}]) {
  test(`${viewport.width}px earns three floors, keeps stat/skill/gear choices, and recaps the build and bosses`, async ({page}, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const faker = viewport.width === 390;
    const build = faker
      ? {first:'jargon-juggler', second:'credible-nonsense', otherBranch:'room-reader', locked:'cross-examiner', sibling:'executive-fog', names:['Jargon Juggler', 'Credible Nonsense']}
      : {first:'field-technician', second:'scope-surgeon', otherBranch:'systems-engineer', locked:'rollback-architect', sibling:'hot-swap-savant', names:['Field Technician', 'Scope Surgeon']};
    await boot(page, viewport);
    if (faker) await page.locator('#faker-class').click();
    await start(page);
    await openCharacter(page);
    await expectBuild(page, {floor:1, level:1});
    // Unspent lobby points are banked. Spending them in Character must also
    // consume the same finite pool and survive later floor rewards.
    await page.locator('[data-level-stat="composure"]').click();
    await page.locator(`[data-level-stat="${faker ? 'bullshit' : 'composure'}"]`).click();
    await expect(statValue(page, '#character-stats', 'composure')).toHaveText(faker ? '1' : '2');
    if (faker) await expect(statValue(page, '#character-stats', 'bullshit')).toHaveText('1');
    await expect(page.locator('[data-level-stat="composure"]')).toBeDisabled();
    await expect(skill(page, build.first)).toBeDisabled();
    await expect(skill(page, build.second)).toBeDisabled();
    await expect(gear(page, 'duct-tape-codex')).toBeDisabled();
    await expect(gear(page, 'rollback-cape')).toBeDisabled();
    await closeCharacter(page);
    const normalIds = new Set(), bossStages = new Set();
    let baseRepairSeconds, upgradedRepairSeconds, chosenSecond = false, chosenThird = false, earnedBluff = false;
    for (let step = 0; step < 20 && await page.locator('#game').isVisible(); step++) {
      await deferAvailableProjects(page);
      if (!(await ready(page))) break;
      const source = await currentSource(page);
      if (TICKETS.some(item => item.id === source.id)) {
        expect(normalIds.has(source.id), 'a fixed routine ticket never reappears').toBe(false);
        normalIds.add(source.id);
      } else {
        bossStages.add(source.id);
        await expect(page.locator('#boss-reaction')).toBeVisible();
        await expect(page.locator('#boss-reaction')).toContainText(/notices|build|safety/i);
        await expect(page.locator('#boss-reaction')).toContainText(/0 tested releases?/i);
      }
      await acknowledge(page);
      if (faker && source.id === BOSSES[1].stages[0].id) {
        const progress = await page.locator('#time').innerText(), stage = await page.locator('#boss-status').innerText();
        const beforeSla = await slaSeconds(page), beforeScore = Number((await page.locator('#score').innerText()).replaceAll(',', ''));
        await page.locator('#bluff-button').click(); await page.clock.fastForward(900);
        await expect(page.locator('#bluff-button')).toBeDisabled();
        await expect(page.locator('#time')).toHaveText(progress);
        await expect(page.locator('#boss-status')).toHaveText(stage, {useInnerText:true});
        expect(await slaSeconds(page), 'earned bluff skills buy more than the original ten seconds').toBeGreaterThan(beforeSla + 10);
        expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBeGreaterThan(beforeScore + 175);
        earnedBluff = true;
      }
      await action(page);
      const seconds = Number.parseFloat(await page.locator('#work-seconds').innerText());
      if (baseRepairSeconds === undefined) baseRepairSeconds = seconds;
      else if (chosenSecond && upgradedRepairSeconds === undefined) upgradedRepairSeconds = seconds;
      await page.clock.fastForward(2500);
      if (normalIds.size === 4 && !chosenSecond) {
        chosenSecond = true;
        await expect(page.locator('#character-button')).toContainText(/Floor 2/i);
        await openCharacter(page);
        await expectBuild(page, {floor:2, level:2});
        await expect(skill(page, build.second)).toBeDisabled();
        await expect(gear(page, 'rollback-cape')).toBeDisabled();
        await page.locator('[data-level-stat="technical"]').click();
        await skill(page, build.first).click();
        await gear(page, 'duct-tape-codex').click();
        await expect(statValue(page, '#character-stats', 'technical')).toHaveText('1');
        await expect(page.locator('[data-level-stat="technical"]')).toBeDisabled();
        await expect(skill(page, build.otherBranch)).toBeDisabled();
        await expect(skill(page, build.second)).toBeDisabled();
        await expect(gear(page, 'empathy-headset')).toBeDisabled();
        await expectBuild(page, {floor:2, level:2, skills:[build.first], equipment:['duct-tape-codex']});
        await assertDialogReachable(page);
        await page.locator('#close-character-button').scrollIntoViewIfNeeded();
        await page.screenshot({path:testInfo.outputPath('floor-2-character.png'), fullPage:true});
        await closeCharacter(page); await openCharacter(page);
        await expectBuild(page, {floor:2, level:2, skills:[build.first], equipment:['duct-tape-codex']});
        await closeCharacter(page);
      }
      if (normalIds.size === 8 && !chosenThird) {
        chosenThird = true;
        await expect(page.locator('#character-button')).toContainText(/Floor 3/i);
        await openCharacter(page);
        await expectBuild(page, {floor:3, level:3, skills:[build.first], equipment:['duct-tape-codex']});
        await expect(skill(page, build.locked)).toBeDisabled();
        await page.locator('[data-level-stat="insight"]').click();
        await skill(page, build.second).click();
        await gear(page, 'rollback-cape').click();
        await expect(skill(page, build.sibling)).toBeDisabled();
        await expect(gear(page, 'ceremonial-blazer')).toBeDisabled();
        await expect(statValue(page, '#character-stats', 'technical')).toHaveText('1');
        await expect(statValue(page, '#character-stats', 'insight')).toHaveText('1');
        await expectBuild(page, {floor:3, level:3, skills:[build.first, build.second], equipment:['duct-tape-codex', 'rollback-cape']});
        await expect(page.locator('#dungeon-journal')).toContainText(/floor/i);
        await page.screenshot({path:testInfo.outputPath('floor-3-character.png'), fullPage:true});
        await closeCharacter(page, 'escape');
        await openDesk(page, 'training'); await openDesk(page, 'inc');
        await openCharacter(page);
        await expectBuild(page, {floor:3, level:3, skills:[build.first, build.second], equipment:['duct-tape-codex', 'rollback-cape']});
        await closeCharacter(page);
        await assertCompactViewport(page);
        await page.screenshot({path:testInfo.outputPath('floor-3-desk.png'), fullPage:true});
      }
    }
    expect(chosenSecond).toBe(true); expect(chosenThird).toBe(true);
    if (faker) expect(earnedBluff).toBe(true);
    expect(normalIds.size).toBe(12); expect(bossStages.size).toBe(4);
    expect(upgradedRepairSeconds, 'the earned build changes real work duration').toBeLessThan(baseRepairSeconds);
    await expect(page.locator('#results')).toBeVisible();
    await expect(page.locator('#result-status')).toHaveText('SHIFT COMPLETE');
    await expect(page.locator('#result-fixed')).toHaveText('14');
    await expect(page.locator('#result-breakdown')).toContainText('0 missed · 0 wrong moves');
    await expect(page.locator('#result-breakdown')).toContainText('Bosses defeated: 2/2');
    await expect(page.locator('#result-breakdown')).toContainText('Incidents: 0 recovered · 0 missed · 0 prevented');
    for (const name of [...build.names, 'Duct Tape Codex', 'Rollback Cape']) {
      await expect(page.locator('#dungeon-summary')).toContainText(new RegExp(name.replaceAll(' ', '[ -]'), 'i'));
    }
    for (const boss of BOSSES) await expect(page.locator('#dungeon-summary')).toContainText(boss.title);
    await expect(page.locator('#dungeon-summary')).toContainText(PROJECTS[0].title);
    await expect(page.locator('#dungeon-summary')).toContainText(/deferred|defer/i);
    await page.screenshot({path:testInfo.outputPath('dungeon-recap.png'), fullPage:true});

    // A cleared dungeon is one workday, not the end of the character's run.
    await page.locator('#go-home-button').click();
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('#game')).toBeHidden();
    await expect(page.locator('#next-day-button')).toBeDisabled();
    const clockedOut = await clockSnapshot(page);
    await page.clock.fastForward(8 * 60 * 60 * 1000);
    expect(await clockSnapshot(page)).toEqual(clockedOut);
    const evening = faker ? 'packet' : 'study';
    await page.locator(`[data-evening="${evening}"]`).click();
    await expect(page.locator('#next-day-button')).toBeDisabled();
    for (const option of await page.locator('[data-evening]').all()) await expect(option).toBeDisabled();
    await expect(page.locator('#evening-result')).toContainText(faker ? /Packet/ : /assist next morning/i);
    await expect(page.locator('#conversation-context')).toContainText(/quiet company|ask before/i);
    await page.locator('[data-conversation="remember"]').click();
    for (const option of await page.locator('[data-conversation]').all()) await expect(option).toBeDisabled();
    await expect(page.locator('#conversation-result')).toContainText(/listening|whole story/i);
    await expect(page.locator('#next-day-button')).toBeEnabled();
    await page.screenshot({path:testInfo.outputPath('home-evening.png'), fullPage:true});
    await page.locator('#next-day-button').click();
    await expect(page.locator('#home')).toBeHidden();
    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('#time')).toHaveText('0 / 14');
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#morale-number')).toHaveText(faker ? '99%' : '94%');
    await expect(page.locator('#assist-count')).toContainText(faker ? '3 left' : '4 left');
    await expect(page.locator('#sla-time')).toHaveText('Not started');
    await openCharacter(page);
    await expectBuild(page, {floor:1, level:3, skills:[build.first, build.second], equipment:['duct-tape-codex', 'rollback-cape']});
    await expect(statValue(page, '#character-stats', 'technical')).toHaveText('1');
    await expect(statValue(page, '#character-stats', 'insight')).toHaveText('1');
    await expect(statValue(page, '#character-stats', 'composure')).toHaveText(faker ? '1' : '2');
    if (faker) await expect(statValue(page, '#character-stats', 'bullshit')).toHaveText('1');
    await page.screenshot({path:testInfo.outputPath('next-day-character.png'), fullPage:true});
    await closeCharacter(page);
    await page.locator('#inbox-button').click();
    await expect(page.locator('#inbox-dialog')).toContainText('Reply-all is not a root-cause analysis');
    await expect(page.locator('#inbox-dialog')).toContainText('Yesterday felt good');
    await page.locator('#close-inbox-button').click();
    await fix(page);
    await expect(page.locator('#time')).toHaveText('1 / 14');
    await assertCompactViewport(page);
    expect(errors).toEqual([]);
  });
}

for (const viewport of [{width:320, height:740}, {width:844, height:390}]) {
  test(`${viewport.width}px Character pauses SLA, arrivals and work; shortcuts cannot act through it`, async ({page}, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await boot(page, viewport); await start(page); await acknowledge(page);
    const selected = await page.locator('#ticket-detail').getAttribute('data-selected-ticket');
    const source = await currentSource(page), diagnostic = source.investigations.find(item => item.kind === 'diagnostic');
    await page.locator('#diagnostics-button').click();
    await page.locator(`[data-inquiry="${diagnostic.id}"]`).click();
    await page.clock.fastForward(500);
    await openCharacter(page);
    const paused = await clockSnapshot(page);
    for (const key of ['a', '1', '2', '3', 'q', 'e', 'p']) await page.keyboard.press(key);
    await page.clock.fastForward(180000);
    expect(await clockSnapshot(page)).toEqual(paused);
    await expect(page.locator('#ticket-detail')).toHaveAttribute('data-selected-ticket', selected);
    await expect(page.locator('#character-dialog')).toBeVisible();
    await expect(page.locator('#case-notes .evidence-item')).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable:true, get:() => true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(60000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable:true, get:() => false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#character-dialog')).toBeVisible();
    expect(await clockSnapshot(page)).toEqual(paused);
    await assertDialogReachable(page);
    await page.locator('#close-character-button').scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath('character-paused.png'), fullPage:true});
    await closeCharacter(page, 'escape');
    expect(await clockSnapshot(page)).toEqual(paused);
    await page.clock.fastForward(4100);
    await expect(page.locator('#work-status')).toBeHidden();
    await expect(page.locator('#case-notes')).toContainText(diagnostic.evidence);
    expect(await slaSeconds(page)).toBeLessThan(900);
    await openCharacter(page); const reopened = await clockSnapshot(page);
    await page.clock.fastForward(60000);
    expect(await clockSnapshot(page)).toEqual(reopened);
    await closeCharacter(page);
    await fix(page);
    await expect(page.locator('#time')).toHaveText('1 / 14');
    await expect(page.locator('#resolved-label')).toHaveText('1 ticket closed');
    await assertCompactViewport(page);
    expect(errors).toEqual([]);
  });
}

test('Character also freezes pending project risks and workaround returns, then resumes both', async ({page}) => {
  await boot(page); await start(page); await acknowledge(page);
  const title = await page.locator('#ticket-title').innerText();
  const ticketTab = await page.locator('[data-desk-tab][aria-selected="true"]').getAttribute('data-desk-tab');
  await action(page, 'patch'); await page.clock.fastForward(900);
  await openDesk(page, 'projects');
  await projectButton(page, PROJECTS[0].id, 'unsafeRelease').click();
  await page.clock.fastForward(2100);
  await openDesk(page, 'ktlo');
  const timer = page.locator('[data-risk-time]').first();
  await expect(timer).toHaveText(/0:5\d|1:00/);
  await openCharacter(page);
  const paused = await clockSnapshot(page), riskTime = await timer.innerText();
  await page.clock.fastForward(180000);
  expect(await clockSnapshot(page)).toEqual(paused);
  await expect(timer).toHaveText(riskTime);
  await closeCharacter(page);
  await page.clock.fastForward(10000);
  expect(await timer.innerText()).not.toBe(riskTime);
  await openDesk(page, ticketTab);
  await page.locator('#queue [data-ticket]').filter({hasText:title}).click();
  await expect(page.locator('#ticket-title')).toHaveText(title);
  await expect(page.locator('#acknowledge-button')).toBeHidden();
  expect(await slaSeconds(page)).toBeGreaterThan(880);
  await page.clock.fastForward(51000);
  await openDesk(page, 'inc');
  await expect(page.locator('#queue [data-ticket]').filter({hasText:'SEV 2'})).toHaveCount(1);
  await expect(page.locator('#time')).toHaveText('0 / 14');
});
