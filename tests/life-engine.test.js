import test from 'node:test';
import assert from 'node:assert/strict';
import { createLife, inboxFor, chooseMessage, endWorkday, homeOptions, chooseEvening, chooseConversation, beginNextDay } from '../js/rush-life.js';

function completeEvening(life, activity = 'rest', conversation = 'remember', summary = {}) {
  assert.equal(endWorkday(life, summary), true);
  assert.equal(chooseEvening(life, activity), true);
  assert.equal(chooseConversation(life, conversation), true);
  return beginNextDay(life);
}
function unchanged(life, action, result = false) {
  const before = structuredClone(life);
  assert.equal(action(), result);
  assert.deepEqual(life, before);
}

test('new life and read-only options are isolated, authored local fiction', () => {
  const a = createLife(), b = createLife();
  a.relationships.rowan = 1;
  a.preferences.rowan = 'changed';
  a.memory.mira = 'changed';
  a.history.push({ text: 'changed' });
  assert.equal(b.relationships.rowan, 50);
  assert.match(b.preferences.rowan, /Quiet/);
  assert.equal(b.memory.mira, null);
  assert.equal(b.history.length, 0);
  const before = structuredClone(b);
  const inbox = inboxFor(b), home = homeOptions(b);
  assert.deepEqual(b, before);
  assert.equal(inbox.length, 2);
  assert.deepEqual(inbox.map(item => item.channel), ['Teams', 'Email']);
  assert.ok(inbox.every(item => /fictional/.test(item.from)));
  assert.deepEqual(inbox.map(item => item.choices.length), [4, 3]);
  inbox[0].choices[0].label = 'Changed outside state';
  home.activities[0].label = 'Changed outside state';
  home.conversation.choices.pop();
  assert.notEqual(inboxFor(b)[0].choices[0].label, inbox[0].choices[0].label);
  assert.notEqual(homeOptions(b).activities[0].label, home.activities[0].label);
  assert.equal(homeOptions(b).conversation.choices.length, 3);
});

test('inbox answers occur once, produce real clue and bounded-work effect metadata', () => {
  const life = createLife();
  assert.equal(chooseMessage(life, 'mira-thread', 'check-facts'), true);
  assert.equal(life.relationships.mira, 58);
  assert.equal(life.energy, 69);
  assert.equal(life.lastResult.assistsDelta, 1);
  assert.equal(life.lastResult.moraleDelta, 0);
  assert.match(life.lastResult.clue, /DNS.*old portal address/);
  const item = inboxFor(life)[0];
  assert.equal(item.answered, true);
  assert.equal(item.selectedId, 'check-facts');
  assert.match(item.reply, /Facts have entered the chat/);
  unchanged(life, () => chooseMessage(life, 'mira-thread', 'check-facts'));
  unchanged(life, () => chooseMessage(life, 'mira-thread', 'spread-rumour'));
  assert.equal(chooseMessage(life, 'rowan-plan', 'promise-tea'), true);
  assert.deepEqual(life.promise, { day: 1, kind: 'tea', status: 'open' });
  assert.equal(life.lastResult.assistsDelta, 0);
  assert.equal(life.lastResult.clue, null);
});

test('invalid and out-of-order actions never mutate life', () => {
  const life = createLife();
  for (const id of [undefined, null, 0, '', '__proto__', 'missing']) {
    unchanged(life, () => chooseMessage(life, id, 'check-facts'));
    unchanged(life, () => chooseMessage(life, 'mira-thread', id));
    unchanged(life, () => chooseEvening(life, id));
    unchanged(life, () => chooseConversation(life, id));
  }
  unchanged(life, () => chooseEvening(life, 'rest'));
  unchanged(life, () => chooseConversation(life, 'remember'));
  unchanged(life, () => beginNextDay(life), null);
  for (const summary of [null, 1, 'summary', []]) unchanged(life, () => endWorkday(life, summary));
  assert.equal(endWorkday(life), true);
  unchanged(life, () => endWorkday(life));
  unchanged(life, () => chooseMessage(life, 'mira-thread', 'check-facts'));
  unchanged(life, () => chooseConversation(life, 'remember'));
  unchanged(life, () => beginNextDay(life), null);
  unchanged(life, () => chooseEvening(life, 'missing'));
  assert.equal(chooseEvening(life, 'rest'), true);
  unchanged(life, () => chooseEvening(life, 'packet'));
  unchanged(life, () => chooseConversation(life, 'keep-small'));
  assert.equal(chooseConversation(life, 'remember'), true);
  assert.equal(life.stage, 'ready');
  unchanged(life, () => chooseConversation(life, 'check-in'));
  assert.equal(beginNextDay(life).day, 2);
  unchanged(life, () => beginNextDay(life), null);
});

