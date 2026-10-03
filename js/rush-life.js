/** Authored local fiction. These messages never contact real people or services. */
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const HISTORY_LIMIT = 36;
const DAYS = [
  { subject: 'The screenshot has become a witness', body: 'Someone has blamed my rollout from one cropped screenshot. Can we check the timeline before the team chat turns into a courtroom?', clue: 'The DNS museum: compare the laptop cache with the current resolver. The laptop still holds the old portal address.' },
  { subject: 'Reply-all is not a root-cause analysis', body: 'The printer refresh thread now has twelve theories and a decorative GIF. Can we ask which models actually failed before assigning blame?', clue: 'Meeting by monitor: the headset passes its sound test. Check the meeting output; it is set to HDMI Monitor.' },
  { subject: 'The rota spreadsheet has feelings', body: 'Someone thinks I dodged the late shift. I swapped with approval, but that bit was outside the screenshot. Can we ask for the actual rota?', clue: 'Webcam witness protection: the webcam is detected and its light is on. Inspect the physical lens shutter before reinstalling anything.' },
];
const CONVERSATIONS = [
  { title: 'Tea without a troubleshooting tree', context: 'Earlier, Rowan said: “After a noisy day, I like quiet company. Please ask before you try to fix things.”', prompt: 'Rowan says the day was exhausting and sits beside the kettle. What do you do?', remember: 'Make tea and ask whether Rowan wants listening or ideas', wrong: 'Open an imaginary incident and prescribe a five-step fix', success: '“Listening, please.” Rowan tells the whole story. The kettle is the only thing asked to boil over.', failure: '“I wanted company, not a service ticket.” Rowan is a little disappointed, but says you can try again tomorrow.' },
  { title: 'A small win gets a small party', context: 'Earlier, Rowan said: “I like celebrating with a quiet game at home. Surprise crowds wear me out.”', prompt: 'Rowan finished a difficult project and wants to mark the occasion. What sounds right?', remember: 'Offer the familiar co-op game and let Rowan pick the snacks', wrong: 'Announce a surprise party with the entire fictional office', success: 'Rowan picks the co-op game. You both lose to the tutorial boss and still call it a successful evening.', failure: '“A crowd sounds like more work.” Rowan asks you to check next time. The imaginary guest list is quietly recycled.' },
  { title: 'Plans need a save button', context: 'Earlier, Rowan said: “If your plans change, tell me directly. Rescheduling is fine; guessing is tiring.”', prompt: 'You both look tired. Tomorrow’s plans may need a smaller version. What do you say?', remember: 'Say how much energy you have and agree on a smaller plan together', wrong: 'Say “whatever” and hope Rowan decodes the correct calendar event', success: 'You agree on a short walk instead of a whole expedition. The calendar now contains a plan that humans can actually do.', failure: 'Rowan cannot tell what “whatever” means. You leave the plan open and agree that a clearer answer tomorrow would help.' },
];

export function createLife(seed = 'practice') {
  return {
    seed: String(seed), day: 1, stage: 'work', energy: 72, stress: 18,
    relationships: { rowan: 50, mira: 50, packet: 50 },
    preferences: { rowan: 'Quiet company; ask before giving advice; communicate changed plans.', packet: 'The ribbon toy first, then a sunny lap. Cardboard is always acceptable.' },
    choices: { inbox: {}, evening: null, conversation: null },
    memory: { mira: null, rowan: null, packet: null },
    promise: null, studyBonus: 0, workSummary: null, pending: [],
    homeIntro: '', homeConversation:null, activityResult: '', conversationResult: '', lastResult: null, history: [],
  };
}

