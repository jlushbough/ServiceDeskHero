import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,acknowledgeTicket,advance,takeAction,investigateTicket,setTicketHeld,setProjectHeld,startProject} from '../js/rush-engine.js';
import {TICKETS} from '../js/rush-tickets.js';
const ticket=g=>g.queue.find(t=>t.id===g.selected);
test('held Sev3 reading remains untimed; acknowledged hold keeps the original SLA',()=>{
 const g=createGame(),t=ticket(g);assert.equal(setTicketHeld(g,t.id,true),true);advance(g,1200);assert.equal(t.deadline,null);
 assert.equal(acknowledgeTicket(g,t.id),false);assert.equal(takeAction(g,0),false);assert.equal(setTicketHeld(g,t.id,false),true);
 acknowledgeTicket(g,t.id);const deadline=t.deadline;setTicketHeld(g,t.id,true);advance(g,100);assert.equal(t.deadline,deadline);
 assert.equal(investigateTicket(g,t.source.investigations[0].id),false);setTicketHeld(g,t.id,false);assert.equal(t.deadline,deadline);
});
test('holding a Sev2 never suspends its report-time deadline and records one missed history item',()=>{
 const g=createGame();startProject(g,'portal-rollout','unsafeRelease');advance(g,62);const t=ticket(g);assert.equal(t.severity,2);
 setTicketHeld(g,t.id,true);const deadline=t.deadline;advance(g,180);assert.equal(t.deadline,deadline);assert.equal(g.incidentsMissed,1);
 assert.equal(g.history.filter(h=>h.id===t.id).length,1);assert.equal(g.history.find(h=>h.id===t.id).resolution,'missed');advance(g,50);assert.equal(g.incidentsMissed,1);
});
test('resolved history preserves evidence and outcome once without allowing further work',()=>{
 const g=createGame(),t=ticket(g);acknowledgeTicket(g,t.id);investigateTicket(g,t.source.investigations[0].id);advance(g,2);
 takeAction(g,t.actions.findIndex(a=>a.kind==='fix'));advance(g,2.4);const h=g.history[0];
 assert.equal(h.id,t.id);assert.equal(h.resolution,'fix');assert.equal(h.evidence.length,1);assert.equal(h.closedAt,4.4);
 assert.equal(setTicketHeld(g,t.id,true),false);assert.equal(acknowledgeTicket(g,t.id),false);assert.equal(g.history.length,1);
});
test('holding work in progress is rejected; project hold must be resumed and does not finish or release it',()=>{
 const g=createGame(),t=ticket(g);acknowledgeTicket(g,t.id);takeAction(g,t.actions.findIndex(a=>a.kind==='fix'));
 assert.equal(setTicketHeld(g,t.id,true),false);advance(g,2.4);
 assert.equal(setProjectHeld(g,'portal-rollout',true),true);assert.equal(startProject(g,'portal-rollout','test'),false);
 advance(g,120);assert.equal(g.projects[0].status,'pending');assert.equal(g.risks.length,0);
 assert.equal(setProjectHeld(g,'portal-rollout',false),true);assert.equal(startProject(g,'portal-rollout','test'),true);
 assert.equal(setProjectHeld(g,'portal-rollout',true),false);advance(g,18);assert.equal(g.projects[0].tested,true);
});
test('paused and invalid hold operations cannot mutate the simulation',()=>{
 const g=createGame(),t=ticket(g);for(const bad of [undefined,0,'true',null])assert.equal(setTicketHeld(g,t.id,bad),false);
 assert.equal(setTicketHeld(g,-1,true),false);assert.equal(setProjectHeld(g,'missing',true),false);g.status='paused';
 assert.equal(setTicketHeld(g,t.id,true),false);assert.equal(setProjectHeld(g,'portal-rollout',true),false);assert.equal(t.held,false);
});
test('request classification is explicit and does not change the finite content budget',()=>{
 const req=TICKETS.filter(t=>t.workstream==='req');assert.equal(req.length,3);assert.equal(TICKETS.length,12);
 const g=createGame();advance(g,3600);assert.equal(g.queue.filter(t=>t.workstream==='req').length,3);assert.equal(g.queue.filter(t=>t.workstream==='inc').length,9);
});
