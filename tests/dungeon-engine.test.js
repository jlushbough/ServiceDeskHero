import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,acknowledgeTicket,selectTicket,takeAction,investigateTicket,startProject,skipIdle,drainEvents,setTicketHeld,actionSeconds,investigationSeconds,projectSeconds,chooseDungeonStat,chooseDungeonSkill,chooseDungeonGear,dungeonSummary,dungeonSnapshot,finishDungeon,DUNGEON_STATS,DUNGEON_SKILLS,DUNGEON_GEAR,DUNGEON_FLOORS,ACTIONS,INVESTIGATIONS,PROJECT_ACTIONS} from '../js/rush-engine.js';

const current=g=>g.queue.find(t=>t.id===g.selected);
const json=value=>JSON.parse(JSON.stringify(value));
function completeWork(g) {assert.ok(g.work);advance(g,g.work.ends-g.time);}
function ready(g) {
  if(!g.queue.length){assert.equal(skipIdle(g),true,'a finite future report exists');}
  const ticket=current(g);assert.ok(ticket);if(!ticket.acknowledged)assert.equal(acknowledgeTicket(g,ticket.id),true);return ticket;
}
function solve(g,beginner=false) {
  const ticket=ready(g);
  if(beginner)for(const item of ticket.source.investigations||[]){assert.equal(investigateTicket(g,item.id),true);completeWork(g);}
  assert.equal(takeAction(g,ticket.actions.findIndex(a=>a.kind==='fix')),true);completeWork(g);
}
function toHandled(g,count) {for(let guard=0;g.completedNormal<count&&guard<40;guard++)solve(g);assert.equal(g.completedNormal,count);}
function project(g,id,action) {assert.equal(startProject(g,id,action),true,`${id}: ${action}`);if(action!=='defer')completeWork(g);}
function finish(g,beginner=false,upgrades=()=>{}) {
  for(let guard=0;g.status==='playing'&&guard<40;guard++) {
    upgrades(g);
    for(const item of g.projects)if(item.status==='pending'&&g.completedNormal>=item.unlockAfter){project(g,item.id,'test');project(g,item.id,'release');}
    if(g.status==='playing')solve(g,beginner);
  }
  assert.equal(g.status,'finished','every legal build can finish');return g;
}
function branchBuild(g,branch,firstGear='duct-tape-codex',lastGear='rollback-cape') {
  while(g.dungeon.statPoints)assert.equal(chooseDungeonStat(g,g.classId==='engineer'?'technical':'bullshit'),true);
  const base=DUNGEON_SKILLS.find(s=>s.classId===g.classId&&s.tier===1&&s.branch===branch);
  const evolution=DUNGEON_SKILLS.find(s=>s.requirements.skillId===base.id);
  if(g.dungeon.skillPoints&&!g.dungeon.skills.includes(base.id))assert.equal(chooseDungeonSkill(g,base.id),true);
  if(g.dungeon.skillPoints&&g.dungeon.level===3)assert.equal(chooseDungeonSkill(g,evolution.id),true);
  for(const id of [firstGear,lastGear])if(g.dungeon.checkpointsEarned.includes(DUNGEON_GEAR.find(item=>item.id===id).floor)&&!g.dungeon.gear.includes(id))assert.equal(chooseDungeonGear(g,id),true);
}

test('legacy defaults preserve all timings; explicit zero allocation banks exactly two points',()=>{
  const legacy=createGame('defaults'),created=createGame('defaults',false,'engineer',{stats:{}});
  assert.equal(legacy.dungeon.statPoints,0);assert.equal(created.dungeon.statPoints,2);
  assert.deepEqual(legacy.dungeon.stats,{technical:0,insight:0,composure:0,bullshit:0});
  for(const [kind,action]of Object.entries(ACTIONS))assert.equal(actionSeconds(legacy,kind),action.seconds);
  for(const [kind,action]of Object.entries(INVESTIGATIONS))assert.equal(investigationSeconds(legacy,kind),action.seconds);
  for(const [kind,seconds]of Object.entries(PROJECT_ACTIONS))assert.equal(projectSeconds(legacy,kind),seconds);
  assert.equal(chooseDungeonStat(created,'insight'),true);assert.equal(chooseDungeonStat(created,'technical'),true);assert.equal(chooseDungeonStat(created,'technical'),false);
  for(const bad of [null,[],{technical:-1},{technical:3},{technical:1.5},{technical:NaN},{technical:null},{technical:undefined},{constructor:2},{mystery:2}])assert.throws(()=>createGame('bad',false,'engineer',{stats:bad}),RangeError);
  for(const helper of [actionSeconds,investigationSeconds,projectSeconds])assert.equal(helper(legacy,'constructor'),null);
});

