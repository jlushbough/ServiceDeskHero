import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createGame, startProject, cancelWork, PROJECTS, PROJECT_ACTIONS, acknowledgeTicket, advance, takeAction, investigateTicket, skipIdle, selectTicket, drainEvents, getRank,
  seededRandom, TOTAL_NORMAL, SLA_SECONDS, ARRIVAL_SECONDS, INVESTIGATIONS, ACTIONS, CLASSES, ACHIEVEMENTS, BOSSES,
} from '../js/rush-engine.js';
import { TICKETS } from '../js/rush-tickets.js';

const selected = g => g.queue.find(t => t.id === g.selected);
const snapshot = g => JSON.parse(JSON.stringify(g));
function deferProjects(g) { for(const p of g.projects) if(p.status==='pending') startProject(g,p.id,'defer'); }
function ready(g) {
  deferProjects(g);
  if (!selected(g) && g.status === 'playing') assert.equal(skipIdle(g), true, 'idle shift advances to a scheduled report');
  return selected(g);
}
const indexFor = (g, kind) => selected(g).actions.findIndex(a => a.kind === kind);
function acknowledge(g) {
  const ticket = ready(g);
  assert.ok(ticket, 'an issue is available');
  if (!ticket.acknowledged) assert.equal(acknowledgeTicket(g, ticket.id), true);
  return ticket;
}
function act(g, kind = 'fix', chunks = 1) {
  acknowledge(g);
  const action = kind === 'assist' || kind === 'bluff' ? kind : indexFor(g, kind);
  assert.equal(takeAction(g, action), true, `${kind} must start`);
  for (let i = 0; i < chunks; i++) advance(g, ACTIONS[kind].seconds / chunks);
}
function reachBoss(which = 0, classId = 'engineer') {
  const g = createGame('boss-tests', false, classId), id = BOSSES[which].id;
  for (let n = 0; n < 20 && ready(g)?.bossId !== id; n++) act(g);
  assert.equal(selected(g)?.bossId, id);
  return g;
}
function doProject(g,id,action) {
  assert.equal(startProject(g,id,action),true, `${id} ${action}`);
  if(PROJECT_ACTIONS[action]) advance(g,PROJECT_ACTIONS[action]);
}
function reachSev1(classId = 'engineer') {
  const g = createGame('sev1-tests', false, classId);
  doProject(g,PROJECTS[0].id,'unsafeRelease'); advance(g,60);
  selectTicket(g,g.queue.find(t=>t.incident).id); act(g);
  // ready() defers projects in legacy helpers, so restore the second pending project for this targeted flow.
  while(g.normalFixes<8) act(g);
  g.projects[1].status='pending';
  doProject(g,PROJECTS[1].id,'unsafeRelease'); advance(g,60);
  selectTicket(g,g.queue.find(t=>t.incident&&!t.resolution).id);
  assert.equal(selected(g).severity,1); return g;
}
function finishClean(g = createGame('clean-shift'), chunks = 1) {
  for (let n = 0; g.status === 'playing' && n < 30; n++) { deferProjects(g); if(g.status==='playing') act(g, 'fix', chunks); }
  assert.equal(g.status, 'finished', 'the finite queue must end without an elapsed-round limit');
  return g;
}

test('default shift starts with one unacknowledged Sev 3 issue and a finite content budget', () => {
  const g = createGame(), ticket = selected(g);
  assert.equal(g.queue.length, 1); assert.equal(g.status, 'playing');
  assert.equal(g.classId, 'engineer'); assert.equal(g.time, 0); assert.equal(g.morale, 100);
  assert.equal(g.assists, 3); assert.equal(TOTAL_NORMAL, 12); assert.equal(g.totalNormal, 12);
  assert.equal(g.reportedNormal, 1); assert.equal(g.completedNormal, 0); assert.equal(g.normalFixes, 0);
  assert.equal(ticket.severity, 3); assert.equal(ticket.acknowledged, false);
  assert.equal(ticket.acknowledgedAt, null); assert.equal(ticket.deadline, null);
  assert.equal(ticket.reportedAt, 0); assert.equal(ticket.slaSeconds, 900);
  assert.deepEqual(SLA_SECONDS, {3: 900, 2:180, 1: 60});
  assert.equal(createGame('s', false, 'missing').classId, 'engineer');
});

test('unacknowledged Sev 3 remains open indefinitely while the entire normal queue accumulates without overflow', () => {
  const g = createGame(), ticket = selected(g), score = g.score;
  drainEvents(g); advance(g, 3600);
  assert.equal(g.time, 3600); assert.equal(g.status, 'playing');
  assert.equal(g.queue[0], ticket); assert.equal(g.queue.length, 12); assert.equal(g.reportedNormal, 12);
  assert.equal(g.nextArrival, null); assert.ok(g.queue.every(t => t.severity === 3 && t.deadline === null));
  assert.equal(ticket.deadline, null); assert.equal(g.missed, 0); assert.equal(g.score, score);
  assert.equal(g.morale, 100); assert.equal(g.bossesDefeated, 0);
  assert.equal(drainEvents(g).filter(e => e.type === 'arrival').length, 11);
});

