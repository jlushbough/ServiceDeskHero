import { createGame, advance, takeAction, selectTicket, drainEvents, getRank, acknowledgeTicket, TOTAL_NORMAL, ACTIONS, INVESTIGATIONS, investigateTicket, skipIdle, startProject, cancelWork, PROJECT_ACTIONS, setTicketHeld, setProjectHeld, DUNGEON_STATS, DUNGEON_SKILLS, DUNGEON_GEAR, DUNGEON_FLOORS, chooseDungeonStat, chooseDungeonSkill, chooseDungeonGear, dungeonSummary, dungeonSnapshot, dungeonEffects, finishDungeon, actionSeconds, investigationSeconds, projectSeconds } from './rush-engine.js';
import { createLife, inboxFor, chooseMessage, endWorkday, homeOptions, chooseEvening, chooseConversation, beginNextDay } from './rush-life.js';
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE = 'sdh_contact_v3';
let today = new Date().toISOString().slice(0,10);
let dailySeed = `contact-v3-${today}`;
let saved = {};
try { const parsed = JSON.parse(localStorage.getItem(STORE) || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed; } catch { /* Storage is optional. */ }
let morningBriefing = [], life = createLife(), startingStats = {technical:0,insight:0,composure:0,bullshit:0};
let relaxed = false, classId = 'engineer', game = null, previousTime = 0, lastTicketKey = '', lastQueueKey = '', toastTimer = 0, achievementTimer = 0;
let interactionView = 'fix', lastCaseId = '';
let activeDeskTab='inc', lifecycleFilter='active', tabSelection={}, unread={inc:new Set(),req:new Set(),projects:new Set(),ktlo:new Set()}, pulseUntil={};
const stream=t=>t.workstream || t.source.workstream || 'inc';
const closedProject=p=>['completed','deferred'].includes(p.status);
const visibleCases=()=>['inc','req'].includes(activeDeskTab)?(lifecycleFilter==='resolved'?game.history:game.queue).filter(t=>stream(t)===activeDeskTab && (lifecycleFilter==='resolved'||!!t.held===(lifecycleFilter==='hold'))):[];
let feed = [], audio = null, sound = saved.sound === true, resultRecorded = false, pointerActionTicket = null, pointerActionStage = undefined;
const validBest = mode => Number.isFinite(saved[mode]) && saved[mode] >= 0 ? Math.floor(saved[mode]) : 0;
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { /* Play continues without persistence. */ } };
function beep(kind) {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const notes = kind === 'fix' ? [620, 880] : kind === 'wrong' ? [190, 140] : kind === 'end' ? [440, 554, 660, 880] : [430];
    notes.forEach((frequency, i) => {
      const osc = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + i * .08;
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.035, start); gain.gain.exponentialRampToValueAtTime(.001, start + .12);
      osc.connect(gain); gain.connect(audio.destination); osc.start(start); osc.stop(start + .13);
    });
  } catch { /* Sound must never block gameplay. */ }
}
function formatSla(seconds) { const total=Math.max(0,Math.ceil(seconds)); return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`; }
function renderSound() { $('sound-button').textContent = sound ? 'Sound on' : 'Sound off'; $('sound-button').setAttribute('aria-pressed', String(sound)); $('sound-button').setAttribute('aria-label', sound ? 'Disable sound' : 'Enable sound'); }
function renderLobby() {
  const best = validBest(`dungeon-${classId}`);
  $('best-label').textContent = `Local best: ${best ? best.toLocaleString() : '—'}`;
  renderStartingStats();
  $('daily-label').textContent = `DAILY SHIFT · ${today.slice(5).replace('-', '/')}`;
  ['engineer-class','faker-class'].forEach((id,i) => { const selected = (i ? 'faker' : 'engineer') === classId; $(id).classList.toggle('selected',selected); $(id).setAttribute('aria-pressed', String(selected)); });

}
function show(section) {
  for (const id of ['lobby','game','results','home']) $(id).hidden = id !== section;
  document.body.classList.toggle('playing', section === 'game');
}
function announce(text) { $('announcer').textContent = text; }
function toast(text, warning = false) {
  clearTimeout(toastTimer); $('outcome').textContent = text;
  $('outcome').className = `outcome visible${warning ? ' warning' : ''}`;
  toastTimer = setTimeout(() => $('outcome').classList.remove('visible'), 2900);
}
function addFeed(text, warning = false) {
  feed.unshift({text, warning}); feed = feed.slice(0,4);
  $('feed').innerHTML = feed.map(f => `<div class="feed-item${f.warning ? ' warning' : ''}"><span class="feed-symbol" aria-hidden="true">${f.warning ? '!' : '+'}</span><span>${escape(f.text)}</span></div>`).join('');
}
function handleEvents() {
  for (const event of drainEvents(game)) {
    if(['arrival','boss-arrival','incident','return'].includes(event.type)){const t=game.queue.find(t=>t.id===event.id);if(t)markNew(stream(t),t.id);}
    if(event.type==='risk')markNew('ktlo',event.riskId);
    if(event.type==='outcome' && game.completedNormal>=4 && !game.projects[1].notified){game.projects[1].notified=true;markNew('projects',game.projects[1].id);}
    if(event.type==='held'){toast(event.text);addFeed(event.text);announce(event.text);}
    if (event.type === 'achievement') {
      const achievement = event.achievement || event;
      const achievementText=`Achievement: ${achievement.title} · +${achievement.points}`;
      toast(`${$('outcome').classList.contains('visible') ? $('outcome').textContent+' ' : ''}${achievementText}`);addFeed(achievementText);
      clearTimeout(achievementTimer); $('achievement-banner').hidden = false;
      $('achievement-banner').innerHTML = `<span>NEW ACHIEVEMENT · +${achievement.points || 0}</span><strong>${escape(achievement.title || '')}</strong><p>${escape(achievement.description || '')}</p>`;
      achievementTimer = setTimeout(() => $('achievement-banner').hidden = true,4500);
      $('earned-achievements').innerHTML = game.achievements.map(a => `<span title="${escape(a.description)}">✦ ${escape(a.title)}</span>`).join('');
      beep('end');
    } else if (['boss-arrival','boss-stage','boss-defeated','bluff','narrator','project','risk','incident','prevented'].includes(event.type)) {
      if (event.text) { toast(event.text, event.type === 'bluff' && event.success === false); addFeed(event.text, event.type === 'boss-arrival'); $('chuck-message').textContent = event.text; }
      if (event.type === 'boss-arrival') beep('wrong');
    } else if (event.type === 'investigation') {
      $('evidence-drawer').open=true;
      const label = event.kind === 'question' ? 'User reply' : 'Diagnostic result';
      toast(`${label}: ${event.reply}`); addFeed(`${label} recorded for ticket #${event.ticketId}.`);
      announce(`${label}. ${event.reply}. ${event.evidence}`); beep('click');
    } else if (event.type === 'outcome') {
      const prefix = event.kind === 'fix' ? `+${event.points} · ${event.boss && !event.defeated ? "Stage cleared. " : "Fixed for good. "}` : event.kind === 'patch' ? '+55 · Back in 11s. ' : event.kind === 'assist' ? '+75 · Teamwork. ' : `-${Math.abs(event.moraleDelta ?? event.penalty ?? 10)} morale · Try another move. `;
      toast(prefix + (event.expert?'Efficient diagnosis +25. ':'') + (event.investigated?'Evidence-backed diagnosis +25. ':'') + (event.incident&&event.kind==='fix'?`+${event.moraleDelta} morale. `:'') + event.text, event.kind === 'wrong');
      addFeed(`${event.title} · ${event.kind === 'fix' ? (event.boss && !event.defeated ? 'stage cleared' : 'resolved') : event.kind === 'patch' ? 'temporarily patched' : event.kind === 'assist' ? 'handled by teammate' : 'still broken'}`,event.kind === 'wrong');
      beep(event.kind); $('score-pop').textContent = event.points ? `+${event.points}` : '';
      if (event.streak === 3) $('chuck-message').textContent = '“Three correct moves. How upsetting. We had already drafted your replacement listing.”';
      if (event.streak === 6) $('chuck-message').textContent = '“Six in a row. Achievement unlocked: your reward is more responsibility.”';
    } else if (['expired','overflow','return'].includes(event.type)) {
      addFeed(event.text,true); toast(event.text,true); beep('wrong');
    } else if (event.type === 'sev1-unlocked') {
      toast(event.text); addFeed(event.text); announce(event.text);
    } else if (event.type === 'acknowledged') {
      const seen=game.queue.find(t=>t.id===event.id);if(seen)unread[stream(seen)]?.delete(seen.id);
      announce(event.text || 'Ticket acknowledged. SLA active.');
    } else if (event.type === 'phase') {
      toast(event.text); addFeed(event.text); beep('phase');
      $('chuck-message').textContent = event.phase === 1 ? '“The all-hands meeting is now an all-hands incident.”' : '“One last thing before you go…”';
      announce(event.text);
    } else if (event.type === 'arrival') addFeed(`New ticket · ${event.text}`);
    else if (['dungeon-floor','dungeon-choice','dungeon-boss','dungeon-xp'].includes(event.type)) {if(event.text){toast(event.text);addFeed(event.text);announce(event.text);}}
    else if (event.type === 'end') finish();
  }
}
function start(nextDay = null) {
  morningBriefing = nextDay?.briefing ? [...nextDay.briefing] : [];
  if (!nextDay) life = createLife(`contact-v3-${new Date().toISOString().slice(0,10)}`);
  today = new Date().toISOString().slice(0,10); dailySeed = `contact-v3-${today}`;
  game = createGame(nextDay ? `${dailySeed}-day${life.day}` : dailySeed, relaxed, classId, nextDay ? {day:life.day,dungeonCarry:nextDay.dungeonCarry} : {stats:startingStats,day:1});
  if(nextDay){game.morale=nextDay.morale;game.assists=nextDay.assists;}  activeDeskTab=stream(game.queue[0]);lifecycleFilter='active';tabSelection={};unread={inc:new Set(),req:new Set(),projects:new Set(),ktlo:new Set()};pulseUntil={}; $('evidence-drawer').open=false; resultRecorded = false; lastCaseId = ''; interactionView = 'fix'; lastTicketKey = ''; lastQueueKey = ''; feed = []; pointerActionTicket = null;
  $('chuck-message').textContent = '“Welcome, replaceable asset. Your suffering has been marked P3.”';
  clearTimeout(achievementTimer); $('achievement-banner').hidden = true; $('earned-achievements').innerHTML = '';
  $('score-pop').textContent = ''; $('share-status').textContent = ''; $('share-fallback').hidden = true;
  clearTimeout(toastTimer); $('outcome').classList.remove('visible');
  for(const id of ['pause-dialog','character-dialog','inbox-dialog'])if($(id).open)$(id).close();
  show('game'); previousTime = performance.now(); handleEvents(); unread[activeDeskTab].clear(); render();
  if(nextDay){nextDay.briefing.forEach(text=>addFeed(text));toast(nextDay.briefing.join(' '));}
  $('acknowledge-button').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'});
  announce('Shift started. Read the user report. Acknowledge to start your 15-minute SLA, then answer directly or contact the user and run diagnostics. New reports arrive every 30 to 120 seconds. Press P to pause.'); beep('start');
}
function render() {
  if (!game || game.status === 'finished') return;
  const focusedInquiry = document.activeElement?.dataset.inquiry;
  const progress = game.completedNormal + game.bossesDefeated + game.bossesMissed;
  $('time').textContent = `${progress} / ${TOTAL_NORMAL + 2}`;
  $('time-fill').style.width = `${100 * progress / (TOTAL_NORMAL + 2)}%`;
  $('score').textContent = game.score.toLocaleString(); $('streak').innerHTML = `${game.streak}<span>×</span>`;
  $('streak-note').textContent = game.streak ? `+${Math.min(game.streak,5)*25} next fix` : 'Make it stick';
  $('morale-number').textContent = `${game.morale}%`; $('morale-fill').style.width = `${game.morale}%`;
  $('morale-meter').setAttribute('aria-valuenow',String(game.morale));
  $('morale-text').textContent = game.morale > 70 ? 'Cautiously optimistic' : game.morale > 35 ? 'The coffee is wearing off' : 'Updating the résumé';
  document.body.classList.toggle('low-morale',game.morale <= 35);
  const floor = DUNGEON_FLOORS.find(f=>f.id===game.dungeon.floor);
  $('phase-name').textContent = `DAY ${life.day} · ${floor.name.toUpperCase()}`;
  $('character-button').textContent = `Floor ${game.dungeon.floor} · Lv ${game.dungeon.level}${game.dungeon.statPoints+game.dungeon.skillPoints+game.dungeon.gearChoices?' · UPGRADE':''}`;
  $('character-button').classList.toggle('upgrade-ready',!!(game.dungeon.statPoints+game.dungeon.skillPoints+game.dungeon.gearChoices));
  $('inbox-count').textContent=inboxFor(life).filter(m=>!m.answered).length;
  $('shift-flavor').textContent = ['Read first. Acknowledge when ready.','Users have stories. Diagnostics have receipts.','Good testing prevents major incidents.'][game.phase];
  $('open-total').textContent=`${game.queue.length} open`;
  $('next-arrival').textContent=game.nextArrival!==null?`Next report ${formatSla(game.nextArrival-game.time)}`:'All routine reports received';
  $('resolved-label').textContent=`${game.resolved} ticket${game.resolved===1?'':'s'} closed`;
  renderDeskTabs();
  const cases=visibleCases(), archived=lifecycleFilter==='resolved';
  let ticket=cases.find(t=>t.id===tabSelection[activeDeskTab]) || cases[0];
  if(ticket){tabSelection[activeDeskTab]=ticket.id;if(!archived)game.selected=ticket.id;}
  $('ticket-detail').dataset.selectedTicket=ticket?.id || '';
  $('ticket-detail').classList.toggle('has-case',!!ticket);
  const queueKey=`${activeDeskTab}/${lifecycleFilter}/`+cases.map(t=>`${t.id}/${t.stage||0}/${t.acknowledged}/${ticket?.id===t.id}/${unread[activeDeskTab]?.has(t.id)}`).join(',');
  $('workstream-heading').textContent=activeDeskTab==='req'?'Requests':'Incidents';
  $('queue-count').textContent=`${cases.length} ${lifecycleFilter}`;
  if(queueKey!==lastQueueKey){
    const focusedId=document.activeElement?.dataset.ticket;lastQueueKey=queueKey;
    $('queue').innerHTML=cases.length?cases.map(t=>`<button class="queue-ticket${t.id===ticket?.id?' selected':''}${t.urgent?' urgent':''}${t.reopened?' reopened':''}" ${archived?`data-history-ticket="${t.id}"`:`data-ticket="${t.id}"`} ${unread[activeDeskTab]?.has(t.id)?`data-unread-ticket="${t.id}"`:''} aria-pressed="${t.id===ticket?.id}"><span class="queue-top"><span class="queue-priority">${t.boss?'BOSS · ':''}SEV ${t.severity} · ${archived?(t.resolution==='missed'?'MISSED':'CLOSED'):t.held?'HOLD':t.acknowledged?'ACTIVE':'NEW'}</span><span>#${t.id}</span></span><h3>${escape(t.source.title)}</h3><span class="queue-timer" data-timer="${t.id}"></span><span class="ticket-patience" data-patience="${t.id}"></span></button>`).join(''):`<p class="queue-empty">No ${lifecycleFilter} ${activeDeskTab==='req'?'requests':'incidents'}.</p>`;
    if(focusedId)$('queue').querySelector(`[data-ticket="${focusedId}"]`)?.focus({preventScroll:true});
  }
  for(const t of cases){
    const b=$('queue').querySelector(`[data-ticket="${t.id}"],[data-history-ticket="${t.id}"]`),remaining=t.deadline===null?null:Math.max(0,t.deadline-game.time);
    b.querySelector('[data-timer]').textContent=archived?`${t.handoff?'RECOVERY HANDED OFF':t.resolution==='missed'?'SLA missed':'Resolved'} · ${formatSla(t.closedAt)}`:game.work?.ticketId===t.id?'IN PROGRESS':remaining===null?'AWAITING ACK':`${t.held?'SLA RUNNING · ':''}${formatSla(remaining)}`;
    b.querySelector('[data-patience]').style.width=`${archived||remaining===null?0:Math.min(100,remaining/t.slaSeconds*100)}%`;
    b.classList.toggle('danger',!archived&&remaining!==null&&remaining<15);
    b.setAttribute('aria-label',`${t.source.title}, ${archived?(t.resolution==='missed'?'closed after missed SLA':'resolved'):t.held?'on hold, SLA continues':'active'}, ${!archived&&remaining!==null?Math.ceil(remaining)+' seconds remaining':''}`);
  }
  const caseId = ticket ? `${ticket.id}-${ticket.stage || 0}-${archived}-${ticket.held}` : 'empty';
  if (caseId !== lastCaseId) { lastCaseId = caseId; interactionView = 'fix';$('ticket-detail').scrollTop=0; }
  const key = ticket ? `${caseId}-${ticket.acknowledged}-${ticket.actions.map(a=>a.tried?'x':'o').join('')}-${(ticket.evidence||[]).map(e=>e.id).join(',')}-${interactionView}` : 'empty';
  $('empty-ticket').hidden = Boolean(ticket); $('active-ticket').hidden = !ticket; $('action-area').hidden = !ticket || !ticket.acknowledged || ticket.held || archived;
  $('sla-panel').hidden = !ticket || archived; $('acknowledge-button').hidden = !ticket || ticket.acknowledged || ticket.held || archived; $('acknowledged-note').hidden = !ticket || !ticket.acknowledged || archived;
  $('hold-button').hidden=!ticket||archived; $('hold-button').textContent=ticket?.held?'Resume':'Hold';$('hold-button').disabled=game.status!=='playing'||game.work?.ticketId===ticket?.id;
  $('hold-notice').hidden=!ticket?.held||archived; $('history-status').hidden=!ticket||!archived;
  $('history-status').textContent=archived&&ticket?`${ticket.resolution==='missed'?'Closed · SLA missed':ticket.resolution==='assist'?'Resolved · teammate assist':'Resolved · lasting fix'} at ${formatSla(ticket.closedAt)}. ${ticket.handoff?ticket.handoff.text+' ':''}History is read-only.`:'';
  $('evidence-drawer').hidden=!ticket; if(archived&&ticket)$('evidence-drawer').open=true;
  if (ticket) {
    const remaining = ticket.deadline === null ? null : Math.max(0,ticket.deadline-game.time);
    $('sla-time').textContent = remaining === null ? 'Not started' : formatSla(remaining);
    $('sla-rule').textContent = ticket.severity <= 2 ? `Sev ${ticket.severity} · started when reported` : 'Sev 3 · starts when you acknowledge';
    $('sla-panel').classList.toggle('urgent-sla',ticket.severity <= 2);
    $('sla-panel').classList.toggle('danger-sla',remaining !== null && remaining <= 15);
    $('acknowledged-note').textContent = ticket.severity <= 2 ? 'Acknowledged. The report-time deadline is unchanged.' : 'Acknowledged. You have 15 minutes from acknowledgement.';
  }
  if(!ticket){$('empty-ticket').querySelector('h2').textContent=lifecycleFilter==='resolved'?'No closed cases yet':lifecycleFilter==='hold'?'Nothing on hold':game.queue.length?'This list is clear':'Desk is quiet.';$('empty-ticket').querySelector('p').textContent=game.returns.length?'A workaround will return; its original SLA keeps running.':game.queue.length?'Other tabs may have active work. Check their badges.':game.risks.some(r=>r.status==='pending')?'A preventable risk is developing. Open KTLO.':game.nextArrival!==null?'Read the field guide, work on a project, or take the next call.':'Complete or safely defer outstanding projects to end your shift.';}
  $('skip-idle-button').hidden=lifecycleFilter!=='active';
  $('skip-idle-button').disabled=game.status!=='playing'||!!game.queue.length||!!game.returns.length||!!game.work||game.nextArrival===null||game.risks.some(r=>r.status==='pending');
  $('next-open-button').hidden=!game.queue.some(t=>!t.held);
  if (key !== lastTicketKey) {
    const hadActionFocus = $('actions').contains(document.activeElement);
    lastTicketKey = key;
    if (ticket) {
      $('active-ticket').innerHTML = `<div class="ticket-meta"><span class="pill ${ticket.urgent?'coral':'purple'}">${ticket.boss ? `SEV ${ticket.severity} BOSS · STAGE ${ticket.stage}/2` : ticket.reopened ? `SEV ${ticket.severity} · REOPENED` : `SEV ${ticket.severity} · ${ticket.acknowledged?'ACKNOWLEDGED':'AWAITING ACK'}`}</span><span>TICKET #${String(ticket.id).padStart(4,'0')}</span></div><div class="ticket-category"><span aria-hidden="true">${escape(ticket.source.icon)}</span>${escape(ticket.source.category)}</div><h2 id="ticket-title">${escape(ticket.source.title)}</h2><details class="caller-story"><summary>Caller’s account</summary><p class="user-quote">“${escape(ticket.source.quote)}”</p></details><span class="ticket-user">${escape(ticket.source.user)}</span><div class="clue"><span class="clue-label">REPORTED SYMPTOMS · UNVERIFIED</span><p>${escape(ticket.source.brief || ticket.source.quote)}</p></div>`;
      $('actions').innerHTML = ticket.actions.map((a,i)=>`<button class="action-button" data-action="${i}" data-for-ticket="${ticket.id}" data-stage="${ticket.stage || 0}" ${a.tried?'disabled':''}><span class="action-number" aria-hidden="true">${i+1}</span><span class="action-label">${escape(a.label)}${a.tried ? (a.kind==='patch' ? ' · used' : ' · tried') : ''}${a.risk?' · creates service risk':''}</span><span class="action-duration">${actionSeconds(game,a.kind)}s</span></button>`).join('');
      if (hadActionFocus) { if (ticket.acknowledged) $('actions').querySelector('button:not([disabled])')?.focus({preventScroll:true}); else $('acknowledge-button').focus({preventScroll:true}); }
      const slaAnnouncement = ticket.severity <= 2
        ? `Sev ${ticket.severity}. Your ${ticket.slaSeconds}-second SLA started when reported. ${ticket.acknowledged ? 'Acknowledged; the deadline is unchanged.' : 'Acknowledge to respond; the clock is already running.'}`
        : ticket.acknowledged ? 'Acknowledged. Your 15-minute SLA is active.' : 'Sev 3. Read at your own pace. Your 15-minute SLA starts only after acknowledgement.';
      $('evidence-count').textContent=ticket.evidence.length;
      const latestEvidence = ticket.evidence?.at(-1);
      if(!archived)announce(`${slaAnnouncement} ${ticket.source.title}. ${latestEvidence ? `${latestEvidence.reply}. ${latestEvidence.evidence}` : ticket.source.brief || ticket.source.quote}`);
      $('fix-options').hidden = interactionView !== 'fix';
      $('investigation-options').hidden = interactionView === 'fix';
      const modes = [['fix-view-button','fix'],['contact-user-button','question'],['diagnostics-button','diagnostic']];
      for (const [id,mode] of modes) { $(id).classList.toggle('selected',interactionView===mode); $(id).setAttribute('aria-pressed',String(interactionView===mode)); }
      $('approach-hint').textContent = interactionView === 'fix' ? 'Know the answer? Fix it now. Questions and diagnostics can reveal every answer. A correct direct fix or evidence-backed first try earns +25 once; extra questions earn no extra points.' : interactionView === 'question' ? 'Ask what actually happened. A confident answer is still only a user report.' : 'Run a targeted check. Facts stay with this ticket; the SLA keeps running.';
      $('investigation-options').innerHTML = (ticket.source.investigations || []).filter(i=>i.kind===interactionView).map(i=>`<button class="inquiry-button" data-inquiry="${escape(i.id)}" data-for-ticket="${ticket.id}" data-stage="${ticket.stage || 0}"><strong>${escape(i.label)}</strong><span>${(ticket.evidence||[]).some(e=>e.id===i.id) ? (i.kind==='question'?'Asked':'Completed') : `${investigationSeconds(game,i.kind)}s · ${i.kind==='question'?'ask user':'run check'}`}</span></button>`).join('');
      if (focusedInquiry) $('investigation-options').querySelector(`[data-inquiry="${CSS.escape(focusedInquiry)}"]`)?.focus({preventScroll:true});
      $('case-notes').innerHTML = (ticket.evidence || []).length ? `<h3>CASE NOTES · ${(ticket.evidence || []).length} collected</h3>${ticket.evidence.map(e=>`<article class="evidence-item ${e.kind}"><span class="clue-label">${e.kind==='question'?'USER REPLY':'DIAGNOSTIC RESULT'}</span><p class="evidence-reply">${escape(e.reply)}</p><p class="evidence-fact"><strong>${e.kind==='question'?'Reported detail':'Verified finding'}:</strong> ${escape(e.evidence)}</p></article>`).join('')}` : '<p class="notes-empty">No evidence collected yet. Choose a fix, contact the user, or run a diagnostic.</p>';
    }
  }
  $('actions').querySelectorAll('button').forEach((button,i)=>{button.disabled = !ticket || archived || ticket.held || !ticket.acknowledged || Boolean(game.work) || !!ticket?.actions[i]?.tried || game.status !== 'playing';});
  $('investigation-options').querySelectorAll('button').forEach(button=>{button.disabled = archived || ticket?.held || !ticket?.acknowledged || !!game.work || game.status !== 'playing' || !!ticket?.evidence?.some(e=>e.id===button.dataset.inquiry);});
  if(focusedInquiry && $('investigation-options').querySelector(`[data-inquiry="${CSS.escape(focusedInquiry)}"]`)?.disabled) ($('investigation-options').querySelector('button:not(:disabled)') || $('contact-user-button')).focus({preventScroll:true});
  $('boss-reaction').hidden=!ticket?.boss || archived;
  $('boss-reaction').textContent=ticket?.dungeonReaction?.text || ticket?.dungeonReaction || '';
  $('boss-status').hidden = !ticket?.boss || archived;
  document.querySelector('.ticket-panel').classList.toggle('boss-active',Boolean(ticket?.boss));
  if (ticket?.boss) $('boss-status').innerHTML = `<span>TECH SKILL <b>${ticket.techSkill}/10</b></span><span>DIAGNOSIS <b>${ticket.stage}/2</b></span><span class="boss-health">${ticket.stage===1?'▰ ▰':'▱ ▰'}</span>`;
  $('bluff-button').hidden = !(ticket?.boss && classId === 'faker');
  $('bluff-button').disabled = archived || ticket?.held || !ticket?.acknowledged || !!game.work || !!ticket?.bluffed || game.status !== 'playing';
  $('bluff-description').textContent = ticket?.bluffed ? 'Bluff used. The problem still needs a real fix.' : `Bluff influence ${5+dungeonEffects(game).bluffPower} · must exceed boss skill ${ticket?.techSkill || 0} · Buys time, never fixes`;
  $('assist-button').disabled = archived || ticket?.held || !ticket?.acknowledged || Boolean(ticket?.boss || ticket?.incident) || !game.assists || Boolean(game.work) || game.status !== 'playing';
  $('assist-count').textContent = ticket?.boss || ticket?.incident ? 'This case needs your expertise' : `${game.assists} left · +75 pts`;
  renderProjects();
  $('cancel-work-button').hidden = game.work?.type !== 'project';
  $('work-status').hidden = !game.work;
  if (game.work) {
    const work = game.work;
    $('work-label').textContent = work.type === 'project' ? `${work.action.label}: ${work.projectAction}…` : work.action.kind === 'question' ? 'Contacting user…' : work.action.kind === 'diagnostic' ? 'Running diagnostic…' : 'Working on it…'; $('work-seconds').textContent = `${Math.max(0,work.ends-game.time).toFixed(1)}s`;
    $('work-fill').style.width = `${Math.min(100,100*(game.time-work.started)/(work.ends-work.started))}%`;
  }
}
function markNew(tab,id){unread[tab]?.add(id);pulseUntil[tab]=game.time+2;}
function setDeskTab(tab,filter='active'){
  if(!['inc','req','projects','ktlo','training'].includes(tab))return;
  activeDeskTab=tab;lifecycleFilter=filter;unread[tab]?.clear();lastTicketKey='';lastQueueKey='';render();
}
function renderDeskTabs(){
  const counts={inc:game.queue.filter(t=>stream(t)==='inc').length,req:game.queue.filter(t=>stream(t)==='req').length,projects:game.projects.filter(p=>!closedProject(p)&&game.completedNormal>=p.unlockAfter).length,ktlo:game.risks.filter(r=>r.status==='pending').length};
  document.querySelectorAll('[data-desk-tab]').forEach(b=>{const tab=b.dataset.deskTab,selected=tab===activeDeskTab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;b.classList.toggle('new-arrival',(pulseUntil[tab]||0)>game.time);const count=b.querySelector('[data-count]');if(count)count.textContent=counts[tab];const badge=b.querySelector('[data-unread]');if(badge){badge.hidden=!unread[tab].size;badge.textContent=unread[tab].size;badge.setAttribute('aria-label',`${unread[tab].size} new`);}});
  const tickets=['inc','req'].includes(activeDeskTab);
  $('ticket-workspace').hidden=!tickets;$('task-workspace').hidden=!['projects','ktlo'].includes(activeDeskTab);$('training-workspace').hidden=activeDeskTab!=='training';
  if(tickets)$('ticket-workspace').setAttribute('aria-labelledby',`tab-${activeDeskTab}`);else $('task-workspace').setAttribute('aria-labelledby',`tab-${activeDeskTab}`);
  $('desk-filters').hidden=activeDeskTab==='training';
  document.querySelectorAll('[data-desk-filter]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.deskFilter===lifecycleFilter));b.hidden=activeDeskTab==='ktlo'&&b.dataset.deskFilter==='hold';});
  const urgent=game.queue.filter(t=>t.severity<=2),risks=game.risks.filter(r=>r.status==='pending');
  $('desk-alert-button').hidden=!urgent.length&&!risks.length;
  $('desk-alert-button').textContent=urgent.length?`${urgent.length} urgent · ${formatSla(Math.min(...urgent.map(t=>t.deadline))-game.time)}`:`${risks.length} risk · ${formatSla(Math.min(...risks.map(r=>r.due))-game.time)}`;
}
function renderProjects(){
  const isKtlo=activeDeskTab==='ktlo';
  $('task-heading').textContent=isKtlo?'Keep the lights on':'Project desk';
  $('task-description').textContent=isKtlo?'Prevent known risks before impact. These timers keep running in every tab.':'Test before release. One worker shared with tickets. Hold does not finish a project.';
  const risks=game.risks.filter(r=>lifecycleFilter==='resolved'?r.status!=='pending':r.status==='pending');
  $('risk-register').hidden=!isKtlo;$('projects').hidden=isKtlo;
  const focus=document.activeElement?.dataset.project,focusAction=document.activeElement?.dataset.projectAction;
  const key=JSON.stringify([activeDeskTab,lifecycleFilter,game.projects.map(p=>[p.id,p.status,p.incidentOutcome,p.tested,p.held,game.completedNormal>=p.unlockAfter]),risks.map(r=>[r.id,r.status])]);
  if($('projects').dataset.key!==key){
    $('projects').dataset.key=key;
    const labels={test:'Run compatibility test',release:'Release verified change',unsafeRelease:'Release without testing',remediate:'Roll back and test',defer:'Defer safely',hold:'Hold project',resume:'Resume project'};
    const button=(p,action)=>`<button data-project="${p.id}" data-project-action="${action}" class="${action==='unsafeRelease'?'risky-project':''}">${labels[action]}${PROJECT_ACTIONS[action]?` · ${projectSeconds(game,action)}s`:''}</button>`;
    const projects=game.projects.filter(p=>lifecycleFilter==='resolved'?closedProject(p):!closedProject(p)&&!!p.held===(lifecycleFilter==='hold'));
    $('projects').innerHTML=projects.map(p=>{const locked=game.completedNormal<p.unlockAfter,risk=game.risks.find(r=>r.projectId===p.id&&r.status==='pending');const options=locked||closedProject(p)?[]:p.held?['resume']:risk?[]:p.tested?['release','defer','hold']:['test','unsafeRelease','defer','hold'];return `<article class="project-card"><h3>${escape(p.title)}</h3><p>${escape(p.description)}</p><span class="project-state">${locked?`Available after ${p.unlockAfter} routine cases`:p.held?'ON HOLD':p.status==='pending'?(p.tested?'Test passed · ready':'Awaiting testing'):p.status==='released'?'RISK ACTIVE · open KTLO':p.status==='deferred'?'Safely deferred':p.incidentId?(p.incidentOutcome==='recovered'?'Incident recovered – release needs retesting':p.incidentOutcome==='handed-off'?'Recovery handed off – restoration pending':'Escalated to INC – recovery required'):'Completed'}</span>${p.tested?`<p class="evidence-fact">${escape(p.finding)}</p>`:''}<div class="project-actions">${options.map(a=>button(p,a)).join('')}${risk?'<button data-open-ktlo>Open KTLO prevention task</button>':''}</div></article>`;}).join('');
    $('risk-register').innerHTML=risks.map(r=>`<article class="risk-card"><strong>${r.status==='pending'?'Incident risk':r.status==='prevented'?'Prevented':'Escalated to INC'} <span data-risk-time="${r.id}"></span></strong><p>${escape(r.cause)}</p>${r.status==='pending'?(r.projectId?`<div class="project-actions">${button(game.projects.find(p=>p.id===r.projectId),'remediate')}</div>`:`<button data-open-case="${r.sourceTicketId}">Correct the originating case</button>`):'<p>This risk is closed. Check INC resolved history for any resulting incident.</p>'}</article>`).join('');
    $('task-empty').hidden=(isKtlo?risks:projects).length>0;$('task-empty').textContent=isKtlo?'No prevention work in this view. Tested projects keep the lights on.':'No projects in this status. Check Active or Hold.';
    if(focus)document.querySelector(`[data-project="${CSS.escape(focus)}"][data-project-action="${CSS.escape(focusAction)}"]`)?.focus({preventScroll:true});
  }
  for(const r of risks){const timer=document.querySelector(`[data-risk-time="${r.id}"]`);if(timer)timer.textContent=r.status==='pending'?formatSla(r.due-game.time):'';}
  $('task-workspace').querySelectorAll('[data-project-action]').forEach(b=>b.disabled=!!game.work||game.status!=='playing');
}
function openCase(id){const t=game.queue.find(t=>t.id===id);if(!t)return;activeDeskTab=stream(t);lifecycleFilter=t.held?'hold':'active';tabSelection[activeDeskTab]=id;unread[activeDeskTab].delete(id);selectTicket(game,id);lastQueueKey='';render();}
const visibleActionTicket=()=>['inc','req'].includes(activeDeskTab)&&lifecycleFilter==='active'?Number($('ticket-detail').dataset.selectedTicket)||null:null;
function act(index, expected = visibleActionTicket(), stage = undefined) {
  if (game && expected===visibleActionTicket() && expected!==null && takeAction(game,index,expected,stage)) { unread[activeDeskTab]?.delete(expected); beep('click'); render(); }
}
function pause() {
  if (!game || game.status !== 'playing') return;
  // Apply time since the previous animation frame before pausing.
  advance(game,Math.max(0,(performance.now()-previousTime)/1000)); handleEvents();
  if (game.status === 'finished') return;
  game.status = 'paused'; for(const id of ['system-dialog','inbox-dialog'])if($(id).open)$(id).close(); render(); $('pause-dialog').showModal(); $('resume-button').focus();
}
function resume() {
  if (!game || game.status !== 'paused') return;
  game.status = 'playing'; previousTime = performance.now(); $('pause-dialog').close(); render(); $('pause-button').focus();
}
function finish(quit = false) {
  if (resultRecorded) return;
  resultRecorded = true; for(const id of ['system-dialog','character-dialog','inbox-dialog'])if($(id).open)$(id).close();
  if (quit) { game.status = 'finished'; game.work = null; game.bonus = 0; finishDungeon(game); }
  if ($('pause-dialog').open) $('pause-dialog').close();
  clearTimeout(toastTimer); $('outcome').classList.remove('visible');
  const rank = getRank(game), bestKey = `dungeon-${classId}`;
  const isBest = !quit && game.score > validBest(bestKey);
  if (isBest) { saved[bestKey] = game.score; save(); }
  $('result-title').textContent = quit ? 'Clocked out early' : rank.title;
  $('result-line').textContent = quit ? 'Sometimes the correct escalation is a break.' : rank.line;
  $('result-status').textContent = quit ? 'SHIFT ENDED EARLY' : game.morale > 0 ? (game.completion==='practice' ? 'PRACTICE COMPLETE' : 'SHIFT COMPLETE') : 'MORALE HAS LEFT THE CHAT';
  $('result-mode').textContent = `DAY ${life.day} · FLOOR ${game.dungeon.floor}`;
  endWorkday(life,game);
  renderDungeonRecap();
  $('go-home-button').hidden=false;
  $('final-score').textContent = game.score.toLocaleString(); $('new-best').hidden = !isBest;
  $('result-fixed').textContent = game.fixes; $('result-streak').textContent = game.bestStreak; $('result-morale').textContent = `${game.morale}%`;
  $('result-breakdown').textContent = `${game.patches} workarounds · ${game.assisted} assists · ${game.missed} missed · ${game.wrong} wrong moves. Morale bonus: +${game.bonus || 0}`;
  $('result-achievements').innerHTML = (game.achievements || []).map(a=>`<div><span>✦</span><strong>${escape(a.title)}</strong><span>+${a.points}</span></div>`).join('');
  $('result-breakdown').textContent += ` Bosses defeated: ${game.bossesDefeated || 0}/2. Incidents: ${game.incidentsResolved} recovered · ${game.incidentsMissed} missed · ${game.incidentsPrevented} prevented. Projects: ${game.projectsCompleted} completed · ${game.projectPoints} pts.`;
  $('result-tip').textContent = game.patches >= 3 ? 'A workaround can help once, but it does not reset the SLA. Resolve the underlying issue.' : game.missed >= 3 ? 'Sev 3 clocks wait for acknowledgement. Later Sev 1 clocks begin as soon as the incident is reported.' : game.wrong >= 2 ? 'A confident user is not a diagnostic tool. Ask questions or run a check before your next guess.' : 'Tested project releases earn +450. Correcting a self-created risk avoids impact but earns no bonus. Unsafe-project Sev 2 recovery earns +200; manufactured boss incidents earn no recovery points. Successful recovery restores morale.';
  $('share-status').textContent = ''; $('share-fallback').hidden = true;
  show('results'); $('results').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}); beep('end');
  document.body.classList.remove('low-morale','final-seconds'); renderLobby();
}
function frame(now) {
  if (game?.status === 'playing') { const dt = Math.max(0,(now-previousTime)/1000); previousTime = now; advance(game,dt); handleEvents(); render(); }
  requestAnimationFrame(frame);
}
$('start-button').addEventListener('click',()=>start()); $('replay-button').addEventListener('click',()=>start());
$('engineer-class').addEventListener('click',()=>{classId='engineer';renderLobby();}); $('faker-class').addEventListener('click',()=>{classId='faker';renderLobby();});
let acknowledgePressed = null;
$('acknowledge-button').addEventListener('pointerdown',()=>{acknowledgePressed=game?.selected ?? null;});
$('acknowledge-button').addEventListener('pointercancel',()=>{acknowledgePressed=null;});
$('acknowledge-button').addEventListener('click',e=>{const expected=e.detail===0 ? visibleActionTicket() : acknowledgePressed; acknowledgePressed=null; if(game && expected!==null && expected===visibleActionTicket() && expected===game.selected && acknowledgeTicket(game,expected)){handleEvents();render();$('actions').querySelector('button:not([disabled])')?.focus({preventScroll:true});}});
for (const [id,mode] of [['fix-view-button','fix'],['contact-user-button','question'],['diagnostics-button','diagnostic']]) {
  $(id).addEventListener('click',()=>{ if(game?.status !== 'playing') return; interactionView=mode; lastTicketKey=''; render(); });
}
let inquiryPressed = null;
$('investigation-options').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-inquiry]');inquiryPressed=b?{id:b.dataset.inquiry,ticket:Number(b.dataset.forTicket),stage:Number(b.dataset.stage)||undefined}:null;});
$('investigation-options').addEventListener('pointercancel',()=>{inquiryPressed=null;});
$('investigation-options').addEventListener('click',e=>{const b=e.target.closest('[data-inquiry]');if(!b)return;const target=e.detail===0?{id:b.dataset.inquiry,ticket:Number(b.dataset.forTicket),stage:Number(b.dataset.stage)||undefined}:inquiryPressed;inquiryPressed=null;if(target&&game&&investigateTicket(game,target.id,target.ticket,target.stage)){beep('click');render();}});
$('task-workspace').addEventListener('click',e=>{const b=e.target.closest('[data-project-action]');if(b&&game){const action=b.dataset.projectAction,ok=['hold','resume'].includes(action)?setProjectHeld(game,b.dataset.project,action==='hold'):startProject(game,b.dataset.project,action);if(ok){handleEvents();render();}}if(e.target.closest('[data-open-ktlo]'))setDeskTab('ktlo');const c=e.target.closest('[data-open-case]');if(c)openCase(Number(c.dataset.openCase));});
$('cancel-work-button').addEventListener('click',()=>{if(game&&cancelWork(game)){handleEvents();render();}});
$('skip-idle-button').addEventListener('click',()=>{if(game&&skipIdle(game)){handleEvents();if(game.selected)openCase(game.selected);render();$('acknowledge-button').focus({preventScroll:true});}});
$('menu-button').addEventListener('click',()=>{show('lobby');game=null;renderLobby();$('start-button').focus();});
$('sound-button').addEventListener('click',()=>{sound=!sound;saved.sound=sound;save();renderSound();beep('click');});
$('queue').addEventListener('click',e=>{const b=e.target.closest('[data-ticket],[data-history-ticket]');if(!b||!game)return;const id=Number(b.dataset.ticket||b.dataset.historyTicket);tabSelection[activeDeskTab]=id;unread[activeDeskTab]?.delete(id);if(b.dataset.ticket)selectTicket(game,id);render();});
// Bind clicks to the ticket visible at pointer-down; an expiring card cannot redirect the click.
$('actions').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-for-ticket]');pointerActionTicket=b?.dataset.forTicket ?? null;pointerActionStage=Number(b?.dataset.stage)||undefined;});
$('actions').addEventListener('pointercancel',()=>{pointerActionTicket=null;pointerActionStage=undefined;});
$('actions').addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button){const expected = e.detail===0?button.dataset.forTicket:pointerActionTicket ?? button.dataset.forTicket;const stage=e.detail===0?(Number(button.dataset.stage)||undefined):pointerActionStage ?? (Number(button.dataset.stage)||undefined);pointerActionTicket=null;pointerActionStage=undefined;act(Number(button.dataset.action),Number(expected),stage);}});
function bindSpecialAction(id, action) {
  let pressed = null;
  const button = $(id);
  button.addEventListener('pointerdown',()=>{ const t=game?.queue.find(t=>t.id===game.selected); pressed=t ? {id:t.id,stage:t.stage} : null; });
  button.addEventListener('pointercancel',()=>{pressed=null;});
  button.addEventListener('click',e=>{ const t=game?.queue.find(t=>t.id===game.selected); const target=e.detail===0 ? (t ? {id:t.id,stage:t.stage} : null) : pressed; pressed=null; if(target)act(action,target.id,target.stage); });
}
bindSpecialAction('assist-button','assist'); bindSpecialAction('bluff-button','bluff');
$('pause-button').addEventListener('click',pause); $('resume-button').addEventListener('click',resume); $('quit-button').addEventListener('click',()=>finish(true));
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resume();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('pagehide',()=>{if(game?.status==='playing')pause();});
document.addEventListener('keydown',e=>{
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const key=e.key.toLowerCase();
  if (!$('lobby').hidden && key==='enter' && (e.target===document.body || e.target===$('main'))) {e.preventDefault();start();return;}
  if ($('system-dialog').open || $('character-dialog').open) return;
  if ($('inbox-dialog').open) {if(key==='p'){e.preventDefault();pause();}return;}
  if (game?.status==='paused') {if(key==='p'){e.preventDefault();resume();}return;}
  if (game?.status!=='playing') return;
  if (key==='p' || key==='escape') {e.preventDefault();pause();return;}
  if (key==='a' && visibleActionTicket()!==null) {e.preventDefault();$('acknowledge-button').click();}
  if (visibleActionTicket()!==null && interactionView==='fix' && ['1','2','3'].includes(key)) {e.preventDefault();act(Number(key)-1);}
  if (key==='q'||key==='e') {e.preventDefault();const list=visibleCases(),index=list.findIndex(t=>t.id===tabSelection[activeDeskTab]);const next=list[(index+(key==='e'?1:-1)+list.length)%list.length];if(next){tabSelection[activeDeskTab]=next.id;if(lifecycleFilter!=='resolved')selectTicket(game,next.id);render();}}
});
$('share-button').addEventListener('click',async()=>{
  if (!game) return;
  const text=`Service Desk Hero · First Shift\n${game.score.toLocaleString()} points · ${game.fixes} lasting fixes · ${game.bestStreak} best streak\n${game.bossesDefeated || 0}/2 bosses · ${classId === 'faker' ? 'Fake It Till You Make It' : 'Root Cause Ranger'}
${today} daily shift. Can you beat my help desk?`;
  try {if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text);$('share-status').textContent='Challenge copied. Send it to your on-call group.';}
  catch {$('share-fallback').value=text;$('share-fallback').hidden=false;$('share-fallback').focus();$('share-fallback').select();$('share-status').textContent='Select and copy your challenge text above.';}
});

