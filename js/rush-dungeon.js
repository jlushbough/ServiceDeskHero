/** Deterministic character progression. No clocks, network, or browser state. */
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const descriptor = (id, name, description, extra = {}) => ({id, name, label:name, description, requirements:{}, ...extra});
export const DUNGEON_STATS = freeze([
  descriptor('technical', 'Technical', 'Each point: fixes 8%, diagnostics 10%, and project steps 7% faster.', {key:'technical'}),
  descriptor('insight', 'Insight', 'Each point: questions 12% faster. Every question and diagnostic stays available.', {key:'insight'}),
  descriptor('composure', 'Composure', 'Each point: 15% less morale lost to mistakes, misses, and failed bluffs; +2 morale per boss stage.', {key:'composure'}),
  descriptor('bullshit', 'Bullshit', 'Each point: Faker bluffs gain +1 influence, +3 seconds, +15 points, and +2 morale. Both classes earn +8 boss presentation points per stage.', {key:'bullshit'}),
]);
const skill = (id, name, classId, tier, branch, parent, description, effects) => descriptor(id,name,description,{
  classId,tier,branch,effects,requirements:{classId,level:tier+1,skillId:parent,excludes:[]},
});
const skills = [
  skill('field-technician','Field Technician','engineer',1,'field',null,'Fixes 20% faster; project steps 10% slower.',{fixTime:-.2,projectTime:.1}),
  skill('scope-surgeon','Scope Surgeon','engineer',2,'field','field-technician','Fixes another 12% and diagnostics 15% faster; questions 15% slower.',{fixTime:-.12,diagnosticTime:-.15,questionTime:.15}),
  skill('hot-swap-savant','Hot-swap Savant','engineer',2,'field','field-technician','Projects 20% and fixes 5% faster; morale losses 10% greater.',{projectTime:-.2,fixTime:-.05,moraleLoss:.1}),
  skill('systems-engineer','Systems Engineer','engineer',1,'systems',null,'Project steps 20% faster; individual fixes 10% slower.',{projectTime:-.2,fixTime:.1}),
  skill('rollback-architect','Rollback Architect','engineer',2,'systems','systems-engineer','Tested releases earn +60 points; diagnostics 15% faster; questions 10% slower.',{testedBonus:60,diagnosticTime:-.15,questionTime:.1}),
  skill('signal-cartographer','Signal Cartographer','engineer',2,'systems','systems-engineer','Questions 25% and diagnostics 15% faster; fixes 5% slower.',{questionTime:-.25,diagnosticTime:-.15,fixTime:.05}),
  skill('room-reader','Room Reader','faker',1,'rapport',null,'Questions 25% faster; diagnostics 10% slower.',{questionTime:-.25,diagnosticTime:.1}),
  skill('cross-examiner','Cross-examiner','faker',2,'rapport','room-reader','Diagnostics 20% and questions another 10% faster; successful bluffs earn 10 fewer points.',{diagnosticTime:-.2,questionTime:-.1,bluffBonus:-10}),
  skill('rapport-necromancer','Rapport Necromancer','faker',2,'rapport','room-reader','Correct fixes restore +2 morale and morale losses fall 20%; project steps 10% slower.',{recovery:2,moraleLoss:-.2,projectTime:.1}),
  skill('jargon-juggler','Jargon Juggler','faker',1,'jargon',null,'Successful bluffs earn +25 points and +5 seconds; diagnostics 15% slower.',{bluffBonus:25,bluffSeconds:5,diagnosticTime:.15}),
  skill('credible-nonsense','Credible Nonsense','faker',2,'jargon','jargon-juggler','Bluff influence +2 and successful bluff reward +25 points; questions 15% slower. Expertise still needs a real fix.',{bluffPower:2,bluffBonus:25,questionTime:.15}),
  skill('executive-fog','Executive Fog','faker',2,'jargon','jargon-juggler','Morale losses fall 20% and successful bluffs restore +5 morale; fixes 10% slower.',{moraleLoss:-.2,bluffRecovery:5,fixTime:.1}),
];
for (const item of skills) item.requirements.excludes = skills.filter(other => other.classId===item.classId && other.tier===item.tier && other.id!==item.id).map(other=>other.id);
export const DUNGEON_SKILLS = freeze(skills);
const gear = (id,name,floor,upside,downside,effects) => descriptor(id,name,`${upside} ${downside}`,{floor,upside,downside,effects,requirements:{floor}});
export const DUNGEON_GEAR = freeze([
  gear('duct-tape-codex','Duct-tape Codex',2,'Fixes 15% faster.','Questions 15% slower: the pages stick together.',{fixTime:-.15,questionTime:.15}),
  gear('empathy-headset','Empathy Headset',2,'Questions 20% faster.','Fixes 10% slower: everyone tells you their weekend plans.',{questionTime:-.2,fixTime:.1}),
  gear('rollback-cape','Rollback Cape',3,'Project steps 20% faster.','Diagnostics 15% slower: the cape keeps covering the console.',{projectTime:-.2,diagnosticTime:.15}),
  gear('ceremonial-blazer','Ceremonial Blazer',3,'Successful bluffs +30 points; boss stages +25 points.','Fixes 15% slower: the sleeves are largely ceremonial.',{bluffBonus:30,bossBonus:25,fixTime:.15}),
]);
export const DUNGEON_FLOORS = freeze([
  descriptor(1,'The Lobby of Misfiled Forms','Handle the first four routine cases. Learn the desk before the paperwork learns you.',{afterNormal:0,requirements:{handled:0}}),
  descriptor(2,'The Department of Unscheduled Dragons','Four cases handled. The printer guards a promotion and a cupboard of questionable equipment.',{afterNormal:4,requirements:{handled:4}}),
  descriptor(3,'The Executive Panic Attic','Eight cases handled. Your build and earlier project decisions follow you into the final confrontation.',{afterNormal:8,requirements:{handled:8}}),
]);
const zeroStats = () => Object.fromEntries(DUNGEON_STATS.map(stat=>[stat.key,0]));
const copy = value => JSON.parse(JSON.stringify(value));
function initialStats(input) {
  if(input===undefined) return zeroStats();
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!DUNGEON_STATS.some(s=>s.key===key))) throw new RangeError('Starting stats allow two points among Technical, Insight, Composure, and Bullshit.');
  const stats=Object.fromEntries(DUNGEON_STATS.map(s=>[s.key,Object.hasOwn(input,s.key)?input[s.key]:0]));
  if(Object.values(stats).some(n=>!Number.isInteger(n)||n<0) || Object.values(stats).reduce((a,b)=>a+b,0)>2) throw new RangeError('Starting stats allow at most two nonnegative integer points; unspent points are banked.');
  return stats;
}
const integer = (value,min,max,fallback=min) => Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
export function createDungeon(options={},classId='engineer') {
  const carry=options.dungeonCarry;
  if(carry!==undefined&&(!carry||typeof carry!=='object'||Array.isArray(carry)))throw new RangeError('A carried character must be a dungeon snapshot.');
  const d={floor:1,level:1,xp:0,statPoints:0,skillPoints:0,gearChoices:0,stats:initialStats(carry?undefined:options.stats),skills:[],gear:[],gearFloors:[],journal:[],projectLog:[],bossReactions:[],checkpointsEarned:[],xpKeys:[],cleared:false,recap:null,previousDays:[],day:integer(options.day,1,100000,1),configured:options.stats!==undefined};
  d.initialStatBudget=options.stats===undefined?0:2;
  d.statPoints=d.initialStatBudget-Object.values(d.stats).reduce((a,b)=>a+b,0);
  d.configured=options.stats!==undefined;
  if(carry && typeof carry==='object') {
    const stats=carry.stats===undefined?{}:carry.stats;
    if(!stats||typeof stats!=='object'||Array.isArray(stats)||Object.keys(stats).some(key=>!DUNGEON_STATS.some(s=>s.key===key)))throw new RangeError('Carried stats must contain only the four known attributes.');
    d.stats=Object.fromEntries(DUNGEON_STATS.map(s=>[s.key,Object.hasOwn(stats,s.key)?stats[s.key]:0]));
    if(Object.values(d.stats).some(n=>!Number.isInteger(n)||n<0||n>4))throw new RangeError('Carried stat values must be nonnegative integers no greater than four.');
    d.checkpointsEarned=[2,3].filter(f=>Array.isArray(carry.checkpointsEarned)&&carry.checkpointsEarned.includes(f));
    d.level=1+d.checkpointsEarned.length;
    d.initialStatBudget=integer(carry.initialStatBudget,0,2);
    const allocated=Object.values(d.stats).reduce((a,b)=>a+b,0),earnedBudget=d.initialStatBudget+d.checkpointsEarned.length;
    if(allocated>earnedBudget)throw new RangeError('Carried stats exceed the starting allocation and earned checkpoint rewards.');
    if(carry.statPoints!==undefined&&(!Number.isInteger(carry.statPoints)||carry.statPoints<0||carry.statPoints>earnedBudget-allocated))throw new RangeError('Carried unspent stat points exceed the earned allocation.');
    d.xp=integer(carry.xp,0,Number.MAX_SAFE_INTEGER);
    for(const id of Array.isArray(carry.skills)?carry.skills:[]) {
      const choice=DUNGEON_SKILLS.find(s=>s.id===id&&s.classId===classId&&s.requirements.level<=d.level);
      if(choice && !d.skills.includes(id) && !choice.requirements.excludes.some(excluded=>d.skills.includes(excluded)) && (!choice.requirements.skillId || d.skills.includes(choice.requirements.skillId))) d.skills.push(id);
    }
    for(const id of Array.isArray(carry.gear)?carry.gear:[]) {
      const choice=DUNGEON_GEAR.find(item=>item.id===id&&d.checkpointsEarned.includes(item.floor));
      if(choice&&!d.gearFloors.includes(choice.floor)){d.gear.push(id);d.gearFloors.push(choice.floor);}
    }
    d.statPoints=carry.statPoints??0;
    d.skillPoints=Math.max(0,d.checkpointsEarned.length-d.skills.length);
    d.gearChoices=Math.max(0,d.checkpointsEarned.length-d.gear.length);
    d.configured=!!carry.configured||Object.values(d.stats).some(Boolean)||d.skills.length>0||d.gear.length>0;
    d.previousDays=Array.isArray(carry.previousDays)?copy(carry.previousDays):[];
    if(carry.recap) d.previousDays.push(copy(carry.recap));
    d.previousDays=d.previousDays.slice(-7);
  }
  return d;
}
function record(g,type,text,detail={}) {
  const item={type,time:g.time,day:g.dungeon.day,floor:g.dungeon.floor,text,...detail};
  g.dungeon.journal.push(item);g.events.push({...item});return item;
}
export function gainDungeonXP(g,key,amount,reason) {
  const d=g.dungeon;if(d.xpKeys.includes(key))return;
  d.xpKeys.push(key);d.xp+=amount;
  record(g,'dungeon-xp',`${reason} · +${amount} XP`,{amount,xp:d.xp});
}
export function progressDungeon(g) {
  const d=g.dungeon;
  while(d.floor<3 && g.completedNormal>=DUNGEON_FLOORS[d.floor].afterNormal) {
    d.floor++;const floor=DUNGEON_FLOORS[d.floor-1];
    const rewarded=!d.checkpointsEarned.includes(d.floor);
    if(rewarded){d.checkpointsEarned.push(d.floor);d.level=Math.min(3,d.level+1);d.statPoints++;d.skillPoints++;d.gearChoices++;gainDungeonXP(g,`floor-${d.floor}`,100,`Reached ${floor.name}`);}
    record(g,'dungeon-floor',`Floor ${d.floor}: ${floor.name}. ${rewarded?'Level up! +1 stat point, +1 skill point, and one of two gear choices. Choose whenever you are ready.':'Your previous promotion carries forward. Your learned skills and gear are ready.'}`,{floor:d.floor,name:floor.name,level:d.level,rewards:{statPoints:rewarded?1:0,skillPoints:rewarded?1:0,gearChoices:rewarded?1:0}});
  }
}
const canChoose = g => !!g?.dungeon && ['playing','paused'].includes(g.status);
export function chooseDungeonStat(g,key) {
  if(!canChoose(g)||g.dungeon.statPoints<=0||!DUNGEON_STATS.some(s=>s.key===key))return false;
  g.dungeon.stats[key]++;g.dungeon.statPoints--;g.dungeon.configured=true;
  record(g,'dungeon-choice',`${DUNGEON_STATS.find(s=>s.key===key).name} increased to ${g.dungeon.stats[key]}.`,{choiceType:'stat',id:key});refreshDungeonBosses(g);return true;
}
export function chooseDungeonSkill(g,id) {
  const item=DUNGEON_SKILLS.find(s=>s.id===id),d=g?.dungeon;
  if(!canChoose(g)||!item||d.skillPoints<=0||d.skills.includes(id)||item.classId!==g.classId||item.requirements.level>d.level||item.requirements.excludes.some(excluded=>d.skills.includes(excluded))||(item.requirements.skillId&&!d.skills.includes(item.requirements.skillId)))return false;
  d.skills.push(id);d.skillPoints--;d.configured=true;record(g,'dungeon-choice',`Learned ${item.name}. ${item.description}`,{choiceType:'skill',id});refreshDungeonBosses(g);return true;
}
export function chooseDungeonGear(g,id) {
  const item=DUNGEON_GEAR.find(s=>s.id===id),d=g?.dungeon;
  if(!canChoose(g)||!item||d.gearChoices<=0||!d.checkpointsEarned.includes(item.floor)||d.gearFloors.includes(item.floor)||d.gear.includes(id))return false;
  d.gear.push(id);d.gearFloors.push(item.floor);d.gearChoices--;d.configured=true;record(g,'dungeon-choice',`Equipped ${item.name}. ${item.description}`,{choiceType:'gear',id});refreshDungeonBosses(g);return true;
}
export function dungeonEffects(g) {
  const stats=g.dungeon.stats,e={fixTime:-.08*stats.technical,diagnosticTime:-.1*stats.technical,projectTime:-.07*stats.technical,questionTime:-.12*stats.insight,moraleLoss:-.15*stats.composure,bluffBonus:15*stats.bullshit,bluffSeconds:3*stats.bullshit,bluffPower:stats.bullshit,bluffRecovery:2*stats.bullshit,bossBonus:0,testedBonus:0,recovery:0};
  for(const item of [...DUNGEON_SKILLS.filter(s=>g.dungeon.skills.includes(s.id)),...DUNGEON_GEAR.filter(s=>g.dungeon.gear.includes(s.id))])for(const [key,value]of Object.entries(item.effects))e[key]=(e[key]||0)+value;
  return e;
}
export function scaledDungeonSeconds(g,base,effect) {
  if(!Number.isFinite(base))return null;
  return Math.round(base*Math.max(.4,Math.min(1.6,1+(dungeonEffects(g)[effect]||0)))*1000)/1000;
}
export function dungeonMoraleLoss(g,base) {return Math.max(1,Math.round(base*Math.max(.25,1+dungeonEffects(g).moraleLoss)));}
export function recordDungeonProject(g,project,action) {
  const descriptions={test:'tested compatibility and rollback',release:'shipped a tested release',unsafeRelease:'released without testing',remediate:'repaired an unsafe release before impact',defer:'deferred the release safely'};
  const entry={projectId:project.id,action,time:g.time,floor:g.dungeon.floor,text:`${project.title}: ${descriptions[action]}.`};
  g.dungeon.projectLog.push(entry);g.dungeon.journal.push({type:'project-history',day:g.dungeon.day,...entry});
  const xp={test:20,release:50,remediate:35}[action];if(xp)gainDungeonXP(g,`project-${project.id}-${action}`,xp,entry.text);
}
export function dungeonBossReaction(g,boss,previous=null) {
  const d=g.dungeon,e=dungeonEffects(g),ranked=DUNGEON_STATS.map(s=>({...s,value:d.stats[s.key]})).sort((a,b)=>b.value-a.value),dominant=ranked[0];
  const tested=previous?.tested??d.projectLog.filter(p=>p.action==='release').length,unsafe=previous?.unsafe??d.projectLog.filter(p=>p.action==='unsafeRelease').length,repaired=previous?.repaired??d.projectLog.filter(p=>p.action==='remediate').length;
  const stageBonus=d.configured?dominant.value*8+d.stats.bullshit*8+e.bossBonus+tested*20+repaired*10:0;
  const recovery=d.configured?d.stats.composure*2+repaired*2:0;
  const build=dominant.value?`${dominant.name} ${dominant.value}`:d.skills.length?DUNGEON_SKILLS.find(s=>s.id===d.skills[0]).name:'an unallocated build';
  const response={bossId:boss.id,bossTitle:boss.title,floor:previous?.floor??d.floor,build,stats:{...d.stats},skills:[...d.skills],gear:[...d.gear],tested,unsafe,repaired,stageBonus,recovery,revision:(previous?.revision??0)+1,
    text:`${boss.title} ${previous?'updates its response to':'notices'} your current build: ${build}. The audit goblin remembers ${tested} tested release${tested===1?'':'s'}, ${unsafe} unsafe release${unsafe===1?'':'s'}, and ${repaired} repaired risk${repaired===1?'':'s'} before this encounter. ${unsafe?'An unsafe release earns no safety credit; its earlier incident risk remains exactly as announced. ':''}Your build is checked again whenever you choose an upgrade. Each correct boss stage started now earns +${stageBonus} build/safety points and +${recovery} morale. Work already started keeps its quoted effects. All evidence remains available and the SLA is unchanged.`};
  const index=d.bossReactions.findIndex(item=>item.bossId===boss.id);
  if(index<0)d.bossReactions.push(response);else d.bossReactions[index]=response;
  record(g,'dungeon-boss',response.text,{bossId:boss.id,stageBonus,recovery,updated:!!previous});return response;
}
function refreshDungeonBosses(g) {
  for(const ticket of g.queue.filter(item=>item.boss&&!item.resolution&&item.dungeonReaction)) {
    const previous=ticket.dungeonReaction;
    ticket.dungeonReaction=dungeonBossReaction(g,{id:ticket.bossId,title:previous.bossTitle||ticket.source.title},previous);
  }
}
export function finishDungeon(g) {
  const d=g.dungeon;d.cleared=g.morale>0&&g.completedNormal===g.totalNormal&&g.bossesDefeated===Object.keys(g.bossStatus).length;
  d.recap={day:d.day,cleared:d.cleared,floor:d.floor,level:d.level,xp:d.xp,handled:g.completedNormal,bosses:g.bossesDefeated,stats:{...d.stats},skills:[...d.skills],gear:[...d.gear],bossReactions:copy(d.bossReactions),tested:g.projects.filter(p=>p.releaseMethod==='tested').length,unsafe:g.projects.filter(p=>p.unsafeEver).length,incidents:g.incidentsReported,
    text:d.cleared?`Dungeon cleared: all 3 floors, ${g.completedNormal} routine cases, and ${g.bossesDefeated} bosses. The promotion committee awards you a slightly longer lanyard. Your build, project history, and boss reactions are recorded below.`:`Day ${d.day} ended on floor ${d.floor}. ${g.completedNormal} routine cases handled and ${g.bossesDefeated} bosses defeated. Your character and its lessons carry forward.`};
  record(g,'dungeon-recap',d.recap.text,{cleared:d.cleared});
}
export function dungeonSnapshot(g) {return copy(g.dungeon);}
export function dungeonSummary(g) {
  const d=g.dungeon;
  return copy({...d,unspent:{statPoints:d.statPoints,skillPoints:d.skillPoints,gearChoices:d.gearChoices},skills:DUNGEON_SKILLS.filter(s=>d.skills.includes(s.id)),gear:DUNGEON_GEAR.filter(s=>d.gear.includes(s.id)),floors:DUNGEON_FLOORS.map(f=>({...f,reached:f.id<=d.floor}))});
}