test('Sev 3 ACK starts exactly 900 seconds and duplicate or stale ACK cannot refresh it', () => {
  const g = createGame(); advance(g, 1200);
  const t = selected(g);
  assert.equal(acknowledgeTicket(g, -1), false);
  assert.equal(acknowledgeTicket(g, t.id), true);
  assert.equal(t.acknowledgedAt, 1200); assert.equal(t.deadline, 2100);
  advance(g, 10); assert.equal(acknowledgeTicket(g, t.id), false);
  assert.equal(t.acknowledgedAt, 1200); assert.equal(t.deadline, 2100);
  advance(g, 889.999); assert.equal(g.missed, 0);
  advance(g, 0.001); assert.equal(g.missed, 1);
});

test('every response requires ACK, including shortcuts and boss bluff', () => {
  const g = createGame();
  for (const action of [0, 1, 2, 'assist', 'bluff']) assert.equal(takeAction(g, action), false);
  assert.equal(g.work, null); assert.equal(g.assists, 3);
  const boss = reachBoss(0, 'faker');
  for (const action of [0, 1, 2, 'bluff']) assert.equal(takeAction(boss, action), false);
  assert.equal(boss.bluffs, 0);
});

test('a real fix counts once and waits for the independently scheduled next issue', () => {
  const g = createGame(), originalId = selected(g).id; act(g);
  assert.equal(g.queue.length, 0); assert.equal(g.selected, null);
  assert.equal(g.completedNormal, 1); assert.equal(g.reportedNormal, 1);
  assert.equal(g.normalFixes, 1); assert.equal(g.fixes, 1); assert.equal(g.resolved, 1);
  assert.equal(g.score, 150 + 25 + 25 + 100); assert.equal(g.streak, 1);
  assert.equal(ready(g).acknowledged, false); assert.equal(selected(g).deadline, null);
  assert.equal(g.achievements.filter(a => a.id === 'firstfix').length, 1);
  assert.ok(drainEvents(g).some(e => e.type === 'achievement' && e.id === 'firstfix'));
  assert.equal(takeAction(g, 'assist', originalId), false);
});

test('wrong moves leave the same issue and clock open without advancing progress', () => {
  const g = createGame(), t = acknowledge(g), index = indexFor(g, 'wrong'), deadline = t.deadline;
  assert.equal(takeAction(g, index), true); advance(g, ACTIONS.wrong.seconds);
  assert.equal(g.wrong, 1); assert.equal(g.morale, 90); assert.equal(g.score, 0);
  assert.equal(selected(g).id, t.id); assert.equal(t.deadline, deadline);
  assert.equal(g.completedNormal, 0); assert.equal(g.reportedNormal, 1); assert.equal(g.normalFixes, 0);
  assert.equal(t.actions[index].tried, true); assert.equal(takeAction(g, index), false);
  act(g); assert.equal(g.completedNormal, 1);
});

test('one patch returns the same ACKed issue after 11 seconds, retaining its clock and progress', () => {
  const g = createGame(), t = acknowledge(g), deadline = t.deadline, ack = t.acknowledgedAt;
  act(g, 'patch');
  assert.equal(g.patches, 1); assert.equal(g.score, 55); assert.equal(g.queue.length, 0);
  assert.equal(g.completedNormal, 0); assert.equal(g.resolved, 0); assert.equal(g.reportedNormal, 1);
  assert.equal(g.returns.length, 1); assert.equal(g.returns[0].at, 11.8);
  advance(g, 10.999); assert.equal(g.queue.length, 0);
  advance(g, 0.001);
  const returned = selected(g);
  assert.equal(returned.id, t.id); assert.equal(returned.rootId, t.rootId);
  assert.equal(returned.reportedAt, t.reportedAt); assert.equal(returned.source, t.source);
  assert.equal(returned.acknowledged, true); assert.equal(returned.acknowledgedAt, ack);
  assert.equal(returned.deadline, deadline); assert.equal(returned.patchUsed, true);
  assert.equal(returned.reopened, true); assert.equal(g.returns.length, 0);
  assert.equal(takeAction(g, indexFor(g, 'patch')), false);
  act(g); assert.equal(g.completedNormal, 1); assert.equal(g.normalFixes, 1);
});