test('optional inbox never blocks going home and rest has a real morning advantage over study', () => {
  const rested = createLife(), studied = createLife();
  const restCarry = completeEvening(rested), studyCarry = completeEvening(studied, 'study');
  assert.equal(restCarry.morale, 100);
  assert.equal(restCarry.assists, 3);
  assert.equal(studyCarry.morale, 94);
  assert.equal(studyCarry.assists, 4);
  assert.ok(rested.energy > studied.energy);
  assert.ok(rested.stress < studied.stress);
  assert.deepEqual(rested.choices, { inbox: {}, evening: null, conversation: null });
  assert.equal(rested.stage, 'work');
  assert.equal(rested.studyBonus, 0);
  assert.match(studyCarry.briefing.join(' '), /study adds an assist/);
  completeEvening(studied);
  assert.equal(studied.studyBonus, 0);
});

test('shown context makes relationship choices answerable, with a repair route after a misread', () => {
  const life = createLife();
  endWorkday(life); chooseEvening(life, 'rest');
  const card = homeOptions(life).conversation;
  assert.match(card.context, /quiet company.*ask before/i);
  assert.match(card.choices.find(item => item.id === 'remember').label, /listening or ideas/);
  assert.ok(card.choices.some(item => item.id === 'check-in'));
  assert.equal(chooseConversation(life, 'rush-fix'), true);
  assert.equal(life.stage, 'ready');
  assert.equal(life.relationships.rowan, 46);
  const carry = beginNextDay(life);
  assert.match(carry.briefing.join(' '), /fresh start/);
  assert.match(inboxFor(life)[1].body, /talked past each other/);
  endWorkday(life); chooseEvening(life, 'rest');
  assert.equal(chooseConversation(life, 'check-in'), true);
  assert.equal(life.relationships.rowan, 52);
  assert.equal(life.memory.rowan, 'repaired');
  beginNextDay(life);
  assert.match(inboxFor(life)[1].body, /Thanks for checking/);
});

test('tea promises remember the exact plan and support keeping, shrinking, rescheduling, and repairing it', () => {
  for (const outcome of ['rowan', 'keep-small', 'check-in', 'rush-fix']) {
    const life = createLife();
    chooseMessage(life, 'rowan-plan', 'promise-tea');
    endWorkday(life);
    chooseEvening(life, outcome === 'rowan' ? 'rowan' : 'rest');
    if (outcome === 'rowan') {
      assert.equal(life.promise.status, 'kept');
      assert.match(homeOptions(life).conversation.context, /kept today’s quiet-tea promise/);
      chooseConversation(life, 'remember');
    } else {
      const card = homeOptions(life).conversation;
      assert.match(card.context, /promised Rowan quiet tea/);
      assert.deepEqual(card.choices.map(item => item.id), ['keep-small', 'check-in', 'rush-fix']);
      unchanged(life, () => chooseConversation(life, 'remember'));
      const energy = life.energy;
      chooseConversation(life, outcome);
      assert.equal(life.promise.status, { 'keep-small': 'kept', 'check-in': 'rescheduled', 'rush-fix': 'missed' }[outcome]);
      if (outcome === 'keep-small') assert.equal(life.energy, energy - 6);
    }
    assert.equal(life.stage, 'ready');
    const carry = beginNextDay(life);
    assert.equal(life.promise, null);
    if (outcome === 'check-in') assert.match(carry.briefing.join(' '), /without a hidden promise/);
  }
});

test('colleague choices change tomorrow’s dialogue, assistance, and allow relationship repair', () => {
  const helpful = createLife(), friction = createLife();
  chooseMessage(helpful, 'mira-thread', 'check-facts');
  completeEvening(helpful);
  assert.match(inboxFor(helpful)[0].body, /Yesterday you checked the facts/);
  chooseMessage(helpful, 'mira-thread', 'check-facts');
  assert.equal(completeEvening(helpful).assists, 4);
  for (let day = 0; day < 3; day++) {
    chooseMessage(friction, 'mira-thread', 'spread-rumour');
    assert.equal(friction.lastResult.moraleDelta, -2);
    const carry = completeEvening(friction);
    if (day === 2) assert.equal(carry.assists, 2);
  }
  assert.match(inboxFor(friction)[0].body, /forwarded rumour made things awkward/);
  chooseMessage(friction, 'mira-thread', 'check-facts');
  assert.equal(completeEvening(friction).assists, 3);
  assert.match(inboxFor(friction)[0].body, /checked the facts/);
});