test('stats change actual work and penalties without changing evidence access or SLA windows',()=>{
  const technical=createGame('stats',false,'engineer',{stats:{technical:2}}),insight=createGame('stats',false,'engineer',{stats:{insight:2}}),composure=createGame('stats',false,'engineer',{stats:{composure:2}});
  assert.equal(actionSeconds(technical,'fix'),2.016);assert.equal(investigationSeconds(technical,'diagnostic'),3.2);assert.equal(projectSeconds(technical,'test'),15.48);
  assert.equal(investigationSeconds(insight,'question'),1.52);assert.equal(investigationSeconds(insight,'diagnostic'),4);
  for(const g of [technical,insight,composure]) {
    const t=ready(g);assert.equal(t.deadline-g.time,900);assert.equal(t.source.investigations.length,current(technical).source.investigations.length);
    const inquiry=t.source.investigations.find(i=>i.kind==='question');assert.equal(investigateTicket(g,inquiry.id),true);assert.equal(g.work.ends-g.work.started,investigationSeconds(g,'question'));completeWork(g);
    assert.equal(takeAction(g,t.actions.findIndex(a=>a.kind==='wrong')),true);completeWork(g);
  }
  assert.equal(technical.morale,90);assert.equal(insight.morale,90);assert.equal(composure.morale,93);
  const held=current(composure),deadline=held.deadline;assert.equal(setTicketHeld(composure,held.id,true),true);advance(composure,5);assert.equal(held.deadline,deadline);
});

test('four and eight handled routines open exactly two checkpoint rewards with lasting XP and no menu lock',()=>{
  const g=createGame('floors',false,'engineer',{stats:{technical:2}});
  toHandled(g,3);assert.equal(g.dungeon.floor,1);toHandled(g,4);
  assert.equal(g.dungeon.floor,2);assert.equal(g.dungeon.level,2);assert.equal(g.dungeon.xp,200);
  assert.deepEqual([g.dungeon.statPoints,g.dungeon.skillPoints,g.dungeon.gearChoices],[1,1,1]);
  toHandled(g,8);assert.equal(g.dungeon.floor,3);assert.equal(g.dungeon.level,3);
  assert.deepEqual([g.dungeon.statPoints,g.dungeon.skillPoints,g.dungeon.gearChoices],[2,2,2]);
  finish(g);assert.equal(g.dungeon.cleared,true);assert.equal(g.dungeon.recap.handled,12);assert.equal(g.dungeon.recap.bosses,2);
  assert.deepEqual(drainEvents(g).filter(e=>e.type==='dungeon-floor').map(e=>e.floor),[2,3]);
  assert.equal(dungeonSummary(g).unspent.skillPoints,2);assert.match(g.dungeon.recap.text,/Dungeon cleared/);
});

test('each class has two exclusive branches and two exclusive evolutions per branch',()=>{
  for(const classId of ['engineer','faker']) {
    const roots=DUNGEON_SKILLS.filter(s=>s.classId===classId&&s.tier===1);assert.equal(roots.length,2);
    for(const root of roots) {
      const g=createGame(`tree-${root.id}`,false,classId);toHandled(g,4);g.status='paused';
      const children=DUNGEON_SKILLS.filter(s=>s.requirements.skillId===root.id);assert.equal(children.length,2);
      assert.equal(chooseDungeonSkill(g,children[0].id),false,'tier two needs its parent and level three');
      assert.equal(chooseDungeonSkill(g,root.id),true);assert.equal(chooseDungeonSkill(g,root.id),false);
      g.status='playing';toHandled(g,8);g.status='paused';
      assert.equal(chooseDungeonSkill(g,roots.find(s=>s.id!==root.id).id),false,'cannot cross branches');
      assert.equal(chooseDungeonSkill(g,children[1].id),true);assert.equal(chooseDungeonSkill(g,children[0].id),false);
      assert.equal(g.dungeon.skills.length,2);
    }
  }
});