test('a patched issue can miss its original SLA before returning, exactly once', () => {
  const g = createGame(), t = acknowledge(g); advance(g, 898.5); act(g, 'patch');
  assert.equal(g.returns.length, 1); drainEvents(g); advance(g, 0.7);
  assert.equal(g.missed, 1); assert.equal(g.completedNormal, 1); assert.equal(g.returns.length, 0);
  assert.notEqual(selected(g).id, t.id); assert.equal(selected(g).acknowledged, false);
  const expiry = drainEvents(g).filter(e => e.type === 'expired');
  assert.equal(expiry.length, 1); assert.equal(expiry[0].id, t.id);
  advance(g, 20); assert.equal(g.missed, 1); assert.equal(g.reportedNormal, 12);
});

test('assists close an ordinary issue without awarding a real fix or allowing unlimited use', () => {
  const g = createGame(); act(g, 'assist');
  assert.equal(g.assists, 2); assert.equal(g.assisted, 1); assert.equal(g.score, 75);
  assert.equal(g.fixes, 0); assert.equal(g.normalFixes, 0); assert.equal(g.resolved, 1); assert.equal(g.completedNormal, 1);
  act(g, 'assist'); act(g, 'assist'); acknowledge(g);
  assert.equal(takeAction(g, 'assist'), false);
  const boss = reachBoss(); acknowledge(boss); assert.equal(takeAction(boss, 'assist'), false);
});

test('printer becomes eligible after four completions and takes the next scheduled arrival slot', () => {
  const g = createGame();
  for (let n = 0; n < 3; n++) act(g);
  ready(g); assert.equal(g.completedNormal, 3); assert.equal(selected(g).boss, undefined);
  const scheduled = g.nextArrival;
  act(g); assert.equal(g.completedNormal, 4); assert.equal(g.queue.length, 0);
  assert.equal(g.bossStatus[BOSSES[0].id], 'pending'); assert.equal(g.nextArrival, scheduled);
  advance(g, scheduled - g.time - 0.001); assert.equal(g.queue.length, 0);
  advance(g, 0.001); const t = selected(g);
  assert.equal(g.reportedNormal, 4); assert.equal(t.bossId, BOSSES[0].id);
  assert.equal(t.stage, 1); assert.equal(t.stageCount, 2); assert.equal(t.techSkill, 8);
  assert.equal(t.severity, 3); assert.equal(t.deadline, null); assert.equal(g.sev1Unlocked, false);
});

test('both boss stages carry one ACK and one deadline; the first stage is not a closed issue', () => {
  const g = reachBoss(), t = acknowledge(g), originalId = t.id, source = t.source, deadline = t.deadline;
  const completed = g.completedNormal, fixes = g.fixes, resolved = g.resolved;
  act(g); assert.equal(t.stage, 2); assert.notEqual(t.source, source);
  assert.equal(t.id, originalId); assert.equal(t.acknowledged, true); assert.equal(t.deadline, deadline);
  assert.equal(g.bossStagesCleared, 1); assert.equal(g.bossesDefeated, 0);
  assert.equal(g.completedNormal, completed); assert.equal(g.fixes, fixes); assert.equal(g.resolved, resolved);
  assert.equal(takeAction(g, indexFor(g, 'fix'), t.id, 1), false);
  act(g); assert.equal(g.bossStagesCleared, 2); assert.equal(g.bossesDefeated, 1);
  assert.equal(g.printerDefeated, true); assert.equal(g.bossStatus[BOSSES[0].id], 'defeated');
  assert.equal(g.fixes, fixes + 1); assert.equal(g.resolved, resolved + 1);
  assert.ok(g.achievements.some(a => a.id === 'firstboss'));
});

test('Sev 1 requires eight real normal fixes plus the defeated printer', () => {
  const g = createGame();
  while (g.normalFixes < 8) {
    assert.equal(g.sev1Unlocked, false); assert.equal(ready(g).severity, 3); act(g);
  }
  assert.equal(g.normalFixes, 8); assert.equal(g.printerDefeated, true); assert.equal(g.sev1Unlocked, true);
  assert.equal(ready(g).severity, 3);
  const missedPrinter = reachBoss(); acknowledge(missedPrinter); advance(missedPrinter, 900);
  while (missedPrinter.normalFixes < 8) act(missedPrinter);
  assert.equal(missedPrinter.printerDefeated, false); assert.equal(missedPrinter.sev1Unlocked, false);
  assert.equal(ready(missedPrinter).severity, 3);
});

test('assists and temporary patches never shortcut the eight-real-fix gate', () => {
  const g = createGame(); act(g, 'assist'); act(g, 'assist'); act(g, 'assist');
  act(g, 'patch'); advance(g, 11); assert.equal(g.normalFixes, 0); assert.equal(g.completedNormal, 3);
  while (g.normalFixes < 8) {
    assert.equal(g.sev1Unlocked, false); assert.equal(ready(g).severity, 3); act(g);
  }
  assert.equal(g.completedNormal, 11); assert.equal(g.sev1Unlocked, true); assert.equal(ready(g).severity, 3);
});