test('Packet companionship carries a remembered relationship and morning benefit', () => {
  const life = createLife();
  completeEvening(life, 'packet');
  assert.equal(life.relationships.packet, 62);
  assert.equal(life.memory.packet, 'played');
  const carry = completeEvening(life, 'packet');
  assert.equal(life.relationships.packet, 74);
  assert.match(carry.briefing.join(' '), /Packet greets you/);
  assert.match(carry.briefing.join(' '), /adds 1 morale/);
});

test('uncertain solidarity foreshadows a delayed audit without revealing its result early', () => {
  const life = createLife('a');
  const option = inboxFor(life)[0].choices.find(item => item.id === 'back-claim');
  assert.match(option.effect, /Tomorrow’s audit may confirm or contradict/);
  chooseMessage(life, 'mira-thread', 'back-claim');
  assert.equal(life.relationships.mira, 54);
  assert.equal(life.energy, 67);
  assert.equal(life.lastResult.assistsDelta, 0);
  assert.equal(life.pending.length, 1);
  assert.deepEqual(Object.keys(life.pending[0]), ['id', 'source', 'day', 'dueDay', 'kind', 'warning']);
  assert.equal(life.pending[0].source, 'mira-thread/back-claim');
  assert.equal(life.pending[0].dueDay, 2);
  assert.ok(!life.history.some(item => item.type === 'consequence'));
  endWorkday(life); chooseEvening(life, 'rest'); chooseConversation(life, 'remember');
  assert.equal(life.pending.length, 1);
  assert.ok(!life.history.some(item => item.type === 'consequence'));
});

test('seeded audits can confirm or contradict the claim, explain their cause, and resolve only once', () => {
  for (const [seed, outcome, trust, assists] of [['a', 'confirmed', 60, 4], ['b', 'contradicted', 46, 2]]) {
    const life = createLife(seed);
    chooseMessage(life, 'mira-thread', 'back-claim');
    const carry = completeEvening(life);
    assert.equal(life.relationships.mira, trust);
    assert.equal(carry.assists, assists);
    assert.equal(life.pending.length, 0);
    assert.equal(life.memory.mira, outcome);
    const result = life.history.find(item => item.type === 'consequence');
    assert.equal(result.id, `audit-1/${outcome}`);
    assert.equal(result.day, 2);
    assert.match(result.text, /Yesterday you backed Mira’s claim/);
    assert.ok(carry.briefing.includes(result.text));
    assert.match(inboxFor(life)[0].body, new RegExp(`audit ${outcome}`));
    assert.equal(completeEvening(life).assists, 3);
    assert.equal(life.history.filter(item => item.type === 'consequence').length, 1);
    assert.equal(life.relationships.mira, trust);
  }
});

test('the same run seed replays audits and long uncertain chains stay bounded and recoverable', () => {
  const a = createLife('repeatable'), b = createLife('repeatable');
  const seen = new Set();
  for (let day = 0; day < 60; day++) {
    for (const life of [a, b]) {
      chooseMessage(life, 'mira-thread', 'back-claim');
      const carry = completeEvening(life, day % 2 === 0 ? 'study' : 'rest');
      assert.ok(carry.assists >= 2 && carry.assists <= 4);
      assert.ok(carry.morale >= 90 && carry.morale <= 100);
      assert.equal(life.pending.length, 0);
      assert.ok(life.history.length <= 36);
      seen.add(life.memory.mira);
    }
    assert.deepEqual(a, b);
  }
  assert.deepEqual([...seen].sort(), ['confirmed', 'contradicted']);
  chooseMessage(a, 'mira-thread', 'check-facts');
  assert.equal(completeEvening(a).day, 62);
  assert.equal(a.memory.mira, 'heard');
});

test('workday summary strain is finite and ignores nonnumeric or negative metrics', () => {
  const life = createLife();
  endWorkday(life, { missed: Infinity, incidentsReported: -4, projectsCompleted: 2.9 });
  assert.deepEqual(life.workSummary, { missed: 0, incidents: 0, projectsCompleted: 2, handedOff: 0, pendingRisks: 0, handoffStress: 0, handoffMorale: 0 });
  assert.equal(life.energy, 54);
  assert.equal(life.stress, 30);
  const rough = createLife();
  endWorkday(rough, { missed: 1000000, incidents: 1000000 });
  assert.equal(rough.energy, 42);
  assert.equal(rough.stress, 42);
});