test('gear has one lasting choice per checkpoint and measurable upside and downside',()=>{
  for(const id of DUNGEON_GEAR.map(item=>item.id)) {
    const g=createGame(`gear-${id}`);toHandled(g,8);const item=DUNGEON_GEAR.find(item=>item.id===id);
    const before={fix:actionSeconds(g,'fix'),question:investigationSeconds(g,'question'),diagnostic:investigationSeconds(g,'diagnostic'),project:projectSeconds(g,'test')};
    assert.equal(chooseDungeonGear(g,id),true);assert.equal(chooseDungeonGear(g,id),false);
    assert.equal(chooseDungeonGear(g,DUNGEON_GEAR.find(other=>other.floor===item.floor&&other.id!==id).id),false);
    if(id==='duct-tape-codex'){assert.ok(actionSeconds(g,'fix')<before.fix);assert.ok(investigationSeconds(g,'question')>before.question);}
    if(id==='empathy-headset'){assert.ok(investigationSeconds(g,'question')<before.question);assert.ok(actionSeconds(g,'fix')>before.fix);}
    if(id==='rollback-cape'){assert.ok(projectSeconds(g,'test')<before.project);assert.ok(investigationSeconds(g,'diagnostic')>before.diagnostic);}
    if(id==='ceremonial-blazer')assert.ok(actionSeconds(g,'fix')>before.fix);
    assert.ok(item.upside&&item.downside);
  }
});

test('paused character choices do not advance any clock or restart in-flight work',()=>{
  const g=createGame('paused',false,'engineer',{stats:{}}),t=ready(g);takeAction(g,t.actions.findIndex(a=>a.kind==='fix'));const ends=g.work.ends,deadline=t.deadline,time=g.time;
  g.status='paused';assert.equal(chooseDungeonStat(g,'technical'),true);advance(g,9999);
  assert.equal(g.time,time);assert.equal(g.work.ends,ends);assert.equal(t.deadline,deadline);g.status='playing';completeWork(g);
  assert.equal(g.completedNormal,1);assert.equal(g.time,2.4,'already-started work retains its quoted duration');
  g.status='finished';const before=json(g);for(const choice of [chooseDungeonStat,chooseDungeonSkill,chooseDungeonGear])assert.equal(choice(g,'technical'),false);assert.deepEqual(json(g),before);
});

test('invalid and wrong-class upgrades never consume rewards or change the character',()=>{
  const g=createGame('invalid-upgrades',false,'engineer',{stats:{}});toHandled(g,8);
  for(const status of ['playing','paused']) {
    g.status=status;
    for(const input of [undefined,null,{},[],0,'constructor','__proto__','missing']) {
      const before=json(g.dungeon);
      assert.equal(chooseDungeonStat(g,input),false);assert.equal(chooseDungeonSkill(g,input),false);assert.equal(chooseDungeonGear(g,input),false);assert.deepEqual(json(g.dungeon),before);
    }
    const before=json(g.dungeon);assert.equal(chooseDungeonSkill(g,'room-reader'),false);assert.deepEqual(json(g.dungeon),before);
  }
});

test('patches, inquiries, wrong moves, and rejected repeats never farm XP',()=>{
  const g=createGame('no-xp-farming'),t=ready(g),q=t.source.investigations[0];
  investigateTicket(g,q.id);completeWork(g);assert.equal(investigateTicket(g,q.id),false);assert.equal(g.dungeon.xp,0);
  takeAction(g,t.actions.findIndex(a=>a.kind==='wrong'));completeWork(g);assert.equal(g.dungeon.xp,0);
  takeAction(g,t.actions.findIndex(a=>a.kind==='patch'));completeWork(g);assert.equal(g.dungeon.xp,0);advance(g,11);solve(g);assert.equal(g.dungeon.xp,25);
  assert.equal(takeAction(g,0,t.id),false);assert.equal(g.dungeon.xp,25);
  project(g,'portal-rollout','test');assert.equal(g.dungeon.xp,45);assert.equal(startProject(g,'portal-rollout','test'),false);assert.equal(g.dungeon.xp,45);
});