test('unacknowledged Sev 1 starts its 60-second SLA at report and ACK does not reset it', () => {
  const g = reachSev1(), t = selected(g), deadline = t.deadline;
  assert.equal(t.acknowledged, false); assert.equal(t.slaSeconds, 60);
  assert.equal(t.deadline, t.reportedAt + 60);
  advance(g, 20); acknowledge(g);
  assert.equal(t.acknowledgedAt, t.reportedAt + 20); assert.equal(t.deadline, deadline);
  advance(g, 10); assert.equal(acknowledgeTicket(g, t.id), false); assert.equal(t.deadline, deadline);
  const unacked = reachSev1(), first = selected(unacked); drainEvents(unacked);
  advance(unacked, 59.999); assert.equal(unacked.missed, 0);
  advance(unacked, 0.001); assert.equal(unacked.missed, 1); assert.equal(first.acknowledged, false);
  assert.equal(drainEvents(unacked).filter(e => e.type === 'expired' && e.id === first.id).length, 1);
  advance(unacked, 0.001); assert.equal(unacked.missed, 1);
});

test('hard SLA expiry cancels unfinished actions while a fix exactly at the deadline succeeds', () => {
  const late = createGame(); acknowledge(late); advance(late, 898);
  assert.equal(takeAction(late, indexFor(late, 'fix')), true); advance(late, 2.4);
  assert.equal(late.missed, 1); assert.equal(late.fixes, 0); assert.equal(late.work, null);
  assert.equal(late.morale, 86); assert.equal(late.completedNormal, 1);
  const exact = createGame(); acknowledge(exact); advance(exact, 897.6); act(exact);
  assert.equal(exact.fixes, 1); assert.equal(exact.missed, 0); assert.equal(exact.morale, 100);
});

test('boss SLA expiry records one miss and advances without a defeat', () => {
  const g = reachBoss(), t = acknowledge(g); drainEvents(g); advance(g, 900);
  assert.equal(g.bossesMissed, 1); assert.equal(g.bossesDefeated, 0); assert.equal(g.missed, 1);
  assert.equal(g.morale, 75); assert.equal(g.bossStatus[t.bossId], 'missed');
  const event = drainEvents(g).find(e => e.type === 'expired');
  assert.equal(event.penalty, 25); assert.equal(event.boss, true);
  advance(g, 1800); assert.equal(g.bossesMissed, 1); assert.equal(g.missed, 1);
});

test('Friday boss is a Sev 3 change-safety review unless bad decisions cause a separate incident', () => {
  const g = reachBoss(1), t = selected(g);
  assert.equal(g.completedNormal, 12); assert.equal(g.reportedNormal, 12);
  assert.equal(t.techSkill, 2); assert.equal(t.stage, 1); assert.equal(t.stageCount, 2);
  assert.equal(t.severity, 3); assert.equal(t.deadline, null);
  acknowledge(g); const deadline = t.deadline; act(g);
  assert.equal(t.stage, 2); assert.equal(t.deadline, deadline); assert.equal(g.status, 'playing');
  act(g); assert.equal(g.status, 'finished'); assert.equal(g.queue.length, 0);
});

test('Faker bluff buys low-tech boss time once but never advances or resolves it', () => {
  const g = reachBoss(1, 'faker'), t = acknowledge(g), deadline = t.deadline;
  const stage = t.stage, fixes = g.fixes, resolved = g.resolved, score = g.score;
  g.morale = 72; act(g, 'bluff');
  assert.equal(t.deadline, deadline + 10); assert.equal(g.morale, 82);
  assert.equal(g.score, score + 75 + 100); assert.equal(g.successfulBluffs, 1);
  assert.equal(t.stage, stage); assert.equal(g.fixes, fixes); assert.equal(g.resolved, resolved);
  assert.equal(g.completedNormal, 12); assert.equal(g.bossesDefeated, 1);
  assert.equal(takeAction(g, 'bluff'), false); act(g); assert.equal(takeAction(g, 'bluff'), false);
  assert.ok(drainEvents(g).some(e => e.type === 'bluff' && e.success));
});

test('technical bosses detect bluffs, and class/skill restrictions remain explicit', () => {
  const g = reachBoss(0, 'faker'), t = acknowledge(g), deadline = t.deadline; act(g, 'bluff');
  assert.equal(g.wrong, 1); assert.equal(g.morale, 90); assert.equal(t.stage, 1);
  assert.equal(t.deadline, deadline); assert.equal(g.successfulBluffs, 0); assert.equal(takeAction(g, 'bluff'), false);
  const engineer = reachBoss(); acknowledge(engineer); assert.equal(takeAction(engineer, 'bluff'), false);
  const normal = createGame('faker', false, 'faker'); acknowledge(normal); assert.equal(takeAction(normal, 'bluff'), false);
  for (const skill of [4, 5]) {
    const boundary = reachBoss(1, 'faker'); acknowledge(boundary).techSkill = skill; act(boundary, 'bluff');
    assert.equal(boundary.successfulBluffs, skill < 5 ? 1 : 0); assert.ok(boundary.morale <= 100);
  }
});