test('early clock-out records unresolved cases, returns, and pending risks with a bounded morning consequence', () => {
  const life = createLife();
  const game = { queue: [{ id: 1 }, { id: 2 }], returns: [{ ticket: { id: 3 } }], risks: [{ status: 'pending' }, { status: 'prevented' }, { status: 'incident' }], projectsCompleted: 1 };
  const beforeGame = structuredClone(game);
  assert.equal(endWorkday(life, game), true);
  assert.deepEqual(game, beforeGame);
  assert.equal(life.workSummary.handedOff, 3);
  assert.equal(life.workSummary.pendingRisks, 1);
  assert.equal(life.workSummary.handoffStress, 5);
  assert.equal(life.workSummary.handoffMorale, 2);
  assert.equal(life.stress, 35);
  assert.match(homeOptions(life).homeIntro, /3 unresolved cases and 1 pending risk/);
  assert.match(homeOptions(life).homeIntro, /next shift/);
  assert.match(life.history.at(-1).text, /−2 starting morale tomorrow/);
  unchanged(life, () => endWorkday(life, game));
  chooseEvening(life, 'rest'); chooseConversation(life, 'remember');
  const carry = beginNextDay(life);
  assert.equal(carry.morale, 98);
  assert.match(carry.briefing.join(' '), /They own recovery.*costs 2 starting morale/);
  assert.equal(life.workSummary, null);
  assert.equal(life.homeIntro, '');
  assert.equal(completeEvening(life).morale, 100);
});

test('finished work has no handoff cost and extreme unfinished work cannot make tomorrow unplayable', () => {
  const complete = createLife();
  assert.equal(endWorkday(complete, { queue: [], returns: [], risks: [{ status: 'prevented' }], projectsCompleted: 2 }), true);
  assert.equal(complete.workSummary.handedOff, 0);
  assert.equal(complete.workSummary.pendingRisks, 0);
  assert.match(homeOptions(complete).homeIntro, /no unresolved cases/);
  chooseEvening(complete, 'rest'); chooseConversation(complete, 'remember');
  assert.equal(beginNextDay(complete).morale, 100);
  const rough = createLife();
  rough.energy = 0; rough.stress = 100;
  endWorkday(rough, { queue: Array(1000).fill({}), returns: Array(1000).fill({}), risks: Array(1000).fill({ status: 'pending' }) });
  assert.equal(rough.workSummary.handoffStress, 8);
  assert.equal(rough.workSummary.handoffMorale, 3);
  chooseEvening(rough, 'study'); chooseConversation(rough, 'rush-fix');
  const carry = beginNextDay(rough);
  assert.equal(carry.morale, 90);
  assert.equal(carry.assists, 4);
  assert.equal(rough.stage, 'work');
});

test('repeatable days remain bounded without softlocks even with poor choices and rough workdays', () => {
  const life = createLife();
  const activities = ['study', 'packet', 'rowan', 'rest'];
  const firstSubjects = new Set();
  for (let day = 1; day <= 120; day++) {
    assert.equal(life.day, day);
    assert.equal(life.stage, 'work');
    const inbox = inboxFor(life);
    firstSubjects.add(inbox[0].subject);
    assert.ok(inbox.every(item => !item.answered));
    if (day % 2 === 0) chooseMessage(life, 'mira-thread', 'spread-rumour');
    else chooseMessage(life, 'mira-thread', 'set-boundary');
    if (day % 3 === 0) chooseMessage(life, 'rowan-plan', 'promise-tea');
    assert.equal(endWorkday(life, { missed: 14, incidents: 9, projectsCompleted: 2 }), true);
    assert.equal(chooseEvening(life, activities[day % activities.length]), true);
    const card = homeOptions(life).conversation;
    assert.ok(card.choices.some(item => item.id === 'check-in'));
    assert.equal(chooseConversation(life, day % 4 === 0 ? 'check-in' : 'rush-fix'), true);
    const carry = beginNextDay(life);
    assert.equal(carry.day, day + 1);
    assert.ok(carry.morale >= 90 && carry.morale <= 100);
    assert.ok(carry.assists >= 2 && carry.assists <= 4);
    for (const value of [life.energy, life.stress, ...Object.values(life.relationships)]) assert.ok(value >= 0 && value <= 100);
    assert.ok(life.history.length <= 36);
  }
  assert.equal(firstSubjects.size, 3);
  assert.equal(life.history.length, 36);
});