function record(life, type, id, text) {
  life.history.push({ day: life.day, type, id, text });
  if (life.history.length > HISTORY_LIMIT) life.history.splice(0, life.history.length - HISTORY_LIMIT);
}
function change(life, effects = {}) {
  life.energy = clamp(life.energy + (effects.energy || 0));
  life.stress = clamp(life.stress + (effects.stress || 0));
  for (const name of ['rowan', 'mira', 'packet']) life.relationships[name] = clamp(life.relationships[name] + (effects[name] || 0));
}
function feedback(life, text, work = {}) {
  life.lastResult = { text, moraleDelta: work.moraleDelta || 0, assistsDelta: work.assistsDelta || 0, clue: work.clue || null };
}
function choice(id, label, effect) { return { id, label, effect }; }
function auditConfirms(seed, day) {
  let hash = 2166136261;
  for (const char of `${seed}:audit:${day}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  return hash % 2 === 0;
}

export function inboxFor(life) {
  const episode = DAYS[(life.day - 1) % DAYS.length];
  const miraFollow = life.choices.inbox['mira-thread'] ? '' : life.memory.mira === 'heard' ? 'Yesterday you checked the facts with me. I saved you a diagnostic note. ' : life.memory.mira === 'rumour' ? 'That forwarded rumour made things awkward. I would appreciate a direct check-in today. ' : life.memory.mira === 'boundary' ? 'Thanks for saying clearly what you had time for yesterday. ' : life.memory.mira === 'confirmed' ? 'The audit confirmed the claim you backed yesterday. Thanks for the support. Let’s check today’s facts too. ' : life.memory.mira === 'contradicted' ? 'The audit contradicted the claim you backed yesterday. Let’s check the facts together and correct the record. ' : '';
  const rowanFollow = life.memory.rowan === 'missed' ? 'Yesterday we talked past each other. A fresh start would help. ' : life.memory.rowan === 'repaired' ? 'Thanks for checking what I meant yesterday. ' : life.memory.rowan === 'heard' ? 'Yesterday felt good. Let’s keep telling each other what we actually need. ' : '';
  const messages = [
    { id: 'mira-thread', channel: 'Teams', from: 'Mira · fictional teammate', subject: episode.subject,
      body: miraFollow + episode.body + (life.relationships.mira>=66 || life.memory.mira==='heard' ? ' Diagnostic note: '+episode.clue : ''),
      choices: [choice('check-facts', 'Check the facts with Mira; ask for the diagnostic note', '−3 energy; stronger trust; +1 teammate assist (maximum 4)'), choice('set-boundary', 'Offer a later check-in and protect the current queue', '+5 energy; clear boundary; small trust gain'), choice('spread-rumour', 'Forward the screenshot with “thoughts?”', 'More team friction; +5 stress; −2 work morale'), choice('back-claim', 'Back Mira’s claim before the evidence arrives', '+4 trust; −5 energy now. Tomorrow’s audit may confirm or contradict it, changing trust and starting assists')] },
    { id: 'rowan-plan', channel: 'Email', from: 'Rowan · fictional partner', subject: 'Tonight, in the non-ticket universe',
      body: rowanFollow + 'Fancy quiet tea tonight? A clear “I need rest” is fine too. Packet has already RSVP’d by sitting in the invitation.',
      choices: [choice('promise-tea', 'Promise a quiet tea break together tonight', 'Make a promise to keep or honestly reschedule; +3 trust'), choice('need-rest', 'Say you need recovery time tonight', '+5 energy; Rowan understands; no evening promise'), choice('ask-later', 'Say you will decide after work', 'Keep the evening open; no promise and no stat change')] },
  ];
  return messages.map(message => {
    const answer = life.choices.inbox[message.id];
    return { ...message, answered: Boolean(answer), selectedId: answer?.choiceId || null, reply: answer?.reply || '' };
  });
}

export function chooseMessage(life, messageId, choiceId) {
  if (life.stage !== 'work' || life.choices.inbox[messageId]) return false;
  const message = inboxFor(life).find(item => item.id === messageId);
  if (!message?.choices.some(item => item.id === choiceId)) return false;
  const episode = DAYS[(life.day - 1) % DAYS.length];
  let reply;
  let work = {};
  if (messageId === 'mira-thread') {
    if (choiceId === 'check-facts') {
      change(life, { mira: 8, energy: -3, stress: -4 }); life.memory.mira = 'heard';
      reply = 'Mira: “Thank you. Facts have entered the chat.” She covers one routine ticket for you and shares a note: ' + episode.clue;
      work = { assistsDelta: 1, clue: episode.clue };
    } else if (choiceId === 'set-boundary') {
      change(life, { mira: 2, energy: 5, stress: -3 }); life.memory.mira = 'boundary';
      reply = 'Mira: “Fair. I’ll keep the screenshot away from the courtroom until we can check it.” Your boundary lands without a fight.';
    } else if (choiceId === 'back-claim') {
      change(life, { mira: 4, energy: -5 }); life.memory.mira = 'backed';
      const warning = 'Tomorrow’s audit may confirm or contradict the claim. Your public support could help teamwork or require a correction.';
      life.pending.push({ id: `audit-${life.day}`, source: 'mira-thread/back-claim', day: life.day, dueDay: life.day + 1, kind: 'claim-audit', warning });
      reply = 'Mira: “Thanks for standing with me.” You back the claim before checking it: +4 trust, −5 energy. ' + warning;
    } else {
      change(life, { mira: -6, stress: 5 }); life.memory.mira = 'rumour';
      reply = 'Mira: “Could you have asked me first?” The thread gets longer and less useful. You can check in directly next morning.';
      work = { moraleDelta: -2 };
    }
  } else if (choiceId === 'promise-tea') {
    change(life, { rowan: 3 }); life.promise = { day: life.day, kind: 'tea', status: 'open' };
    reply = 'Rowan: “Lovely. Quiet tea, no surprise crowd.” Tonight you can keep the plan or talk honestly about changing it.';
  } else if (choiceId === 'need-rest') {
    change(life, { energy: 5, rowan: 2 });
    reply = 'Rowan: “Rest is a valid plan. Packet can supervise.” No promise is hanging over the evening.';
  } else {
    reply = 'Rowan: “Fine by me. We can choose after work.” The evening stays open.';
  }
  life.choices.inbox[messageId] = { choiceId, reply };
  feedback(life, reply, work); record(life, 'message', `${messageId}/${choiceId}`, reply);
  return true;
}

export function endWorkday(life, summary = {}) {
  if (life.stage !== 'work' || !summary || typeof summary !== 'object' || Array.isArray(summary)) return false;
  const count = value => Number.isFinite(value) ? clamp(Math.floor(value), 0, 100) : 0;
  const incidentHandoffs=Array.isArray(summary.history)?summary.history.filter(t=>t.incident&&t.handoff?.status==='recovery-pending').length:0;
  const handedOff = count((Array.isArray(summary.queue) ? summary.queue.length : 0) + (Array.isArray(summary.returns) ? summary.returns.length : 0) + incidentHandoffs);
  const pendingRisks = count(Array.isArray(summary.risks) ? summary.risks.filter(risk => risk?.status === 'pending').length : 0);
  const handoffStress = Math.min(8, handedOff + pendingRisks * 2);
  const handoffMorale = Math.min(3, Math.ceil((handedOff + pendingRisks) / 3));
  life.workSummary = { missed: count(summary.missed), incidents: count(summary.incidents ?? summary.incidentsReported), projectsCompleted: count(summary.projectsCompleted), handedOff, pendingRisks, handoffStress, handoffMorale };
  const strain = Math.min(12, life.workSummary.missed * 2 + life.workSummary.incidents * 3);
  change(life, { energy: -18 - strain, stress: 12 + strain + handoffStress });
  life.homeConversation=null;
  life.stage = 'home'; life.activityResult = ''; life.conversationResult = ''; life.lastResult = null;
  life.homeIntro = handedOff || pendingRisks
    ? `You hand off ${handedOff} unresolved case${handedOff === 1 ? '' : 's'} and ${pendingRisks} pending risk${pendingRisks === 1 ? '' : 's'} to the next shift. They own recovery; restoration is pending. Tomorrow you make a short handoff check-in. +${handoffStress} stress tonight and −${handoffMorale} starting morale tomorrow (minimum 90).`
    : `The workday is closed with no unresolved cases or pending risks handed off. You completed ${life.workSummary.projectsCompleted} project${life.workSummary.projectsCompleted === 1 ? '' : 's'}. Home has two small decisions, then sleep.`;
  record(life, 'workday', 'clock-out', life.homeIntro);
  return true;
}

export function homeOptions(life) {
  const episode = CONVERSATIONS[(life.day - 1) % CONVERSATIONS.length];
  const openPromise = life.promise?.day === life.day && life.promise.status === 'open';
  const promiseMet = life.promise?.day === life.day && life.promise.status === 'kept';
  let conversation = { speaker: 'Rowan · fictional partner', title: episode.title, context: episode.context,
    prompt: episode.prompt, choices: [choice('remember', episode.remember, 'Use the preference shown above'), choice('check-in', 'Check what Rowan needs, and offer a fresh start', 'A gentle repair is always available'), choice('rush-fix', episode.wrong, 'A hurried assumption may miss the moment')] };
  if (openPromise && life.choices.evening) {
    conversation = { speaker: 'Rowan · fictional partner', title: 'The tea promise',
      context: 'You promised Rowan quiet tea in today’s email. Rowan said changing plans is okay when you say so directly.',
      prompt: 'You chose another activity. Rowan asks whether tea is still happening. What do you say?',
      choices: [choice('keep-small', 'Keep the promise with a short, quiet cup now', '−6 energy; keep the promise'), choice('check-in', 'Acknowledge the change and agree on a rain check', 'Repair the plan honestly; +6 trust'), choice('rush-fix', 'Pretend the promise was never made', 'Avoiding the question leaves a small trust dent')] };
  } else if (promiseMet) {
    conversation = { ...conversation, context: 'You kept today’s quiet-tea promise. ' + episode.context };
  }
  if(life.homeConversation) conversation=JSON.parse(JSON.stringify(life.homeConversation));
  return { activities: [
    { id: 'rest', label: 'Rest without earning it first', description: 'An early shower, a blanket, and a show whose problems fit inside one episode.', effect: '+32 energy; −26 stress; best recovery' },
    { id: 'packet', label: 'Play with Packet the cat', description: 'Ribbon toy, cardboard castle, sunny lap. Packet promotes you to Senior String Operator.', effect: '+22 energy; −18 stress; +12 Packet bond' },
    { id: 'rowan', label: 'Quiet tea and a game with Rowan', description: 'A little shared time. If you promised tea, this keeps that promise.', effect: '+16 energy; −18 stress; +6 Rowan trust' },
    { id: 'study', label: 'Study one useful diagnostic', description: 'You rehearse a support scenario. Useful practice, but this evening is less restful.', effect: '−8 energy; +4 stress; +1 assist next morning (maximum 4)' },
  ], conversation, homeIntro: life.homeIntro, activityResult: life.activityResult, conversationResult: life.conversationResult };
}

export function chooseEvening(life, id) {
  if (life.stage !== 'home' || life.choices.evening || !homeOptions(life).activities.some(item => item.id === id)) return false;
  let text;
  if (id === 'rest') {
    change(life, { energy: 32, stress: -26 });
    text = 'You rest. Nothing productive happens, and that is the recovery: +32 energy, −26 stress. Tomorrow gets a steadier version of you.';
  } else if (id === 'packet') {
    change(life, { energy: 22, stress: -18, packet: 12 }); life.memory.packet = 'played';
    text = 'Packet defeats the ribbon and naps beside you: +22 energy, −18 stress, +12 bond. The cardboard castle survives exactly nine seconds.';
  } else if (id === 'rowan') {
    change(life, { energy: 16, stress: -18, rowan: 6 });
    if (life.promise?.day === life.day && life.promise.status === 'open') life.promise.status = 'kept';
    text = 'You share tea and a game: +16 energy, −18 stress, +6 trust. Rowan notices that you made room for the evening.';
  } else {
    change(life, { energy: -8, stress: 4 }); life.studyBonus = 1;
    text = 'You practice one diagnostic: +1 teammate assist next morning (maximum 4), −8 energy, +4 stress. You close the notes before they become a second shift.';
  }
  life.choices.evening = id; life.homeConversation=JSON.parse(JSON.stringify(homeOptions(life).conversation)); life.activityResult = text; feedback(life, text); record(life, 'evening', id, text);
  return true;
}

export function chooseConversation(life, id) {
  if (life.stage !== 'home' || !life.choices.evening || life.choices.conversation || !homeOptions(life).conversation.choices.some(item => item.id === id)) return false;
  const episode = CONVERSATIONS[(life.day - 1) % CONVERSATIONS.length];
  const openPromise = life.promise?.day === life.day && life.promise.status === 'open';
  let text;
  if (id === 'keep-small') {
    change(life, { energy: -6, rowan: 8, stress: -4 }); life.promise.status = 'kept'; life.memory.rowan = 'heard';
    text = 'You share a short cup. Rowan appreciates that the promise mattered: +8 trust, −6 energy, −4 stress. Small plans still count.';
  } else if (id === 'remember') {
    change(life, { rowan: 8, stress: -6 }); life.memory.rowan = 'heard'; text = episode.success + ' +8 trust, −6 stress.';
  } else if (id === 'check-in') {
    change(life, { rowan: 6, stress: -4 }); life.memory.rowan = 'repaired';
    if (openPromise) { life.promise.status = 'rescheduled'; text = '“Thanks for telling me.” You agree to choose a fresh evening together, with no automatic promise tomorrow. +6 trust, −4 stress.'; }
    else text = 'You ask instead of guessing. Rowan explains what would help, and you listen. A small repair makes room for tomorrow: +6 trust, −4 stress.';
  } else {
    change(life, { rowan: -4, stress: 3 }); life.memory.rowan = 'missed';
    if (openPromise) { life.promise.status = 'missed'; text = 'Rowan remembers the message. “Please just tell me if plans change.” −4 trust, +3 stress. A direct check-in tomorrow can repair this.'; }
    else text = episode.failure + ' −4 trust, +3 stress.';
  }
  life.choices.conversation = id; life.conversationResult = text; life.stage = 'ready';
  feedback(life, text); record(life, 'conversation', id, text);
  return true;
}

export function beginNextDay(life) {
  if (life.stage !== 'ready' || !life.choices.evening || !life.choices.conversation) return null;
  let auditAssist = 0;
  const auditResults = [];
  for (const pending of life.pending.filter(item => item.dueDay <= life.day + 1)) {
    const confirmed = auditConfirms(life.seed, pending.day);
    change(life, { mira: confirmed ? 6 : -8 });
    life.memory.mira = confirmed ? 'confirmed' : 'contradicted';
    auditAssist += confirmed ? 1 : -1;
    const text = confirmed
      ? `Yesterday you backed Mira’s claim before the evidence arrived. The audit confirms it: +6 trust and +1 starting assist, within the 2–4 limit. Mira appreciates the support, though checking first was still an option.`
      : `Yesterday you backed Mira’s claim before the evidence arrived. The audit contradicts it: −8 trust and −1 starting assist, within the 2–4 limit. Mira asks you to help correct the record; a factual check-in today can repair the friction.`;
    auditResults.push({ id: `${pending.id}/${confirmed ? 'confirmed' : 'contradicted'}`, text });
  }
  life.pending = life.pending.filter(item => item.dueDay > life.day + 1);
  change(life, { energy: 16, stress: -8 });
  const trusted = life.relationships.mira >= 66;
  const petBoost = life.relationships.packet >= 65 ? 1 : 0;
  const socialBoost = life.relationships.rowan >= 65 ? 1 : 0;
  const handoffMorale = life.workSummary?.handoffMorale || 0;
  const morale = clamp(clamp(90 + Math.round((life.energy - life.stress) / 10) + petBoost + socialBoost, 90, 100) - handoffMorale, 90, 100);
  const assists = clamp(3 + life.studyBonus + auditAssist + (trusted ? 1 : 0) - (life.relationships.mira < 35 ? 1 : 0), 2, 4);
  const briefing = [`After sleep: ${life.energy} energy, ${life.stress} stress. Start with ${morale} morale and ${assists} teammate assists.`];
  briefing.push(...auditResults.map(item => item.text));
  if (handoffMorale) briefing.push(`Yesterday's workday handed ${life.workSummary.handedOff} unresolved cases and ${life.workSummary.pendingRisks} pending risks to the next shift. They own recovery; service restoration remains pending. Your morning handoff check-in costs ${handoffMorale} starting morale, with a minimum of 90.`);
  if (life.choices.evening === 'study') briefing.push('Last night’s study adds an assist, up to the four-assist limit. Rest is still available every evening.');
  if (trusted) briefing.push('Mira trusts your fact-checking and prepares extra cover. Her next message includes a fresh diagnostic note.');
  else if (life.relationships.mira < 35) briefing.push('Team chat feels strained: one fewer starting assist. A direct, factual reply to Mira starts rebuilding trust.');
  if (petBoost) briefing.push('Packet greets you as the reliable String Operator. That familiar morning routine adds 1 morale, up to 100.');
  if (socialBoost) briefing.push('Rowan leaves a kind note by the kettle. Feeling understood adds 1 morale, up to 100.');
  if (life.memory.rowan === 'missed') briefing.push('The conversation with Rowan is unfinished. Today’s email offers a fresh start.');
  if (life.promise?.status === 'rescheduled') briefing.push('You and Rowan changed the tea plan honestly. Today begins without a hidden promise.');
  life.day += 1; life.stage = 'work'; life.studyBonus = 0; life.promise = null;
  life.choices = { inbox: {}, evening: null, conversation: null };
  life.workSummary = null; life.homeIntro = ''; life.homeConversation=null; life.activityResult = ''; life.conversationResult = ''; life.lastResult = null;
  for (const result of auditResults) record(life, 'consequence', result.id, result.text);
  record(life, 'morning', 'begin', briefing.join(' '));
  return { day: life.day, morale, assists, briefing };
}