$('hold-button').addEventListener('click',()=>{const t=game?.queue.find(t=>t.id===Number($('ticket-detail').dataset.selectedTicket));if(t&&setTicketHeld(game,t.id,!t.held)){lifecycleFilter=t.held?'hold':'active';handleEvents();render();}});
$('next-open-button').addEventListener('click',()=>{const t=game?.queue.find(t=>!t.held);if(t)openCase(t.id);});
$('desk-alert-button').addEventListener('click',()=>{const t=game?.queue.filter(t=>t.severity<=2).sort((a,b)=>a.deadline-b.deadline)[0];if(t)openCase(t.id);else setDeskTab('ktlo');});
$('desk-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-desk-tab]');if(b)setDeskTab(b.dataset.deskTab);});
$('desk-tabs').addEventListener('keydown',e=>{const buttons=[...$('desk-tabs').querySelectorAll('[data-desk-tab]')],index=buttons.indexOf(document.activeElement);if(index<0)return;let next;if(e.key==='ArrowRight')next=(index+1)%buttons.length;else if(e.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();buttons[next].focus();setDeskTab(buttons[next].dataset.deskTab);});
$('desk-filters').addEventListener('click',e=>{const b=e.target.closest('[data-desk-filter]');if(b){lifecycleFilter=b.dataset.deskFilter;lastTicketKey='';lastQueueKey='';render();}});
$('system-button').addEventListener('click',()=>{$('system-dialog').showModal();$('close-system-button').focus();});
$('close-system-button').addEventListener('click',()=>{$('system-dialog').close();$('system-button').focus();});

function renderStartingStats(){
  const spent=Object.values(startingStats).reduce((a,b)=>a+b,0);
  $('lobby-stats').innerHTML=DUNGEON_STATS.map(stat=>`<div class="stat-row" data-stat="${stat.key}"><div><strong>${escape(stat.name)}</strong><small>${escape(stat.description)}</small></div><div class="stat-stepper"><button data-start-stat="${stat.key}" data-stat-adjust="-1" aria-label="Remove ${escape(stat.name)} point" ${!startingStats[stat.key]?'disabled':''}>−</button><b data-stat-value>${startingStats[stat.key]}</b><button data-start-stat="${stat.key}" data-stat-adjust="1" aria-label="Add ${escape(stat.name)} point" ${spent>=2?'disabled':''}>+</button></div></div>`).join('');
  $('lobby-stat-hint').textContent=`${2-spent} starting points available. Spend them now or in your character sheet. Every build can learn every solution.`;
}
function renderCharacter(){
  if(!game)return;
  const d=game.dungeon, summary=dungeonSummary(game), focused=document.activeElement?.dataset;
  const focusKey=focused?.levelStat?['levelStat',focused.levelStat]:focused?.skill?['skill',focused.skill]:focused?.gear?['gear',focused.gear]:null;
  $('dungeon-floor').textContent=`Floor ${d.floor}/3`;$('dungeon-level').textContent=`Level ${d.level}`;$('dungeon-xp').textContent=`${d.xp} XP`;
  $('character-class').textContent=`${classId==='engineer'?'Root Cause Ranger':'Fake It Till You Make It'} · Day ${life.day}. Build choices carry into later floors and tomorrow. No stat locks a correct fix.`;
  $('floor-map').innerHTML=DUNGEON_FLOORS.map(f=>`<div class="floor-node ${d.floor===f.id?'current':d.floor>f.id?'cleared':''}" ${d.floor===f.id?'aria-current="step"':''}><span>${f.id}</span><strong>${escape(f.name)}</strong><small>${f.afterNormal===0?'Entry':`${f.afterNormal} routine cases handled`}</small></div>`).join('');
  $('stat-points').textContent=`${d.statPoints} available`;
  $('character-stats').innerHTML=DUNGEON_STATS.map(stat=>`<div class="stat-row" data-stat="${stat.key}"><div><strong>${escape(stat.name)}</strong><small>${escape(stat.description)}</small></div><b data-stat-value>${d.stats[stat.key]}</b><button data-level-stat="${stat.key}" ${d.statPoints<=0?'disabled':''} aria-label="Increase ${escape(stat.name)}">+1</button></div>`).join('');
  $('skill-points').textContent=`${d.skillPoints} available`;
  const skillMarkup=skill=>{
    const r=skill.requirements||{}, learned=d.skills.includes(skill.id), parent=r.skillId && !d.skills.includes(r.skillId), excluded=(r.excludes||[]).some(id=>d.skills.includes(id));
    const unavailable=learned || !d.skillPoints || d.level<(r.level||skill.tier+1) || parent || excluded;
    const prerequisite=r.skillId?DUNGEON_SKILLS.find(s=>s.id===r.skillId)?.name:null;
    const why=learned?'Learned':excluded?'Other branch chosen':parent?`Requires ${prerequisite}`:d.level<(r.level||2)?`Unlocks at level ${r.level}`:!d.skillPoints?'No skill points':'Choose permanently';
    return `<button data-skill="${skill.id}" aria-pressed="${learned}" class="build-card tier-${skill.tier}" ${unavailable?'disabled':''}><span class="card-kicker">TIER ${skill.tier} · ${escape(skill.branch)}</span><strong>${escape(skill.name)}</strong><p>${escape(skill.description)}</p><small>${escape(why)}</small></button>`;
  };
  const classSkills=DUNGEON_SKILLS.filter(skill=>skill.classId===classId);
  $('character-skills').innerHTML=[...new Set(classSkills.map(skill=>skill.branch))].map(branch=>`<div class="skill-branch"><h4>${escape(branch)} branch</h4>${classSkills.filter(skill=>skill.branch===branch).map(skillMarkup).join('')}</div>`).join('');
  $('gear-points').textContent=`${d.gearChoices} cache choices`;
  $('character-gear').innerHTML=DUNGEON_GEAR.map(item=>{
    const learned=d.gear.includes(item.id), sameFloor=d.gear.some(id=>DUNGEON_GEAR.find(x=>x.id===id)?.floor===item.floor), locked=!d.checkpointsEarned.includes(item.floor), unavailable=learned||sameFloor||locked||!d.gearChoices;
    return `<button data-gear="${item.id}" aria-pressed="${learned}" class="build-card" ${unavailable?'disabled':''}><span class="card-kicker">FLOOR ${item.floor} CACHE</span><strong>${escape(item.name)}</strong><p>${escape(item.upside)}</p><p class="gear-cost">Cost: ${escape(item.downside)}</p><small>${learned?'Equipped':sameFloor?'Other item chosen':locked?`Reach floor ${item.floor}`:!d.gearChoices?'No cache choice available':'Equip for this run'}</small></button>`;
  }).join('');
  const journal=summary.journal||[];
  const prior=(summary.previousDays||[]).map(day=>day.text).filter(Boolean);
  $('dungeon-journal').innerHTML=`<p class="build-effects">Current work: fix ${actionSeconds(game,'fix')}s · question ${investigationSeconds(game,'question')}s · diagnostic ${investigationSeconds(game,'diagnostic')}s · test ${projectSeconds(game,'test')}s.</p>${prior.length?`<details><summary>Earlier days</summary>${prior.map(text=>`<p>${escape(text)}</p>`).join('')}</details>`:''}${journal.length?`<ol>${journal.map(entry=>`<li>${escape(typeof entry==='string'?entry:entry.text||entry.description||entry.title)}</li>`).join('')}</ol>`:'<p>Your run starts here. Floor rewards arrive after 4 and 8 routine cases are handled. Asking questions remains a complete path to every answer.</p>'}`;
  if(focusKey){const [key,value]=focusKey;const selector={'levelStat':'data-level-stat','skill':'data-skill','gear':'data-gear'}[key];const button=$('character-dialog').querySelector(`[${selector}="${CSS.escape(value)}"]`);if(button&&!button.disabled)button.focus({preventScroll:true});else $('close-character-button').focus({preventScroll:true});}
}
function openCharacter(){
  if(!game||game.status!=='playing')return;
  advance(game,Math.max(0,(performance.now()-previousTime)/1000));handleEvents();
  if(game.status!=='playing')return;
  game.status='paused';render();renderCharacter();$('character-dialog').showModal();$('close-character-button').focus();
}
function closeCharacter(){
  if(!$('character-dialog').open)return;
  $('character-dialog').close();if(game?.status==='paused'){game.status='playing';previousTime=performance.now();render();}$('character-button').focus({preventScroll:true});
}
function renderDungeonRecap(){
  const d=dungeonSummary(game);
  const names=list=>list.length?list.map(x=>x.name||x.label||x.id||x).join(', '):'None selected';
  const reactions=(d.bossReactions||[]).map(x=>typeof x==='string'?x:x.text||x.description||'').filter(Boolean);
  $('dungeon-summary').innerHTML=`<h2>Your run carries on</h2><p>Day ${life.day} · Floor ${d.floor}/3 · Level ${d.level} · ${d.xp} XP</p><p>${DUNGEON_STATS.map(x=>`${escape(x.name)} ${d.stats[x.key]}`).join(' · ')}</p><p><strong>Skills:</strong> ${escape(names(d.skills))}</p><p><strong>Equipment:</strong> ${escape(names(d.gear))}</p>${reactions.length?`<details><summary>How the bosses reacted</summary>${reactions.map(t=>`<p>${escape(t)}</p>`).join('')}</details>`:''}${(d.projectLog||[]).length?`<details><summary>Project decisions</summary>${d.projectLog.map(p=>`<p>${escape(p.text)}</p>`).join('')}</details>`:''}<p>Stats, skills, and equipment stay with you tomorrow. Tonight’s choices add their own consequences. A new run starts fresh.</p>`;
}
function renderInbox(){
  const messages=inboxFor(life);
  $('inbox-messages').innerHTML=(morningBriefing.length?`<section class="message-card morning-briefing" data-morning-briefing><div class="card-kicker">DAY ${life.day} · WHAT CARRIED FORWARD</div><h3>Morning briefing</h3><ul>${morningBriefing.map(text=>`<li>${escape(text)}</li>`).join('')}</ul></section>`:'')+messages.map(m=>`<article class="message-card"><div class="card-kicker">${escape(m.channel)} · ${escape(m.from)}</div><h3>${escape(m.subject)}</h3><p>${escape(m.body)}</p>${m.answered?`<p class="message-reply">${escape(m.reply)}</p>`:`<div class="message-choices">${m.choices.map(c=>`<button data-message="${m.id}" data-message-choice="${c.id}"><strong>${escape(c.label)}</strong><small>${escape(c.effect)}</small></button>`).join('')}</div>`}</article>`).join('');
  $('inbox-count').textContent=messages.filter(m=>!m.answered).length;
}
function renderHome(){
  const options=homeOptions(life);
  $('home-title').textContent=`Day ${life.day}: you made it home.`;
  $('home-intro').textContent=options.homeIntro;
  $('home-relationships').innerHTML=`<span>Energy <b>${life.energy}</b></span><span>Stress <b>${life.stress}</b></span><span>Rowan <b>${life.relationships.rowan}</b></span><span>Mira <b>${life.relationships.mira}</b></span><span>Packet <b>${life.relationships.packet}</b></span>`;
  $('evening-options').innerHTML=options.activities.map(c=>`<button data-evening="${c.id}" aria-pressed="${life.choices.evening===c.id}" class="life-choice" ${options.activityResult?'disabled':''}><strong>${escape(c.label)}</strong><p>${escape(c.description)}</p><small>${escape(c.effect)}</small></button>`).join('');
  $('evening-result').textContent=options.activityResult||'';
  const c=options.conversation;
  $('conversation-title').textContent=c.title;$('conversation-context').textContent=c.context;$('conversation-prompt').textContent=c.prompt;
  $('conversation-options').innerHTML=c.choices.map(choice=>`<button data-conversation="${choice.id}" aria-pressed="${life.choices.conversation===choice.id}" class="life-choice" ${!options.activityResult||options.conversationResult?'disabled':''}><strong>${escape(choice.label)}</strong><small>${escape(choice.effect)}</small></button>`).join('');
  $('conversation-result').textContent=options.conversationResult||'';
  $('next-day-button').disabled=life.stage!=='ready';
  $('next-day-button').textContent=`Begin day ${life.day+1}`;
  $('tomorrow-preview').textContent=life.stage==='ready'?'Tomorrow keeps your build. Energy, stress, and trust shape your opening morale and teammate support. See the morning inbox for the other side of tonight.':'Choose one evening activity, then respond to Rowan. Neither work nor perfect answers are required to continue.';
}
$('lobby-stats').addEventListener('click',e=>{const b=e.target.closest('[data-start-stat]');if(!b)return;const key=b.dataset.startStat,adjust=Number(b.dataset.statAdjust),spent=Object.values(startingStats).reduce((a,v)=>a+v,0);if((adjust===1&&spent<2)||(adjust===-1&&startingStats[key]>0)){startingStats[key]+=adjust;renderStartingStats();$('lobby-stats').querySelector(`[data-start-stat="${key}"][data-stat-adjust="${adjust}"]:not(:disabled)`)?.focus();}});
$('character-button').addEventListener('click',openCharacter);
$('close-character-button').addEventListener('click',closeCharacter);
$('character-dialog').addEventListener('cancel',e=>{e.preventDefault();closeCharacter();});
$('character-dialog').addEventListener('click',e=>{const b=e.target.closest('[data-level-stat],[data-skill],[data-gear]');if(!b||!game)return;const ok=b.dataset.levelStat?chooseDungeonStat(game,b.dataset.levelStat):b.dataset.skill?chooseDungeonSkill(game,b.dataset.skill):chooseDungeonGear(game,b.dataset.gear);if(ok){handleEvents();lastTicketKey='';$('projects').dataset.key='';renderCharacter();render();}});
$('inbox-button').addEventListener('click',()=>{if(game?.status!=='playing')return;renderInbox();$('inbox-result').textContent='';$('inbox-dialog').showModal();$('close-inbox-button').focus();});
$('close-inbox-button').addEventListener('click',()=>{$('inbox-dialog').close();$('inbox-button').focus();});
$('inbox-dialog').addEventListener('close',()=>{if(game?.status==='playing')$('inbox-button').focus({preventScroll:true});});
$('inbox-messages').addEventListener('click',e=>{const b=e.target.closest('[data-message-choice]');if(!b||!game||game.status!=='playing')return;if(chooseMessage(life,b.dataset.message,b.dataset.messageChoice)){const result=life.lastResult;game.morale=Math.max(0,Math.min(100,game.morale+result.moraleDelta));game.assists=Math.max(0,Math.min(4,game.assists+result.assistsDelta));renderInbox();$('inbox-result').textContent=result.text;addFeed(result.text);render();$('close-inbox-button').focus({preventScroll:true});}});
$('go-home-button').addEventListener('click',()=>{renderHome();show('home');$('home').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});});
$('evening-options').addEventListener('click',e=>{const b=e.target.closest('[data-evening]');if(b&&chooseEvening(life,b.dataset.evening)){renderHome();$('conversation-options').querySelector('button:not(:disabled)')?.focus({preventScroll:true});}});
$('conversation-options').addEventListener('click',e=>{const b=e.target.closest('[data-conversation]');if(b&&chooseConversation(life,b.dataset.conversation)){renderHome();$('next-day-button').focus({preventScroll:true});}});
$('next-day-button').addEventListener('click',()=>{const carriedBuild=dungeonSnapshot(game),carry=beginNextDay(life);if(carry)start({...carry,dungeonCarry:carriedBuild});});
$('home-menu-button').addEventListener('click',()=>{show('lobby');game=null;renderLobby();$('start-button').focus();});

renderLobby();renderSound();requestAnimationFrame(frame);