test('paused shifts freeze work, SLA, and patch-return clocks and reject interactions', () => {
  for (const kind of ['fix', 'patch']) {
    const g = createGame(); acknowledge(g);
    if (kind === 'fix') { takeAction(g, indexFor(g, 'fix')); advance(g, 0.5); }
    else act(g, 'patch');
    g.status = 'paused'; const before = snapshot(g); advance(g, 3600);
    assert.deepEqual(snapshot(g), before); assert.equal(takeAction(g, 0), false);
    assert.equal(acknowledgeTicket(g, g.selected), false); assert.equal(selectTicket(g, g.selected), false);
    g.status = 'playing'; advance(g, kind === 'fix' ? 1.9 : 11);
    assert.equal(kind === 'fix' ? g.completedNormal : g.queue.length, 1);
  }
});

test('duplicate, stale, and invalid actions cannot spend resources or redirect work', () => {
  const g = createGame(); acknowledge(g); const id = g.selected;
  for (const bad of [-1, 99, 0.5, NaN, 'constructor', '0', null, {}, 'bluff']) assert.equal(takeAction(g, bad), false);
  assert.equal(selectTicket(g, -1), false); assert.equal(takeAction(g, 'assist', id + 1), false);
  assert.equal(takeAction(g, 'assist', id), true); assert.equal(takeAction(g, 'assist', id), false);
  assert.equal(g.assists, 2); assert.equal(takeAction(g, indexFor(g, 'fix'), id), false);
  advance(g, ACTIONS.assist.seconds); assert.equal(takeAction(g, 'assist', id), false);
  const before = snapshot(g); for (const dt of [0, -1, NaN, Infinity]) advance(g, dt);
  assert.deepEqual(snapshot(g), before);
});

test('seeded decks, action order, and random streams reproduce without mutating authored content', () => {
  const a = seededRandom('fixed'), b = seededRandom('fixed'), c = seededRandom('different');
  const numbers = Array.from({length: 30}, () => a());
  assert.deepEqual(numbers, Array.from({length: 30}, () => b()));
  assert.notDeepEqual(numbers, Array.from({length: 30}, () => c()));
  assert.deepEqual(snapshot(createGame('fixed')), snapshot(createGame('fixed')));
  assert.notDeepEqual(createGame('fixed').deck.map(t => t.id), createGame('different').deck.map(t => t.id));
  const g = createGame(), other = createGame(); act(g, 'wrong');
  assert.ok(selected(g).actions.some(a => a.tried)); assert.ok(selected(other).actions.every(a => !a.tried));
  assert.ok(TICKETS.every(t => t.actions.every(a => !a.tried)));
  for (const t of TICKETS) assert.deepEqual(t.actions.map(a => a.kind).sort(), ['fix', 'patch', 'wrong']);
  for (const boss of BOSSES) {
    assert.equal(boss.stages.length, 2);
    for (const stage of boss.stages) {
      assert.ok(stage.clue.length > 100);
      assert.deepEqual(stage.actions.map(a => a.kind).sort(), ['fix', 'wrong', 'wrong']);
    }
  }
});

test('large and subdivided timesteps produce identical waits, misses, and patch returns', () => {
  for (const mode of ['unacked', 'acked', 'patch', 'sev1']) {
    const a = mode === 'sev1' ? reachSev1() : createGame('clock');
    const b = mode === 'sev1' ? reachSev1() : createGame('clock');
    if (mode === 'acked') { acknowledge(a); acknowledge(b); }
    if (mode === 'patch') { act(a, 'patch'); act(b, 'patch'); }
    advance(a, 1200); for (let n = 0; n < 12000; n++) advance(b, 0.1);
    assert.deepEqual(snapshot(a), snapshot(b), mode);
  }
});