test('later bosses visibly remember tested versus unsafe projects and reward prevention without new hazards',()=>{
  const run=mode=>{
    const g=createGame(`history-${mode}`,false,'engineer',{stats:{technical:2}});
    if(mode==='tested'){project(g,'portal-rollout','test');project(g,'portal-rollout','release');}
    else{project(g,'portal-rollout','unsafeRelease');project(g,'portal-rollout','remediate');}
    toHandled(g,12);const boss=ready(g);assert.equal(boss.boss,true);assert.equal(boss.deadline-g.time,900);return {g,boss};
  };
  const safe=run('tested'),unsafe=run('unsafe'),sr=safe.boss.dungeonReaction,ur=unsafe.boss.dungeonReaction;
  assert.equal(sr.tested,1);assert.equal(sr.unsafe,0);assert.equal(ur.unsafe,1);assert.equal(ur.repaired,1);
  assert.equal(sr.stageBonus,36);assert.equal(ur.stageBonus,26);assert.match(ur.text,/unsafe release earns no safety credit/);
  assert.match(sr.text,/Technical 2/);assert.equal(safe.g.incidentsReported,0);assert.equal(unsafe.g.incidentsReported,0);
  const before=safe.g.score;solve(safe.g);assert.ok(safe.g.score-before>=sr.stageBonus);assert.equal(safe.g.dungeon.bossReactions.length,2);
});

test('trained Faker bluffs buy visibly more time and score while leaving the technical stage unresolved',()=>{
  const g=createGame('bluff-build',false,'faker',{stats:{bullshit:2}});toHandled(g,4);chooseDungeonSkill(g,'jargon-juggler');toHandled(g,8);chooseDungeonSkill(g,'credible-nonsense');chooseDungeonGear(g,'ceremonial-blazer');toHandled(g,12);
  const boss=ready(g),deadline=boss.deadline,stage=boss.stage,resolved=g.resolved,score=g.score;
  assert.equal(takeAction(g,'bluff'),true);completeWork(g);
  assert.equal(boss.deadline,deadline+21);assert.equal(boss.stage,stage);assert.equal(g.resolved,resolved);assert.equal(g.score-score,285,'185 action points plus first successful bluff achievement');
  assert.equal(takeAction(g,'bluff'),false);const event=drainEvents(g).find(e=>e.type==='bluff');assert.equal(event.influence,9);assert.equal(event.points,185);
});

test('upgrades after boss arrival refresh future stage rewards without rewriting prior project history',()=>{
  const g=createGame('live-boss-build',false,'engineer',{stats:{}});toHandled(g,12);const boss=ready(g),deadline=boss.deadline,time=g.time,score=g.score;
  assert.equal(boss.dungeonReaction.stageBonus,0);assert.equal(boss.dungeonReaction.recovery,0);
  // A new safe project does not rewrite the boss's earlier project-history snapshot.
  project(g,'portal-rollout','test');project(g,'portal-rollout','release');
  g.status='paused';assert.equal(chooseDungeonStat(g,'composure'),true);assert.equal(chooseDungeonGear(g,'ceremonial-blazer'),true);
  assert.equal(boss.dungeonReaction.tested,0);assert.equal(boss.dungeonReaction.stageBonus,33);assert.equal(boss.dungeonReaction.recovery,2);
  assert.equal(boss.deadline,deadline);assert.equal(g.time,time+24);assert.equal(g.score,score+450,'choices award no immediate or duplicate stage points');
  assert.match(boss.dungeonReaction.text,/updates its response to your current build/);assert.equal(g.dungeon.bossReactions.filter(r=>r.bossId===boss.bossId).length,1);
  g.status='playing';g.morale=50;drainEvents(g);solve(g);assert.equal(g.morale,56);const outcome=drainEvents(g).find(e=>e.type==='outcome');assert.equal(outcome.points,358,'325 base/streak/expert plus 33 current-build points');
  for(const p of g.projects)if(p.status==='pending')project(g,p.id,'defer');solve(g);
  const recap=g.dungeon.recap.bossReactions.find(r=>r.bossId===boss.bossId);assert.equal(recap.stageBonus,33);assert.equal(recap.recovery,2);assert.equal(recap.revision,3);
});

