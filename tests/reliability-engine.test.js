import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, actionSeconds, acknowledgeTicket, takeAction, investigateTicket, advance, skipIdle, startProject, selectTicket, drainEvents, BOSSES, DUNGEON_SKILLS, DUNGEON_GEAR} from '../js/rush-engine.js';
import {createLife, chooseMessage, inboxFor, endWorkday, homeOptions, chooseEvening, chooseConversation, beginNextDay} from '../js/rush-life.js';
const selected=g=>g.queue.find(t=>t.id===g.selected);
function ready(g){for(const p of g.projects)if(p.status==='pending')startProject(g,p.id,'defer');if(!selected(g)&&g.status==='playing')assert.equal(skipIdle(g),true);return selected(g);}
function act(g,kind='fix'){const t=ready(g);if(!t.acknowledged)assert(acknowledgeTicket(g,t.id));
 const index=t.actions.findIndex(a=>kind==='risk'?a.risk:a.kind===kind);
 assert(index>=0);
 assert(takeAction(g,index));advance(g,actionSeconds(g,kind==='risk'?'wrong':kind));}
function boss(which=0){const g=createGame('reliability');
 for(let n=0;n<30&&ready(g)?.bossId!==BOSSES[which].id;n++)act(g);
 assert.equal(selected(g).bossId,BOSSES[which].id);return g;}