test('full clean shifts end after twelve distinct normal issues and two bosses for every timing mode', () => {
  for (const relaxed of [false, true]) {
    const g = createGame('full-shift', relaxed), ids = [], seen = new Set();
    while (g.status === 'playing' && ids.length < 20) {
      const t = ready(g);
      if (!t.boss) { assert.equal(seen.has(t.source.id), false); seen.add(t.source.id); ids.push(t.source.id); }
      act(g);
    }
    const many = finishClean(createGame('full-shift', relaxed), 24);
    assert.deepEqual(snapshot(g), snapshot(many));
    assert.equal(g.status, 'finished'); assert.equal(g.completedNormal, 12); assert.equal(g.reportedNormal, 12);
    assert.equal(ids.length, 12); assert.equal(g.bossesDefeated, 2); assert.equal(g.bossStagesCleared, 4);
    assert.equal(g.normalFixes, 12); assert.equal(g.fixes, 14); assert.equal(g.resolved, 14);
    assert.equal(g.morale, 100); assert.equal(g.wrong, 0); assert.equal(g.missed, 0);
    assert.equal(g.queue.length, 0); assert.equal(g.returns.length, 0); assert.equal(g.work, null);
    assert.ok(g.time >= 13 * 30 && g.time <= 13 * 120 + 5, 'fourteen reports follow bounded independent arrival gaps');
    assert.equal(g.nextArrival, null);
  }
});

test('achievements unlock once and a perfect shift requires finite completion without wrong moves or misses', () => {
  const g = finishClean(), ids = g.achievements.map(a => a.id);
  assert.deepEqual(new Set(ids), new Set(['firstfix', 'threestreak', 'firstboss', 'perfectsurvival']));
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(g.achievementPoints, g.achievements.reduce((sum, a) => sum + a.points, 0));
  for (const reward of Object.values(ACHIEVEMENTS)) assert.ok(reward.points >= 100 && reward.points <= 200);
  assert.equal(g.bonus, 300);
  for (const kind of ['wrong', 'patch', 'assist']) {
    const imperfect = createGame(`imperfect-${kind}`); act(imperfect, kind);
    if (kind === 'patch') advance(imperfect, 11);
    finishClean(imperfect);
    assert.equal(imperfect.achievements.some(a => a.id === 'perfectsurvival'), kind !== 'wrong', kind);
  }
  const missed = createGame('missed'); acknowledge(missed); advance(missed, 900); finishClean(missed);
  assert.ok(!missed.achievements.some(a => a.id === 'perfectsurvival'));
  const unfinished = createGame('unfinished'); advance(unfinished, 3600);
  assert.ok(!unfinished.achievements.some(a => a.id === 'perfectsurvival'));
});

test('end events and morale bonus are final and happen exactly once', () => {
  const g = finishClean(), score = g.score, before = g.time;
  assert.equal(drainEvents(g).filter(e => e.type === 'end').length, 1);
  advance(g, 3600); advance(g, 1); assert.equal(g.time, before); assert.equal(g.score, score);
  assert.deepEqual(drainEvents(g), []); assert.equal(takeAction(g, 'assist'), false);
  assert.equal(acknowledgeTicket(g, g.selected), false);
});

test('zero morale ends promptly without an unearned completion or survival bonus', () => {
  const g = createGame(); g.morale = 10; act(g, 'wrong');
  assert.equal(g.morale, 0); assert.equal(g.status, 'finished'); assert.equal(g.time, 2.4);
  assert.equal(g.bonus, 0); assert.equal(g.completedNormal, 0);
  assert.equal(drainEvents(g).filter(e => e.type === 'end').length, 1);
  assert.equal(getRank(g).title, 'Out of office');
  assert.ok(!g.achievements.some(a => a.id === 'perfectsurvival'));
});

test('class bonus stays intact and legacy relaxed flag cannot alter the explicit SLA rules', () => {
  const engineer = createGame(), faker = createGame('practice', false, 'faker'); act(engineer); act(faker);
  assert.equal(engineer.score - faker.score, CLASSES.engineer.fixBonus);
  const standard = createGame('mode'), legacyEasy = createGame('mode', true);
  acknowledge(standard); acknowledge(legacyEasy);
  assert.equal(selected(standard).deadline, 900); assert.equal(selected(legacyEasy).deadline, 900);
  assert.equal(selected(standard).slaSeconds, selected(legacyEasy).slaSeconds);
});