test('mid-action upgrades update the displayed boss response but queued work keeps its effects',()=>{
  const g=createGame('queued-boss-build',false,'engineer',{stats:{}});toHandled(g,12);const boss=ready(g);g.morale=50;
  takeAction(g,boss.actions.findIndex(a=>a.kind==='fix'));const queued=json(g.work),deadline=boss.deadline;
  g.status='paused';chooseDungeonStat(g,'composure');chooseDungeonGear(g,'ceremonial-blazer');assert.deepEqual(json(g.work),queued);assert.equal(boss.deadline,deadline);
  assert.equal(boss.dungeonReaction.stageBonus,33);assert.equal(boss.dungeonReaction.recovery,2);g.status='playing';drainEvents(g);completeWork(g);
  assert.equal(g.morale,54);assert.equal(drainEvents(g).find(e=>e.type==='outcome').points,325);
  g.morale=50;solve(g);assert.equal(g.morale,56);assert.equal(drainEvents(g).find(e=>e.type==='outcome').points,708,'next action receives +33 once and the normal 350 defeat reward');
});

test('Rapport Necromancer restores its advertised two morale once on boss stages',()=>{
  const g=createGame('rapport-recovery',false,'faker',{stats:{insight:2}});toHandled(g,4);chooseDungeonSkill(g,'room-reader');toHandled(g,12);const boss=ready(g);
  g.status='paused';assert.equal(chooseDungeonSkill(g,'rapport-necromancer'),true);assert.equal(boss.dungeonReaction.recovery,0,'general fix recovery is not counted again as a boss bonus');
  g.status='playing';g.morale=50;solve(g);assert.equal(g.morale,56,'base fix recovery four plus the skill two');
});

test('malformed carry cannot mint attributes beyond its actual earned point budget',()=>{
  for(const stats of [{technical:4},{technical:6},{technical:-1},{technical:1.5},{technical:'2'},{technical:null},{technical:NaN},{mystery:2}]) {
    assert.throws(()=>createGame('impossible',false,'engineer',{dungeonCarry:{stats,initialStatBudget:0,checkpointsEarned:[],statPoints:0}}),RangeError);
  }
  assert.throws(()=>createGame('excess-bank',false,'engineer',{dungeonCarry:{stats:{technical:2},initialStatBudget:2,checkpointsEarned:[],statPoints:1}}),RangeError);
  const valid=createGame('carry-valid',false,'engineer',{stats:{technical:1}}),carried=createGame('carry-next',false,'engineer',{dungeonCarry:dungeonSnapshot(valid)});
  assert.equal(carried.dungeon.stats.technical,1);assert.equal(carried.dungeon.statPoints,1);
});

test('all stat specialists and all class branches finish through beginner and expert routes without forced incidents',()=>{
  for(const classId of ['engineer','faker'])for(const stat of DUNGEON_STATS)for(const beginner of [false,true]) {
    const g=createGame(`full-${classId}-${stat.key}`,false,classId,{stats:{[stat.key]:2}});
    const branch=classId==='engineer'?(beginner?'systems':'field'):(beginner?'rapport':'jargon');
    finish(g,beginner,game=>branchBuild(game,branch,beginner?'empathy-headset':'duct-tape-codex',beginner?'ceremonial-blazer':'rollback-cape'));
    assert.equal(g.dungeon.cleared,true);assert.equal(g.missed,0);assert.equal(g.wrong,0);assert.equal(g.incidentsReported,0);assert.equal(g.projectsCompleted,2);assert.equal(g.dungeon.skills.length,2);assert.equal(g.dungeon.gear.length,2);
  }
});

