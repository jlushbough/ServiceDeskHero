import {test,expect} from '@playwright/test';
import {TICKETS} from '../js/rush-tickets.js';
async function boot(page,viewport){await page.setViewportSize(viewport);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.clock.install({time:new Date('2026-10-01T12:00:00Z')});
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-01T12:00:02Z'));}
async function tab(page,id,filter='active'){await page.locator(`[data-desk-tab="${id}"]`).click();
  await page.locator(`[data-desk-filter="${filter}"]`).click();}
async function home(page){await page.locator('#pause-button').click();
  await page.locator('#quit-button').click();
  await page.locator('#go-home-button').click();}
for(const [name,viewport] of Object.entries({desktop:{width:1440,height:900},mobile:{width:390,height:844}})){
 test(`${name}: repair durations give no answer and evidence earns bounded credit`,async({page})=>{
  await boot(page,viewport);
  await page.locator('[data-start-stat="technical"][data-stat-adjust="1"]').click();
  await page.locator('#start-button').click();
  await page.locator('#acknowledge-button').click();
 const title=await page.locator('#ticket-title').innerText();
 const source=TICKETS.find(t=>t.title===title);
  const duration=kind=>page.locator('#actions button').filter({hasText:source.actions.find(a=>a.kind===kind).label}).locator('.action-duration');
  await expect(duration('fix')).toHaveText(await duration('wrong').innerText());
  await page.locator('#diagnostics-button').click();
  await page.locator('[data-inquiry]').filter({hasText:source.investigations.find(q=>q.kind==='diagnostic').label}).click();
  await page.clock.fastForward(5000);
  await page.locator('#fix-view-button').click();
  await page.locator('#actions button').filter({hasText:source.actions.find(a=>a.kind==='fix').label}).click();
  await page.clock.fastForward(2500);
  await expect(page.locator('#outcome')).toContainText('Evidence-backed diagnosis +25');
  await page.screenshot({path:`test-results/reliability-${name}.png`});
 });
 test(`${name}: empty active views cannot acknowledge or act on an unseen case`,async({page})=>{
  await boot(page,viewport);
  await page.locator('#start-button').click();
 const originalTab=await page.locator('[data-desk-tab][aria-selected="true"]').getAttribute('data-desk-tab');
 const empty=originalTab==='inc'?'req':'inc';
 const score=await page.locator('#score').innerText();
  await tab(page,empty);
  await expect(page.locator('#empty-ticket')).toBeVisible();
  await page.keyboard.press('a');
 for(const key of ['1','2','3'])await page.keyboard.press(key);
  await tab(page,originalTab);
  await expect(page.locator('#sla-time')).toHaveText('Not started');
  await expect(page.locator('#score')).toHaveText(score);
  await page.locator('#acknowledge-button').click();
  await tab(page,empty);
 for(const key of ['1','2','3'])await page.keyboard.press(key);
  await expect(page.locator('#score')).toHaveText(score);
  await tab(page,originalTab);
  await expect(page.locator('#work-status')).toBeHidden();
  await expect(page.locator('#sla-time')).toHaveText('15:00');
 });
 test(`${name}: tea promise keeps the original dialogue and exact selected response`,async({page})=>{
  await boot(page,viewport);
  await page.locator('#start-button').click();
  await page.locator('#inbox-button').click();
  await page.locator('[data-message-choice="promise-tea"]').click();
  await page.locator('#close-inbox-button').click();
  await home(page);
  await page.locator('[data-evening="rest"]').click();
 const title=await page.locator('#conversation-title').innerText();
 const choice=await page.locator('[data-conversation="keep-small"]').innerText();
  await page.locator('[data-conversation="keep-small"]').click();
  await expect(page.locator('#conversation-title')).toHaveText(title);
  await expect(page.locator('[data-conversation="keep-small"]')).toHaveText(choice,{useInnerText:true});
  await expect(page.locator('[data-conversation="keep-small"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#conversation-options [aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('#next-day-button')).toBeEnabled();
 });
 test(`${name}: Mira supplies a real note without same-day yesterday text`,async({page})=>{
  await boot(page,viewport);
  await page.locator('#start-button').click();
 for(let day=1;day<=2;day++){await page.locator('#inbox-button').click();
  await page.locator('[data-message-choice="check-facts"]').click();
 const body=page.locator('#inbox-messages article').first();
  await expect(body).toContainText('Diagnostic note:');
  await expect(body).not.toContainText('Yesterday you checked');
  await page.locator('#close-inbox-button').click();
  await home(page);
  await page.locator('[data-evening="rest"]').click();
  await page.locator('[data-conversation="remember"]').click();
  await page.locator('#next-day-button').click();}await page.locator('#inbox-button').click();
  await expect(page.locator('[data-morning-briefing]')).toContainText('fresh diagnostic note');
  await expect(page.locator('#inbox-messages article').first()).toContainText('Diagnostic note:');
 });
 test(`${name}: failed incident action never announces successful recovery morale`,async({page})=>{
  await boot(page,viewport);
  await page.locator('#start-button').click();
  await tab(page,'projects');
  await page.locator('[data-project="portal-rollout"][data-project-action="unsafeRelease"]').click();
  await page.clock.fastForward(62000);
  await tab(page,'inc');
  await page.locator('#queue [data-ticket]').filter({hasText:'The portal has left the building'}).click();
  await page.locator('#acknowledge-button').click();
  await page.locator('#actions button').filter({hasText:'Silence the service alarm'}).click();
  await page.clock.fastForward(2500);
  await expect(page.locator('#outcome')).toContainText('-10 morale');
  await expect(page.locator('#outcome')).not.toContainText('+10 morale');
  await page.locator('#actions button').filter({hasText:'Stop rollout, restore known-good version, and verify'}).click();
  await page.clock.fastForward(2500);
  await expect(page.locator('#outcome')).toContainText('+10 morale');
  await tab(page,'projects','resolved');
  await expect(page.locator('#projects')).toContainText('Incident recovered');
  await expect(page.locator('#projects')).not.toContainText('recovery required');
 });
 test(`${name}: missed incident history explicitly records recovery still pending`,async({page})=>{
  await boot(page,viewport);
  await page.locator('#start-button').click();
  await tab(page,'projects');
  await page.locator('[data-project="portal-rollout"][data-project-action="unsafeRelease"]').click();
  await page.clock.fastForward(242100);
  await tab(page,'inc','resolved');
  await page.locator('[data-history-ticket]').filter({hasText:'The portal has left the building'}).click();
  await expect(page.locator('#history-status')).toContainText('restoration is still pending');
  await expect(page.locator('#history-status')).toContainText('No recovery reward');
  await tab(page,'projects','resolved');
  await expect(page.locator('#projects')).toContainText('Recovery handed off');
 });
}