test('repair timing never identifies the correct answer under any stat, skill or gear effect',()=>{
 const builds=[{},...['technical','insight','composure','bullshit'].map(key=>({stats:{[key]:2}}))];
 for(const options of builds){const g=createGame('duration',false,'engineer',options);
 assert.equal(actionSeconds(g,'fix'),actionSeconds(g,'wrong'));}
 for(const item of [...DUNGEON_SKILLS,...DUNGEON_GEAR]){const g=createGame('duration',false,item.classId||'engineer');g.dungeon.skills=DUNGEON_SKILLS.includes(item)?[item.id]:[];g.dungeon.gear=DUNGEON_GEAR.includes(item)?[item.id]:[];
 assert.equal(actionSeconds(g,'fix'),actionSeconds(g,'wrong'),item.id);}
});
test('manufacturing and correcting both Friday risks scores below clean play',()=>{
 const clean=boss(1),risky=boss(1);act(clean);act(clean);act(risky,'risk');act(risky);act(risky,'risk');act(risky);
 assert.equal(clean.status,'finished');
 assert.equal(risky.status,'finished');
 assert.equal(risky.incidentsPrevented,2);
 assert.equal(risky.projectPoints,0);
 assert(risky.score<clean.score);
 assert(!drainEvents(risky).some(e=>e.type==='prevented'&&e.text.includes('+400')));
});
test('one useful investigation equals direct diagnosis, extra or leading questions cannot farm credit',()=>{
 function finish(ids){const g=createGame('evidence');
 const t=selected(g);acknowledgeTicket(g,t.id);
 for(const pick of ids){const q=t.source.investigations.find(pick);
 assert(investigateTicket(g,q.id));advance(g,q.kind==='question'?2:4);
 assert.equal(investigateTicket(g,q.id),false);}takeAction(g,t.actions.findIndex(a=>a.kind==='fix'));advance(g,2.4);return {g,outcome:drainEvents(g).find(e=>e.type==='outcome')};}
 const direct=finish([]),one=finish([q=>q.kind==='diagnostic']),many=finish([q=>q.kind==='diagnostic',q=>q.kind==='question'&&!q.quality]),bad=finish([q=>q.quality==='leading']);
 assert.equal(one.g.score,direct.g.score);
 assert.equal(many.g.score,one.g.score);
 assert.equal(bad.g.score,direct.g.score-25);
 assert(one.outcome.investigated);
 assert(direct.outcome.expert);
 assert.equal(one.outcome.expert,false);
});
test('boss stage evidence survives history and each stage has independent diagnosis credit',()=>{
 const g=boss(),t=selected(g);acknowledgeTicket(g,t.id);
 const q=t.source.investigations.find(q=>q.kind==='diagnostic');investigateTicket(g,q.id);advance(g,4);act(g);drainEvents(g);act(g);
 const result=drainEvents(g).find(e=>e.type==='outcome');
 assert(result.expert);
 assert(g.history.find(h=>h.id===t.id).evidence.some(e=>e.id===q.id&&e.stage===1));
});
test('missed incident has one explicit pending recovery handoff and no recovery reward',()=>{
 const g=createGame('handoff');
 const p=g.projects[0];startProject(g,p.id,'unsafeRelease');advance(g,62);
 const t=selected(g);
 assert(t.incident);advance(g,180);
 const history=g.history.find(h=>h.id===t.id);
 assert.equal(history.resolution,'missed');
 assert.equal(history.handoff.status,'recovery-pending');
 assert.equal(g.incidentsResolved,0);
 assert.equal(g.score,0);advance(g,20);
 assert.equal(g.incidentsMissed,1);
 assert.equal(g.history.filter(h=>h.id===t.id).length,1);
 const life=createLife();endWorkday(life,g);
 assert.equal(life.workSummary.handedOff,g.queue.length+1);chooseEvening(life,'rest');chooseConversation(life,'remember');
 assert.match(beginNextDay(life).briefing.join(' '),/restoration remains pending/);
});
test('incident outcome morale metadata reflects wrong moves, capped recovery and actual state',()=>{
 const g=createGame('morale');startProject(g,g.projects[0].id,'unsafeRelease');advance(g,62);
 const t=selected(g);acknowledgeTicket(g,t.id);g.morale=95;takeAction(g,t.actions.findIndex(a=>a.kind==='wrong'));advance(g,2.4);
 let event=drainEvents(g).find(e=>e.type==='outcome');
 assert.equal(event.moraleDelta,-10);takeAction(g,t.actions.findIndex(a=>a.kind==='fix'));advance(g,2.4);event=drainEvents(g).find(e=>e.type==='outcome');
 assert.equal(event.moraleDelta,10);
 assert.equal(g.morale,95);
});
test('trusted Mira always supplies the promised note and same-day replies do not invent yesterday',()=>{
 const life=createLife();chooseMessage(life,'mira-thread','check-facts');
 assert.doesNotMatch(inboxFor(life)[0].body,/Yesterday you checked/);
 assert.match(inboxFor(life)[0].body,/Diagnostic note:/);life.relationships.mira=66;life.memory.mira='confirmed';endWorkday(life);chooseEvening(life,'rest');chooseConversation(life,'remember');
 const carry=beginNextDay(life);
 assert.match(carry.briefing.join(' '),/fresh diagnostic note/);
 assert.match(inboxFor(life)[0].body,/Diagnostic note:/);
});
test('completed promise dialogue retains the exact choices and selected label for every response',()=>{
 for(const id of ['keep-small','check-in','rush-fix']){const life=createLife();chooseMessage(life,'rowan-plan','promise-tea');endWorkday(life);chooseEvening(life,'rest');
 const before=homeOptions(life).conversation;
 assert(chooseConversation(life,id));
 assert.deepEqual(homeOptions(life).conversation,before);
 assert.equal(life.choices.conversation,id);
 assert(homeOptions(life).conversation.choices.some(c=>c.id===id));}
});

test('letting a manufactured boss risk escalate cannot farm recovery points either',()=>{
 const clean=boss(1),risky=boss(1);clean.wrong=1;risky.wrong=1;
 act(clean);act(clean);
 for(let stage=0;stage<2;stage++){
  const id=selected(risky).id;act(risky,'risk');advance(risky,61);
  assert(selected(risky).incident);assert.equal(selected(risky).recoveryPoints,0);
  const before=risky.score;act(risky);assert.equal(risky.score,before);
  selectTicket(risky,id);act(risky);
 }
 assert(risky.score<=clean.score);assert.equal(risky.incidentsResolved,2);
});