test('engine and boss definitions have no browser, storage, or network dependency', () => {
  for (const path of ['../js/rush-engine.js', '../js/rush-bosses.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|document|window|fetch|XMLHttpRequest)\s*[.(]/);
  }
  assert.equal(typeof createGame('node-only').random, 'function');
});

test('arrivals use an independent seeded 30–120 second clock and overlap open tickets',()=>{
  const a=createGame('arrivals'), b=createGame('arrivals');
  for(let n=0;n<11;n++){
    const delta=a.nextArrival-a.time; assert.ok(delta>=30 && delta<=120);
    advance(a,delta); advance(b,delta);
    assert.equal(a.queue.length,n+2);assert.equal(a.nextArrival,b.nextArrival);
  }
  assert.equal(a.reportedNormal,12);assert.equal(a.missed,0);
});
test('questions and diagnostics require ACK, consume time, isolate evidence, and reject duplicate/stale requests',()=>{
  const g=createGame('inquiry'), t=selected(g), q=t.source.investigations[0];
  assert.equal(investigateTicket(g,q.id),false); acknowledge(g);
  assert.equal(investigateTicket(g,q.id),true);assert.equal(investigateTicket(g,q.id),false);
  advance(g,1.999);assert.equal(t.evidence.length,0);advance(g,.001);assert.equal(t.evidence.length,1);
  assert.equal(t.evidence[0].reply,q.reply);assert.equal(investigateTicket(g,q.id),false);
  assert.equal(investigateTicket(g,t.source.investigations[1].id,t.id+1),false);
  const d=t.source.investigations.find(i=>i.kind==='diagnostic');assert.equal(investigateTicket(g,d.id),true);advance(g,4);
  assert.equal(t.evidence.length,2);assert.equal(g.score,0);assert.equal(g.normalFixes,0);
  act(g);const next=ready(g);assert.equal(next.evidence.length,0);
});
test('an investigation can expire and does not protect its ticket from SLA',()=>{
  const g=createGame(),t=acknowledge(g);advance(g,899);
  assert.equal(investigateTicket(g,t.source.investigations[0].id),true);advance(g,2);
  assert.equal(t.evidence.length,0);assert.equal(g.missed,1);assert.equal(g.work,null);
});
test('direct informed fixes and tested projects complete a shift with no major incidents',()=>{
  const g=createGame('prevention');doProject(g,PROJECTS[0].id,'test');doProject(g,PROJECTS[0].id,'release');
  // Resolve routine cases without compulsory questions.
  while(g.completedNormal<4) {if(!selected(g)) skipIdle(g);acknowledgeTicket(g,g.selected);takeAction(g,indexFor(g,'fix'));advance(g,2.4);}
  doProject(g,PROJECTS[1].id,'test');doProject(g,PROJECTS[1].id,'release');finishClean(g);
  assert.equal(g.projectsCompleted,2);assert.equal(g.projectPoints,900);assert.equal(g.incidentsReported,0);
  assert.equal(g.incidentsResolved,0);assert.equal(g.sev1Unlocked,true);
});
test('first unsafe release visibly causes Sev 2 with exactly 180 seconds from report and recovery reward',()=>{
  const g=createGame('risk-first');doProject(g,PROJECTS[0].id,'unsafeRelease');
  assert.equal(g.risks.length,1);assert.equal(g.incidentsReported,0);assert.match(g.risks[0].cause,/without a compatibility test/);
  advance(g,59.999);assert.equal(g.incidentsReported,0);advance(g,.001);
  const t=selected(g);assert.equal(t.incident,true);assert.equal(t.severity,2);assert.equal(t.slaSeconds,180);assert.equal(t.deadline,g.time+180);
  const deadline=t.deadline;advance(g,10);acknowledgeTicket(g,t.id);assert.equal(t.deadline,deadline);
  const before=g.score, completed=g.completedNormal;g.morale=70;takeAction(g,indexFor(g,'fix'));advance(g,2.4);
  assert.equal(g.incidentsResolved,1);assert.equal(g.completedNormal,completed);assert.equal(g.normalFixes,0);
  assert.equal(g.morale,80);assert.ok(g.score-before>=200);assert.ok(!g.queue.includes(t));
});
test('untested project risk can be prevented before impact, including at the exact boundary',()=>{
  for(const elapsed of [0,42]){
    const g=createGame(`prevent-${elapsed}`);doProject(g,PROJECTS[0].id,'unsafeRelease');advance(g,elapsed);
    doProject(g,PROJECTS[0].id,'remediate');advance(g,120);
    assert.equal(g.incidentsReported,0);assert.equal(g.incidentsPrevented,1);assert.equal(g.risks[0].status,'prevented');
    assert.equal(g.score,0);assert.equal(g.projects[0].status,'completed');
  }
});
test('unacknowledged Sev 2 still expires after three minutes exactly once',()=>{
  const g=createGame();doProject(g,PROJECTS[0].id,'unsafeRelease');advance(g,60);const t=selected(g);
  advance(g,179.999);assert.equal(g.incidentsMissed,0);advance(g,.001);
  assert.equal(g.incidentsMissed,1);assert.equal(t.acknowledged,false);assert.equal(g.completedNormal,0);
  advance(g,10);assert.equal(g.incidentsMissed,1);
});
test('projects share work capacity, support interruption, and never mutate on invalid or repeated inputs',()=>{
  const g=createGame(),id=PROJECTS[0].id;assert.equal(startProject(g,PROJECTS[1].id,'test'),false);
  assert.equal(startProject(g,id,'release'),false);assert.equal(startProject(g,id,'constructor'),false);
  assert.equal(startProject(g,id,'test'),true);assert.equal(startProject(g,id,'test'),false);
  acknowledgeTicket(g,g.selected);assert.equal(takeAction(g,indexFor(g,'fix')),false);
  advance(g,8);assert.equal(cancelWork(g),true);assert.equal(g.projects[0].tested,false);assert.equal(cancelWork(g),false);
  doProject(g,id,'test');assert.equal(startProject(g,id,'test'),false);assert.equal(startProject(g,id,'unsafeRelease'),false);
  doProject(g,id,'release');assert.equal(startProject(g,id,'release'),false);assert.equal(g.score,450);
});
test('pausing freezes project and risk clocks; unsafe release cannot be safely deferred afterward',()=>{
  const g=createGame();doProject(g,PROJECTS[0].id,'unsafeRelease');
  assert.equal(startProject(g,PROJECTS[0].id,'defer'),false);assert.equal(skipIdle(g),false);
  startProject(g,PROJECTS[0].id,'remediate');g.status='paused';const before=snapshot(g);advance(g,1000);
  assert.deepEqual(snapshot(g),before);assert.equal(cancelWork(g),false);g.status='playing';advance(g,18);assert.equal(g.incidentsPrevented,1);
});
test('project and incident boundaries remain identical across large and subdivided timesteps',()=>{
  for(const action of ['unsafeRelease','test']){
    const a=createGame('project-clock'),b=createGame('project-clock');startProject(a,PROJECTS[0].id,action);startProject(b,PROJECTS[0].id,action);
    advance(a,300);for(let n=0;n<3000;n++)advance(b,.1);assert.deepEqual(snapshot(a),snapshot(b));
  }
});
test('ignoring relevant change evidence creates traceable risk; correcting that ticket prevents it',()=>{
  const g=reachBoss(1),t=acknowledge(g),bad=t.actions.findIndex(a=>a.risk);
  takeAction(g,bad);advance(g,2.4);assert.equal(g.risks.length,1);assert.equal(g.risks[0].sourceTicketId,t.id);
  assert.match(g.risks[0].cause,/column/);act(g);assert.equal(g.incidentsPrevented,1);assert.equal(g.incidentsReported,0);
  act(g);assert.equal(g.status,'finished');
});

test('a beginner can collect all needed questions and diagnostics on every authored case, even after bad questions',()=>{
  for(const source of [...TICKETS,...BOSSES.flatMap(b=>b.stages)]) {
    const g=createGame(`beginner-${source.id}`),t=selected(g);t.source=source;t.actions=source.actions.map(a=>({...a}));acknowledgeTicket(g,t.id);
    assert.ok(source.investigations.some(i=>i.kind==='diagnostic'));assert.ok(source.investigations.filter(i=>i.kind==='question').length>=4);
    const bad=source.investigations.filter(i=>['leading','irrelevant'].includes(i.quality));assert.equal(bad.length,2);
    const order=[...bad,...source.investigations.filter(i=>!i.quality)];
    for(const inquiry of order){assert.equal(investigateTicket(g,inquiry.id),true);advance(g,INVESTIGATIONS[inquiry.kind].seconds);}
    assert.equal(t.evidence.length,source.investigations.length);assert.equal(g.wrong,0);assert.equal(g.morale,100);
    assert.ok(t.evidence.some(e=>e.evidence.includes('Unverified')));assert.ok(t.evidence.some(e=>e.kind==='diagnostic'));
    assert.equal(takeAction(g,t.actions.findIndex(a=>a.kind==='fix')),true);advance(g,2.4);assert.equal(g.fixes,1);
    assert.equal(g.incidentsReported,0);
  }
});
test('expert and beginner paths both succeed; efficient correct first tries earn a bounded bonus',()=>{
  const expert=createGame('learning'),beginner=createGame('learning');
  acknowledgeTicket(expert,expert.selected);acknowledgeTicket(beginner,beginner.selected);
  const inquiry=selected(beginner).source.investigations.find(i=>i.kind==='diagnostic');
  investigateTicket(beginner,inquiry.id);advance(beginner,4);
  takeAction(expert,indexFor(expert,'fix'));takeAction(beginner,indexFor(beginner,'fix'));advance(expert,2.4);advance(beginner,2.4);
  assert.equal(expert.fixes,1);assert.equal(beginner.fixes,1);assert.equal(expert.score,beginner.score);assert.equal(beginner.time-expert.time,4);
  const guess=createGame('learning');act(guess,'wrong');act(guess);assert.ok(guess.score<beginner.score);
});
test('safe releases pay more than incident recovery even at maximum streak',()=>{
  const g=createGame();doProject(g,PROJECTS[0].id,'unsafeRelease');advance(g,60);g.streak=9;
  acknowledgeTicket(g,g.selected);const before=g.score;takeAction(g,indexFor(g,'fix'));advance(g,2.4);
  assert.equal(g.score-before,200);assert.equal(g.achievements.length,0);assert.ok(g.score<400&&g.score<450);
});