test('a built character retains immutable snapshots across days without duplicate promotions or stat points',()=>{
  const first=finish(createGame('day1',false,'engineer',{stats:{technical:2}}),false,g=>branchBuild(g,'systems'));
  const carry=dungeonSnapshot(first),expected=json(carry),second=createGame('day2',false,'engineer',{day:2,dungeonCarry:carry});
  assert.equal(second.dungeon.floor,1);assert.equal(second.dungeon.level,3);assert.equal(second.dungeon.day,2);assert.equal(second.dungeon.previousDays.length,1);
  assert.deepEqual(second.dungeon.stats,first.dungeon.stats);assert.deepEqual(second.dungeon.skills,first.dungeon.skills);assert.deepEqual(second.dungeon.gear,first.dungeon.gear);
  const xp=second.dungeon.xp;finish(second);assert.deepEqual(json(carry),expected);assert.deepEqual(second.dungeon.stats,first.dungeon.stats);
  assert.deepEqual([second.dungeon.statPoints,second.dungeon.skillPoints,second.dungeon.gearChoices],[0,0,0]);
  assert.equal(second.dungeon.xp-xp,600,'12 routines, four boss stages, and two tested projects; no repeated floor XP');
  assert.ok(second.dungeon.journal.filter(e=>e.type==='dungeon-floor').every(e=>e.rewards.statPoints===0));
  const summary=dungeonSummary(second);summary.stats.technical=999;summary.journal.length=0;assert.notEqual(second.dungeon.stats.technical,999);assert.ok(second.dungeon.journal.length>0);
});

test('a banked starting allocation survives carry and delayed upgrades remain usable',()=>{
  const g=finish(createGame('banked',false,'faker',{stats:{}}));assert.equal(g.dungeon.statPoints,4);
  const next=createGame('next',false,'faker',{day:2,dungeonCarry:dungeonSnapshot(g)});assert.equal(next.dungeon.statPoints,4);
  next.status='paused';for(let n=0;n<4;n++)assert.equal(chooseDungeonStat(next,'bullshit'),true);assert.equal(chooseDungeonStat(next,'bullshit'),false);
  assert.equal(chooseDungeonSkill(next,'jargon-juggler'),true);assert.equal(chooseDungeonSkill(next,'credible-nonsense'),true);
  assert.equal(chooseDungeonGear(next,'duct-tape-codex'),true);assert.equal(chooseDungeonGear(next,'rollback-cape'),true);
  assert.equal(next.dungeon.floor,1,'carried unlocked choices remain usable even back in the lobby');
});

test('build-specific work is deterministic under subdivided time and preserves causal Sev2 and later Sev1 clocks',()=>{
  const a=createGame('risk-build',false,'engineer',{stats:{technical:2}}),b=createGame('risk-build',false,'engineer',{stats:{technical:2}});
  startProject(a,'portal-rollout','unsafeRelease');startProject(b,'portal-rollout','unsafeRelease');advance(a,70);for(let n=0;n<700;n++)advance(b,.1);assert.deepEqual(json(a),json(b));
  const incident=a.queue.find(t=>t.incident);assert.equal(incident.severity,2);assert.equal(incident.deadline-incident.reportedAt,180);selectTicket(a,incident.id);solve(a);
  toHandled(a,8);assert.equal(a.sev1Unlocked,true);project(a,'print-refresh','unsafeRelease');advance(a,60);
  const later=a.queue.find(t=>t.incident);assert.equal(later.severity,1);assert.equal(later.deadline-later.reportedAt,60);selectTicket(a,later.id);solve(a);assert.equal(a.incidentsResolved,2);
  assert.deepEqual(DUNGEON_FLOORS.map(f=>f.afterNormal),[0,4,8]);
});


test('early exits retain a truthful bounded history across repeated workdays',()=>{
  let g=createGame('early-1',false,'engineer',{stats:{}});
  for(let day=1;day<=12;day++){
    g.status='finished';g.work=null;finishDungeon(g);
    assert.equal(g.dungeon.recap.cleared,false);assert.equal(g.dungeon.recap.handled,0);
    g=createGame(`early-${day+1}`,false,'engineer',{day:day+1,dungeonCarry:dungeonSnapshot(g)});
    assert.equal(g.dungeon.previousDays.length,Math.min(day,7));
    assert.equal(g.dungeon.previousDays.at(-1).day,day);
    assert.equal(g.dungeon.statPoints,2,'unspent starting allocation carries without multiplying');
  }
});
