/** Pure deterministic simulation. No browser APIs, storage, or network. */
import { TICKETS } from './rush-tickets.js';
import { PROJECTS, PROJECT_ACTIONS, incidentSource } from './rush-projects.js';
export { PROJECTS, PROJECT_ACTIONS } from './rush-projects.js';
import { BOSSES } from './rush-bosses.js';
export { BOSSES } from './rush-bosses.js';
import {createDungeon, progressDungeon, gainDungeonXP, dungeonEffects, scaledDungeonSeconds, dungeonMoraleLoss, recordDungeonProject, dungeonBossReaction, finishDungeon} from './rush-dungeon.js';
export {DUNGEON_STATS, DUNGEON_SKILLS, DUNGEON_GEAR, DUNGEON_FLOORS, chooseDungeonStat, chooseDungeonSkill, chooseDungeonGear, dungeonSummary, dungeonSnapshot, finishDungeon, dungeonEffects, dungeonMoraleLoss} from './rush-dungeon.js';
export const TOTAL_NORMAL = 12;
export const SLA_SECONDS = Object.freeze({ 3: 15 * 60, 2: 180, 1: 60 });
export const ARRIVAL_SECONDS = Object.freeze({ min: 30, max: 120 });
export const INVESTIGATIONS = Object.freeze({
  question: { seconds: 2 },
  diagnostic: { seconds: 4 },
});
// Legacy display target only. A finite shift retains every reported issue, including overflow.
export const CAPACITY = 5;
export const ACTIONS = Object.freeze({
  fix: { seconds: 2.4, points: 150 },
  patch: { seconds: 0.8, points: 55 },
  wrong: { seconds: 2.4, points: 0 },
  assist: { seconds: 0.4, points: 75 },
  bluff: { seconds: 0.8, points: 75 },
});
/** Display and simulation use these same duration helpers. Invalid kinds return null. */
export function actionSeconds(g,kind) {return Object.hasOwn(ACTIONS,kind)?scaledDungeonSeconds(g,ACTIONS[kind].seconds,['fix','wrong'].includes(kind)?'fixTime':''):null;}
export function investigationSeconds(g,kind) {return Object.hasOwn(INVESTIGATIONS,kind)?scaledDungeonSeconds(g,INVESTIGATIONS[kind].seconds,kind==='question'?'questionTime':'diagnosticTime'):null;}
export function projectSeconds(g,action) {return Object.hasOwn(PROJECT_ACTIONS,action)?scaledDungeonSeconds(g,PROJECT_ACTIONS[action],'projectTime'):action==='defer'?0:null;}
export const CLASSES = Object.freeze({
  engineer: { title: 'The Engineer', description: '+25 points for each correct technical action', fixBonus: 25 },
  faker: { title: 'The Faker', description: 'One bluff per boss: skill below 5 buys time; expertise calls your bluff', fixBonus: 0 },
});
export const ACHIEVEMENTS = Object.freeze({
  firstfix: { id: 'firstfix', title: 'Percussive Maintenance Avoided', description: 'Close your first ticket with a real fix', points: 100 },
  threestreak: { id: 'threestreak', title: 'The Documentation Prophecy', description: 'Make three correct technical moves in a row', points: 125 },
  firstboss: { id: 'firstboss', title: 'This Could Have Been a Ticket', description: 'Defeat your first two-stage boss', points: 150 },
  successfulbluff: { id: 'successfulbluff', title: 'Certified in Saying Synergy', description: 'Buy time by bluffing a low-skill boss', points: 100 },
  perfectsurvival: { id: 'perfectsurvival', title: 'The Pager Sleeps Tonight', description: 'Survive the full shift with no missed tickets or wrong moves', points: 200 },
});
export function seededRandom(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const EPSILON = 1e-7;
const tickTime = n => Math.round(n * 1e9) / 1e9;
function actionsFor(source, random) { return shuffle(source.actions.map(a => ({ ...a })), random); }
/** The legacy relaxed argument is accepted for callers; every shift uses the same paced lifecycle. */
export function createGame(seed = 'practice', relaxed = false, classId = 'engineer', options = {}) {
  if(!options || typeof options!=='object' || Array.isArray(options)) throw new TypeError('Game options must be an object.');
  const random = seededRandom(seed);
  const game = { seed: String(seed), relaxed: Boolean(relaxed), classId: Object.hasOwn(CLASSES, classId) ? classId : 'engineer',
    random, arrivalRandom: seededRandom(`${seed}:arrivals`), nextArrival: null,
    deck: shuffle(TICKETS, random).slice(0, TOTAL_NORMAL), cursor: 0, time: 0, score: 0, morale: 100,
    streak: 0, bestStreak: 0, resolved: 0, fixes: 0, patches: 0, wrong: 0, missed: 0,
    assists: 3, assisted: 0, bluffs: 0, successfulBluffs: 0, bossesDefeated: 0, bossesMissed: 0,
    bossStagesCleared: 0, achievements: [], achievementPoints: 0,
    completedNormal: 0, reportedNormal: 0, totalNormal: TOTAL_NORMAL, normalFixes: 0,
    sev1Unlocked: false, printerDefeated: false,
    projects: PROJECTS.map(p => ({...p, status:"pending", tested:false})), risks: [], nextRiskId:1,
    incidentsReported:0, incidentsResolved:0, incidentsMissed:0, incidentsPrevented:0, projectsCompleted:0, projectPoints:0,
    bossStatus: Object.fromEntries(BOSSES.map(boss => [boss.id, 'pending'])),
    queue: [], returns: [], history: [], nextId: 1,
    selected: null, work: null, phase: 0, status: 'playing', events: [] };
  game.dungeon=createDungeon(options,game.classId);
  addTicket(game);
  scheduleArrival(game);
  emit(game, 'narrator', { text: 'Welcome to the Incident Theatre. Read at your own pace, then acknowledge your first Sev 3 ticket to start its 15-minute SLA.' });
  return game;
}
function emit(g, type, detail = {}) { g.events.push({ type, ...detail }); }
function award(g, id) {
  if (g.achievements.some(a => a.id === id)) return;
  const reward = { ...ACHIEVEMENTS[id] };
  g.achievements.push(reward); g.achievementPoints += reward.points; g.score += reward.points;
  emit(g, 'achievement', { ...reward, achievement: reward, text: `${reward.title} · +${reward.points}` });
}
function repairSelection(g) {
  if (!g.queue.some(t => t.id === g.selected)) g.selected = g.queue[0]?.id ?? null;
}
function settleTicket(g, ticket, resolution) {
  if (ticket.resolution) return;
  ticket.resolution = resolution;
  ticket.closedAt=g.time;
  g.history.push({...ticket,actions:ticket.actions.map(a=>({...a})),evidence:[...(ticket.previousEvidence||[]),...ticket.evidence].map(e=>({...e}))});
  if (ticket.incident) {
    if (resolution === 'fix') g.incidentsResolved++; else g.incidentsMissed++;
    const project=g.projects.find(p=>p.incidentId===ticket.id);
    if(project) project.incidentOutcome=resolution==='fix'?'recovered':'handed-off';
  } else if (ticket.boss) {
    g.bossStatus[ticket.bossId] = resolution === 'fix' ? 'defeated' : 'missed';
    if (ticket.bossId === BOSSES[0].id && resolution === 'fix') g.printerDefeated = true;
  } else {
    g.completedNormal++;
    if (resolution === 'fix') g.normalFixes++;
    gainDungeonXP(g,`routine-${ticket.rootId}`,resolution==='fix'?25:resolution==='assist'?15:10,`${ticket.source.title}: case handled`);
    progressDungeon(g);
  }
}
function missTicket(g, ticket) {
  if (ticket.resolution) return;
  const penalty = dungeonMoraleLoss(g,ticket.boss ? 25 : 14);
  g.morale = Math.max(0, g.morale - penalty); g.missed++; g.streak = 0;
  if (ticket.boss) g.bossesMissed++;
  if(ticket.incident) ticket.handoff={status:'recovery-pending',owner:'next recovery shift',text:'SLA missed. Recovery handed to the next shift; service restoration is still pending. No recovery reward.'};
  settleTicket(g, ticket, 'missed');
  if (g.work?.ticketId === ticket.id) g.work = null;
  emit(g, 'expired', { id: ticket.id, boss: !!ticket.boss, bossId: ticket.bossId, penalty,
    incident:!!ticket.incident, text: `${ticket.source.title}: SLA missed. -${penalty} morale${ticket.handoff?' '+ticket.handoff.text:''}` });
}
function reportTicket(g, source, severity, extra = {}) {
  const id = g.nextId++, slaSeconds = SLA_SECONDS[severity];
  const ticket = { id, rootId: id, source, severity, slaSeconds, urgent: severity <= 2,
    acknowledged: false, acknowledgedAt: null, reportedAt: g.time, arrival: g.time,
    deadline: severity <= 2 ? tickTime(g.time + slaSeconds) : null, patience: slaSeconds,
    held:false, workstream:source.workstream || 'inc', reopened: false, patchUsed: false, resolution: null, evidence: [], inquiryCount:0, mistakes:0, ...extra,
    actions: actionsFor(source, g.random) };
  g.queue.push(ticket); repairSelection(g);
  return ticket;
}
function addTicket(g) {
  if (g.reportedNormal >= g.totalNormal) return;
  const source = g.deck[g.cursor++];
  const ticket = reportTicket(g, source, 3);
  g.reportedNormal++;
  emit(g, 'arrival', { id: ticket.id, severity: ticket.severity, text: source.title });
}
function returnTicket(g, returning) {
  const ticket = returning.ticket;
  ticket.reopened = true;
  g.queue.push(ticket); repairSelection(g);
  emit(g, 'return', { id: ticket.id, severity: ticket.severity,
    text: `${ticket.source.title} returns for its encore. The original SLA is still running; this issue now needs a lasting fix.` });
}
function addBoss(g, boss) {
  const severity = 3;
  const ticket = reportTicket(g, boss.stages[0], severity, {
    boss: true, bossId: boss.id, stage: 1, stageCount: boss.stages.length,
    techSkill: boss.techSkill, bluffed: false,
  });
  g.bossStatus[boss.id] = 'active';
  ticket.dungeonReaction=dungeonBossReaction(g,boss);
  emit(g, 'boss-arrival', { id: ticket.id, bossId: boss.id, severity, techSkill: boss.techSkill,
    title: boss.title, text: boss.entrance });
}
function eligibleBoss(g) {
  return BOSSES.find(b => g.bossStatus[b.id] === 'pending' && g.completedNormal >= b.afterNormal);
}
function hasUnreportedIssues(g) {
  return g.reportedNormal < g.totalNormal || Object.values(g.bossStatus).some(s => s === 'pending');
}
function scheduleArrival(g) {
  g.nextArrival = hasUnreportedIssues(g)
    ? tickTime(g.time + ARRIVAL_SECONDS.min + Math.floor(g.arrivalRandom() * (ARRIVAL_SECONDS.max - ARRIVAL_SECONDS.min + 1)))
    : null;
}
/** A scheduled report may overlap any open issue; eligible bosses get the next slot. */
function reportNext(g) {
  const boss = eligibleBoss(g);
  if (boss) {
    if (boss.id === BOSSES[0].id) {
      g.phase = Math.max(g.phase, 1);
      emit(g, 'phase', { phase: 1, text: 'ACT II: THE PRINTER TAKES THE STAGE · STILL SEV 3' });
    }
    addBoss(g, boss);
  } else if (g.reportedNormal < g.totalNormal) addTicket(g);
  else {
    // The finite normal deck is exhausted. Park the clock until a completion
    // makes a pending boss eligible, rather than revisiting a stale boundary.
    g.nextArrival = null;
    return;
  }
  scheduleArrival(g);
}
/** Completion unlocks severity and eligibility, never an immediate report. */
function progressShift(g) {
  if (g.status !== 'playing') return;
  if (g.morale <= 0) { endGame(g); return; }
  if (!g.sev1Unlocked && g.normalFixes >= 8 && g.printerDefeated) {
    g.sev1Unlocked = true; g.phase = 2;
    emit(g, 'sev1-unlocked', { text: 'Sev 1 responsibility unlocked. Prevent unsafe changes: after your first Sev 2, a later neglected risk can cause a 60-second Sev 1. Good work can prevent both.' });
    emit(g, 'phase', { phase: 2, text: 'ACT III: PREVENT THE NEXT INCIDENT' });
  }
  if (!g.queue.length && !g.returns.length && !g.work && g.completedNormal === g.totalNormal &&
      Object.values(g.bossStatus).every(s => s === 'defeated' || s === 'missed') &&
      !g.risks.some(r=>r.status==='pending') && g.projects.every(p=>['completed','deferred'].includes(p.status))) {
    endGame(g);
    return;
  }
  if (g.nextArrival === null && (g.reportedNormal < g.totalNormal || eligibleBoss(g))) scheduleArrival(g);
}
/** Acknowledgement starts a Sev 3 SLA once; Sev 1 clocks already started at report. */
export function acknowledgeTicket(g, id) {
  if (g.status !== 'playing') return false;
  const ticket = g.queue.find(t => t.id === id);
  if (!ticket || ticket.held || ticket.acknowledged || (ticket.deadline !== null && ticket.deadline <= g.time + EPSILON)) return false;
  ticket.acknowledged = true; ticket.acknowledgedAt = g.time;
  if (ticket.deadline === null) ticket.deadline = tickTime(g.time + ticket.slaSeconds);
  emit(g, 'acknowledged', { id, severity: ticket.severity, deadline: ticket.deadline,
    text: ticket.severity === 3 ? 'Acknowledged. Your 15-minute SLA starts now.' : `Acknowledged. The Sev ${ticket.severity} SLA has been running since this incident was reported.` });
  return true;
}
/** Hold is a workflow label, never a clock pause. Only Pause freezes the simulation. */
export function setTicketHeld(g,id,held) {
  if(g.status!=='playing'||typeof held!=='boolean') return false;
  const ticket=g.queue.find(t=>t.id===id);
  if(!ticket||ticket.held===held||g.work?.ticketId===id) return false;
  ticket.held=held;
  emit(g,'held',{id,held,text:held?'On hold. Any running SLA continues; resume this case to work on it.':'Case resumed. Its original SLA is unchanged.'});
  return true;
}
export function setProjectHeld(g,id,held) {
  if(g.status!=='playing'||typeof held!=='boolean') return false;
  const project=g.projects.find(p=>p.id===id);
  if(!project||project.status!=='pending'||!!project.held===held||g.work?.projectId===id||g.completedNormal<project.unlockAfter) return false;
  project.held=held;emit(g,'project',{text:held?`${project.title} on hold. No release occurred.`:`${project.title} resumed.`});return true;
}
export function selectTicket(g, id) {
  if (g.status !== 'playing' || !g.queue.some(t => t.id === id)) return false;
  g.selected = id; return true;
}
/** Questions and diagnostics reveal authored evidence, without changing the solution or score. */
export function investigateTicket(g, id, expectedTicketId = g.selected, expectedStage = undefined) {
  if (g.status !== 'playing' || g.work || g.selected !== expectedTicketId) return false;
  const ticket = g.queue.find(t => t.id === g.selected);
  if (!ticket || ticket.held || !ticket.acknowledged || (ticket.deadline !== null && ticket.deadline <= g.time + EPSILON) ||
      (expectedStage !== undefined && ticket.stage !== expectedStage)) return false;
  const investigation = ticket.source.investigations?.find(item => item.id === id);
  if (!investigation || !Object.hasOwn(INVESTIGATIONS, investigation.kind) || ticket.evidence.some(item => item.id === id)) return false;
  g.work = { type: 'investigation', ticketId: ticket.id, stage: ticket.stage,
    action: { kind: investigation.kind, label: investigation.label }, investigation: { ...investigation },
    started: g.time, ends: tickTime(g.time + investigationSeconds(g,investigation.kind)) };
  emit(g, 'work', { kind: investigation.kind, ticketId: ticket.id, investigationId: id });
  return true;
}
/** Optional expectedStage protects clicks rendered for an earlier boss stage. */
export function takeAction(g, index, expectedTicketId = g.selected, expectedStage = undefined) {
  if (g.status !== 'playing' || g.work || g.selected !== expectedTicketId) return false;
  const ticket = g.queue.find(t => t.id === g.selected);
  if (!ticket || ticket.held || !ticket.acknowledged || (ticket.deadline !== null && ticket.deadline <= g.time + EPSILON) ||
      (expectedStage !== undefined && ticket.stage !== expectedStage)) return false;
  let action;
  if (index === 'assist') {
    if (ticket.boss || ticket.incident || g.assists <= 0) return false;
    action = { kind: 'assist', label: 'Ask a teammate', outcome: 'Your teammate takes a bow. You inherit a coffee debt.' };
  } else if (index === 'bluff') {
    if (g.classId !== 'faker' || !ticket.boss || ticket.bluffed) return false;
    action = { kind: 'bluff', label: 'Deploy impressive jargon' };
  } else if (Number.isInteger(index) && index >= 0) action = ticket.actions[index];
  if (!action || action.tried || !Object.hasOwn(ACTIONS, action.kind) || (action.kind === 'patch' && ticket.patchUsed)) return false;
  if (action.kind === 'assist') g.assists--;
  if (action.kind === 'bluff') { ticket.bluffed = true; g.bluffs++; }
  g.work = { ticketId: ticket.id, stage: ticket.stage, action, effects:dungeonEffects(g), moralePenalty:dungeonMoraleLoss(g,10), bossReward:ticket.dungeonReaction?{stageBonus:ticket.dungeonReaction.stageBonus,recovery:ticket.dungeonReaction.recovery}:null, started: g.time, ends: tickTime(g.time + actionSeconds(g,action.kind)) };
  emit(g, 'work', { kind: action.kind });
  return true;
}

function addRisk(g, details) {
  const risk = { ...details, id:g.nextRiskId++, due:tickTime(g.time+60), status:'pending' };
  g.risks.push(risk);
  emit(g,'risk',{text:`Risk created: ${risk.cause} You have 60 seconds to correct it before a major incident.`,riskId:risk.id});
  return risk;
}
function preventRisk(g,risk) {
  if(risk.status!=='pending') return;
  risk.status='prevented'; g.incidentsPrevented++;
  // All current risks originate in the player's unsafe action. Repairing one
  // avoids its consequence but cannot create a repeatable reward loop.
  emit(g,'prevented',{text:`Incident prevented: ${risk.service}. Self-created risk corrected; no prevention bonus. Tested releases earn the safety reward.`});
}
function escalateRisk(g,risk) {
  risk.status='incident';
  const severity=g.incidentsReported>0 && g.sev1Unlocked ? 1 : 2;
  const ticket=reportTicket(g,incidentSource(risk,severity),severity,{incident:true,riskId:risk.id,cause:risk.cause,recoveryPoints:risk.sourceTicketId?0:severity===2?200:300});
  g.incidentsReported++; g.selected=ticket.id;
  const project=g.projects.find(p=>p.id===risk.projectId);
  if(project) {project.status='completed';project.incidentId=ticket.id;}
  emit(g,'incident',{text:`SEV ${severity}: ${ticket.source.title}. Cause: ${risk.cause} ${ticket.slaSeconds} seconds from report.`,id:ticket.id});
}
/** Projects share the same worker as tickets. No background free progress. */
export function startProject(g,id,action) {
  if(g.status!=='playing'||g.work) return false;
  const project=g.projects.find(p=>p.id===id);
  if(!project || project.held || g.completedNormal<project.unlockAfter || ['completed','deferred'].includes(project.status)) return false;
  const risk=g.risks.find(r=>r.projectId===id&&r.status==='pending');
  if(action==='defer') {
    if(risk || project.status==='released') return false;
    project.status='deferred';recordDungeonProject(g,project,'defer'); emit(g,'project',{text:`${project.title} deferred safely. No release, no new risk, no project reward.`}); progressShift(g); return true;
  }
  if(!Object.hasOwn(PROJECT_ACTIONS,action)) return false;
  if(action==='remediate' ? !risk : project.status!=='pending') return false;
  if(action==='test' && project.tested || action==='release' && !project.tested || action==='unsafeRelease' && project.tested) return false;
  g.work={type:'project',projectId:id,projectAction:action,action:{kind:'project',label:project.title},effects:dungeonEffects(g),started:g.time,ends:tickTime(g.time+projectSeconds(g,action))};
  return true;
}
export function cancelWork(g) {
  if(g.status!=='playing'||g.work?.type!=='project') return false;
  g.work=null; emit(g,'project',{text:'Project step interrupted. Its unfinished test or release must be restarted; ticket clocks kept running.'}); return true;
}
function completeProject(g,work) {
  const project=g.projects.find(p=>p.id===work.projectId);
  const action=work.projectAction;
  if(action==='test') {project.tested=true;recordDungeonProject(g,project,action); emit(g,'project',{text:`${project.title}: ${project.finding} Ready for a verified release.`});}
  else if(action==='unsafeRelease') {
    project.status='released';project.releaseMethod='unsafe';project.unsafeEver=true;recordDungeonProject(g,project,action);
    addRisk(g,{projectId:project.id,service:project.service,incidentTitle:project.incidentTitle,cause:`${project.title} was released without a compatibility test.`});
  } else if(action==='remediate') {
    const risk=g.risks.find(r=>r.projectId===project.id&&r.status==='pending');
    if(risk) {preventRisk(g,risk);project.status='completed';project.releaseMethod='remediated';g.projectsCompleted++;recordDungeonProject(g,project,action);}
    else emit(g,'project',{text:'The incident was reported before the preventative test finished. Resolve it in the ticket queue.'});
  } else {const points=450+work.effects.testedBonus;project.status='completed';project.releaseMethod='tested';g.projectsCompleted++;g.score+=points;g.projectPoints+=points;recordDungeonProject(g,project,action);emit(g,'project',{text:`${project.title} shipped safely. +${points} points. Testing kept the department working.`});}
}

function completeBluff(g, ticket, work) {
  const effects=work.effects,influence=5+effects.bluffPower,success = ticket.techSkill < influence;
  let points = 0;const seconds=10+effects.bluffSeconds,recovery=10+effects.bluffRecovery,penalty=work.moralePenalty;
  if (success) {
    ticket.deadline = tickTime(ticket.deadline + seconds); ticket.patience += seconds;
    g.morale = Math.min(100, g.morale + recovery); points = ACTIONS.bluff.points+effects.bluffBonus; g.score += points;
    g.successfulBluffs++;
  } else { g.morale = Math.max(0, g.morale - penalty); g.wrong++; g.streak = 0; }
  emit(g, 'bluff', { id: ticket.id, bossId: ticket.bossId, success, points, techSkill: ticket.techSkill,influence,seconds:success?seconds:0,penalty:success?0:penalty,
    text: success ? `“Cross-functional quantum alignment.” The boss nods. +${seconds}s patience, +${recovery} morale, +${points} points. The technical problem is still waiting.` : `The printer requests your packet capture. Bluff detected: −${penalty} morale. Influence ${influence} must exceed expertise ${ticket.techSkill}. The technical problem is still waiting.` });
  if (success) award(g, 'successfulbluff');
}
function completeWork(g) {
  const work = g.work;
  if (!work) return;
  g.work = null;
  if (work.type === 'project') { completeProject(g, work); return; }
  const ticket = g.queue.find(t => t.id === work.ticketId);
  if (!ticket || ticket.stage !== work.stage) return;
  if (work.type === 'investigation') {
    const { id, kind, label, reply, evidence, quality } = work.investigation;
    const finding = { id, kind, label, reply, evidence, quality, stage:ticket.stage || 0 };
    if (!ticket.evidence.some(item => item.id === id)) {
      ticket.evidence.push(finding); ticket.inquiryCount++;
      emit(g, 'investigation', { ticketId: ticket.id, stage: ticket.stage, ...finding, text: reply });
    }
    return;
  }
  const kind = work.action.kind;
  if (kind === 'bluff') { completeBluff(g, ticket, work); return; }
  const completedStage = ticket.stage, completedTitle = ticket.source.title;
  const moraleBefore=g.morale;
  const expert=kind==='fix'&&!ticket.incident&&!ticket.inquiryCount&&!ticket.mistakes&&!ticket.patchUsed;
  const investigated=kind==='fix'&&!ticket.incident&&!ticket.mistakes&&!ticket.patchUsed&&ticket.evidence.some(e=>!e.quality);
  let points = 0, penalty = 0, defeated = false, closed = false;
  if (kind === 'wrong') {
    penalty=work.moralePenalty;g.wrong++; ticket.mistakes++; g.streak = 0; g.morale = Math.max(0, g.morale - penalty);
    ticket.actions = ticket.actions.map(a => a === work.action ? { ...a, tried: true } : a);
    if (work.action.risk) addRisk(g, {...work.action.risk, cause:`Ticket #${ticket.id}: ${work.action.label}. ${work.action.risk.cause}`, sourceTicketId:ticket.id});
  } else if (kind === 'fix') {
    g.streak++; g.bestStreak = Math.max(g.bestStreak, g.streak);
    points = ACTIONS.fix.points + CLASSES[g.classId].fixBonus + Math.min(5, g.streak - 1) * 25 + (ticket.urgent && !ticket.boss ? 50 : 0);
    g.morale = Math.min(100, g.morale + (ticket.incident ? 10 : 4)+work.effects.recovery);
    if (ticket.incident) points = ticket.recoveryPoints ?? (ticket.severity === 2 ? 200 : 300);
    else if (expert || investigated) points += 25;
    // Correcting the offending case before its risk matures prevents the major incident.
    for (const risk of g.risks.filter(r=>r.status==='pending' && r.sourceTicketId===ticket.id)) preventRisk(g,risk);
    if (ticket.boss) {
      g.bossStagesCleared++;
      gainDungeonXP(g,`boss-${ticket.bossId}-stage-${ticket.stage}`,40,`${ticket.source.title}: stage cleared`);
      if(work.bossReward){points+=work.bossReward.stageBonus;g.morale=Math.min(100,g.morale+work.bossReward.recovery);}
      const boss = BOSSES.find(b => b.id === ticket.bossId);
      if (ticket.stage < boss.stages.length) {
        ticket.previousEvidence=[...(ticket.previousEvidence||[]),...ticket.evidence];
        ticket.stage++; ticket.source = boss.stages[ticket.stage - 1]; ticket.actions = actionsFor(ticket.source, g.random); ticket.evidence = []; ticket.inquiryCount=0; ticket.mistakes=0;
        emit(g, 'boss-stage', { id: ticket.id, bossId: ticket.bossId, stage: ticket.stage, stageCount: ticket.stageCount,
          text: 'One fault down. The second act begins. Read the new evidence before you make your move.' });
      } else {
        defeated = true; closed = true; g.bossesDefeated++; points += 350;
        emit(g, 'boss-defeated', { id: ticket.id, bossId: ticket.bossId, title: boss.title, points: 350, text: boss.defeat });
      }
    } else closed = true;
    if (closed) {
      g.queue = g.queue.filter(t => t.id !== ticket.id); g.resolved++; g.fixes++;
      settleTicket(g, ticket, 'fix');
    }
  } else {
    g.queue = g.queue.filter(t => t.id !== ticket.id); g.streak = 0;
    if (kind === 'patch') {
      ticket.patchUsed = true;
      ticket.actions = ticket.actions.map(a => a.kind === 'patch' ? { ...a, tried: true } : a);
      g.patches++; points = ACTIONS.patch.points;
      g.returns.push({ at: tickTime(g.time + 11), ticket, source: ticket.source });
    } else {
      g.assisted++; g.resolved++; points = ACTIONS.assist.points; closed = true;
      settleTicket(g, ticket, 'assist');
    }
  }
  g.score += points; repairSelection(g);
  emit(g, 'outcome', { kind, points, penalty, text: work.action.outcome, title: completedTitle, streak: g.streak,
    boss: !!ticket.boss, incident:!!ticket.incident, expert, investigated, moraleDelta:g.morale-moraleBefore, stage: completedStage, defeated, closed });
  if (kind === 'fix') {
    if (closed && !ticket.incident) award(g, 'firstfix');
    if (g.streak >= 3 && !ticket.incident) award(g, 'threestreak');
    if (defeated) award(g, 'firstboss');
  }
}
function expireTickets(g) {
  const expired = [...g.queue, ...g.returns.map(r => r.ticket)]
    .filter(t => t.deadline !== null && t.deadline <= g.time + EPSILON);
  for (const ticket of expired) {
    g.queue = g.queue.filter(t => t.id !== ticket.id);
    g.returns = g.returns.filter(r => r.ticket.id !== ticket.id);
    missTicket(g, ticket);
  }
  repairSelection(g);
}
function endGame(g) {
  if (g.status === 'finished') return;
  g.status = 'finished'; g.work = null; g.nextArrival = null;
  g.completion = g.morale <= 0 ? 'morale' : g.sev1Unlocked ? 'career' : 'practice';
  g.bonus = g.morale > 0 ? Math.round(g.morale * 3) : 0; g.score += g.bonus;
  if (g.completedNormal === g.totalNormal && g.bossesDefeated === BOSSES.length &&
      g.morale > 0 && g.missed === 0 && g.wrong === 0 && g.incidentsReported === 0) award(g, 'perfectsurvival');
  finishDungeon(g);
  emit(g, 'end', { completion: g.completion });
}
/** Event-boundary stepping keeps results independent of frame rate. Pausing freezes all clocks. */
export function advance(g, seconds) {
  if (g.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
  const target = tickTime(g.time + seconds);
  if (!Number.isFinite(target)) return;
  while (g.time < target - EPSILON && g.status === 'playing') {
    const deadlines = [...g.queue, ...g.returns.map(r => r.ticket)]
      .filter(t => t.deadline !== null).map(t => t.deadline);
    const boundary = Math.min(target, g.nextArrival ?? Infinity, g.work?.ends ?? Infinity, ...g.returns.map(r => r.at), ...g.risks.filter(r=>r.status==='pending').map(r=>r.due), ...deadlines);
    g.time = Math.max(g.time, boundary);
    // Work completed exactly on the deadline succeeds; work still in progress expires.
    if (g.work && g.work.ends <= g.time + EPSILON) completeWork(g);
    expireTickets(g);
    if (g.morale <= 0) { endGame(g); break; }
    const due = g.returns.filter(r => r.at <= g.time + EPSILON);
    g.returns = g.returns.filter(r => r.at > g.time + EPSILON);
    due.forEach(r => returnTicket(g, r));
    for (const risk of g.risks.filter(r=>r.status==='pending' && r.due <= g.time + EPSILON)) escalateRisk(g,risk);
    progressShift(g);
    if (g.status === 'playing' && g.nextArrival !== null && g.nextArrival <= g.time + EPSILON) reportNext(g);
  }
}
/** Skip only genuinely idle time; never jump over reading, work, or a patched issue's return. */
export function skipIdle(g) {
  if (g.status !== 'playing' || g.queue.length || g.returns.length || g.work || g.risks.some(r=>r.status==='pending') || !Number.isFinite(g.nextArrival) || g.nextArrival <= g.time) return false;
  advance(g, g.nextArrival - g.time);
  return true;
}
export function drainEvents(g) { return g.events.splice(0); }
export function getRank(g) {
  if (g.morale <= 0) return { title: 'Out of office', line: 'The queue has seized the theatre. Management calls this audience participation.' };
  if (g.completion === 'practice') return { title: 'Practice Shift Complete', line: 'Keep building your diagnosis skills. Eight lasting normal fixes and a printer defeat unlock Sev 1 incidents.' };
  if (g.score >= (g.classId === 'faker' ? 5800 : 6200)) return { title: 'Incident Theatre Legend', line: 'A standing ovation. Even the printer rises, mostly because its stand is broken.' };
  if (g.score >= 4400) return { title: 'Master of the Ticket Bell', line: 'Chaos arrived with a speech. You sent it away with a working test case.' };
  if (g.score >= 2800) return { title: 'Queue Conjurer', line: 'A lovely performance. Please document the trick before your next holiday.' };
  return { title: 'Certified Survivor', line: 'The curtain falls. You are still standing. That counts as a successful show.' };
}
