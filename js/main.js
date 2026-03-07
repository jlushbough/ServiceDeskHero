/* ============================================================
   main.js - Weekly strategy sim
   ============================================================ */

(() => {
  const { CAREER, BOSS_ARCHETYPES, WEEKLY_ACTIONS, POLITICAL_MOVES, CONSEQUENCES, EVENT_TEMPLATES, STAFF_POOL } = window.GAME_DATA;
  const SFX = window.SFX || {};
  const SAVE_KEY = 'sdh_strategy_v1';
  const HOURS_PER_WEEK = 40;
  const START_TEAM = 4;
  const SLATE_SIZE = 3;

  let S = null;
  let toastTimer = null;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
  const fmtMoney = (n) => n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n).toLocaleString()}`;
  const pct = (n) => `${Math.round(n)}%`;

  const bonusByRarity = { common: 0, uncommon: 4, rare: 8, epic: 12, legendary: 18 };
  const bossById = Object.fromEntries(BOSS_ARCHETYPES.map((boss) => [boss.id, boss]));

  function currentCareer(state = S) { return CAREER[state.careerTier] || CAREER[0]; }
  function weeklyPay(state = S) { return currentCareer(state).annualSalary / 52; }
  function currentBoss(state = S) { return bossById[state.bossState.archetypeId] || BOSS_ARCHETYPES[0]; }
  function getOpenHeadcount(state = S) { return Math.max(0, currentCareer(state).headcount - state.staffState.length); }
  function getOpenSupervisorSlots(state = S) { return Math.max(0, currentCareer(state).supervisorSlots - state.staffState.filter((s) => s.isSupervisor).length); }
  function getSupervisorCapacity(state = S) { return state.careerTier >= 7 ? 7 : state.careerTier >= 5 ? 6 : 5; }
  function staffById(id, state = S) { return state.staffState.find((staff) => staff.id === id) || null; }
  function candidateById(id, state = S) { return state.candidateSlate.find((staff) => staff.id === id) || null; }
  function directReports(managerId, state = S) { return state.staffState.filter((staff) => staff.managerId === managerId); }
  function average(items, key) { return items.length ? items.reduce((sum, item) => sum + item[key], 0) / items.length : 0; }
  function makeId(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 9)}`; }

  function shiftAllStaff(field, delta) {
    S.staffState.forEach((staff) => { staff[field] = clamp(staff[field] + delta, 0, 100); });
  }

  function recomputeMorale() {
    S.morale = clamp(Math.round(average(S.staffState, 'morale') || 0), 0, 100);
  }

  function pickFlags(hero) {
    const flags = [];
    if (hero.baseCps >= 3.2 || hero.rarity === 'epic' || hero.rarity === 'legendary') flags.push('high-performer');
    if (Math.random() < 0.18) flags.push('bullshitter');
    if (Math.random() < 0.18) flags.push('hidden-problem');
    if (Math.random() < 0.14) flags.push('flight-risk');
    if (!flags.length) flags.push(pick(['steady', 'steady', 'steady', 'burned-out']));
    return flags;
  }

  function buildStaff(hero, managerId = 'player') {
    const competence = clamp(Math.round(42 + hero.baseCps * 9 + (bonusByRarity[hero.rarity] || 0) + rand(-4, 6)), 35, 95);
    const annualSalary = Math.round(52000 + hero.baseCps * 9000 + (bonusByRarity[hero.rarity] || 0) * 1800 + rand(-4000, 6000));
    return {
      id: makeId(hero.id),
      poolId: hero.id,
      name: hero.name,
      role: hero.role,
      emoji: hero.emoji,
      rarity: hero.rarity,
      skills: hero.skills || [],
      managerId,
      isSupervisor: false,
      competence,
      morale: rand(56, 74),
      burnout: rand(10, 26),
      loyalty: rand(48, 72),
      managerRelationship: rand(46, 70),
      annualSalary,
      flags: pickFlags(hero),
      notes: hero.desc,
    };
  }

  function usedPoolIds(state) {
    return new Set([...state.staffState, ...state.candidateSlate].map((item) => item.poolId));
  }

  function chooseCandidates(state) {
    if (getOpenHeadcount(state) <= 0 || state.weeklyFlags.freezeHiring) {
      state.candidateSlate = [];
      state.selectedCandidateId = null;
      return;
    }
    const used = usedPoolIds(state);
    const pool = STAFF_POOL.filter((hero) => !used.has(hero.id));
    state.candidateSlate = shuffle(pool).slice(0, SLATE_SIZE).map((hero) => buildStaff(hero, null));
    state.selectedCandidateId = state.candidateSlate[0] ? state.candidateSlate[0].id : null;
  }

  function getWeakestMetric(state = S) {
    const entries = [
      ['backlog', 100 - state.backlog],
      ['morale', state.morale],
      ['budgetHealth', state.budgetHealth],
      ['compliance', state.compliance],
      ['politicalCapital', state.politicalCapital],
    ].sort((a, b) => a[1] - b[1]);
    return entries[0][0];
  }

  function metricCategory(state = S) {
    const weak = getWeakestMetric(state);
    if (weak === 'backlog') return pick(['incident', 'boss']);
    if (weak === 'budgetHealth') return 'finance';
    if (weak === 'compliance') return 'audit';
    if (weak === 'morale') return 'hr';
    if (weak === 'politicalCapital') return pick(['boss', 'ai']);
    return pick(['boss', 'finance', 'audit', 'vendor', 'hr', 'incident', 'ai']);
  }

  function applyEffects(effects = {}) {
    Object.entries(effects).forEach(([key, value]) => {
      if (key === 'actionPoints') return void (S.actionPoints = Math.max(0, S.actionPoints + value));
      if (key === 'morale') {
        shiftAllStaff('morale', value);
        return void recomputeMorale();
      }
      if (key === 'backlog') S.backlog = clamp(S.backlog + value, 0, 100);
      if (key === 'budgetHealth') S.budgetHealth = clamp(S.budgetHealth + value, 0, 100);
      if (key === 'compliance') S.compliance = clamp(S.compliance + value, 0, 100);
      if (key === 'politicalCapital') S.politicalCapital = clamp(S.politicalCapital + value, 0, 100);
      if (key === 'narrativeDebt') S.narrativeDebt = clamp(S.narrativeDebt + value, 0, 100);
      if (key === 'promotionPressure') S.promotionPressure = clamp(S.promotionPressure + value, 0, 100);
    });
  }

  function enqueueConsequence(id) {
    const template = CONSEQUENCES[id];
    if (template) S.pendingConsequences.push({ id, weeksLeft: template.delayWeeks });
  }

  function logWeek(text, tone = 'neutral') {
    S.weekLog.unshift({ week: S.week, text, tone });
    S.weekLog = S.weekLog.slice(0, 12);
  }

  function addModifier(text) {
    S.weeklyModifiers.unshift(text);
    S.weeklyModifiers = S.weeklyModifiers.slice(0, 8);
  }

  function applyConsequence(entry) {
    const template = CONSEQUENCES[entry.id];
    if (!template) return;
    applyEffects(template.effects);
    if (entry.id === 'burnout_wave') {
      shuffle(S.staffState).slice(0, 2).forEach((staff) => {
        staff.burnout = clamp(staff.burnout + 16, 0, 100);
        staff.morale = clamp(staff.morale - 8, 0, 100);
      });
      recomputeMorale();
    }
    if (entry.id === 'canceled_one_on_ones') {
      const target = pick(S.staffState.filter((staff) => !staff.isSupervisor));
      if (target && !target.flags.includes('flight-risk')) target.flags.push('flight-risk');
    }
    if (entry.id === 'shadow_ai_blowback') {
      const target = pick(S.staffState);
      if (target && !target.flags.includes('hidden-problem')) target.flags.push('hidden-problem');
    }
    addModifier(template.log);
    logWeek(template.log, 'risk');
  }

  function processConsequences() {
    const keep = [];
    S.pendingConsequences.forEach((entry) => {
      entry.weeksLeft -= 1;
      if (entry.weeksLeft <= 0) applyConsequence(entry);
      else keep.push(entry);
    });
    S.pendingConsequences = keep;
  }

  function makeEvent(category, usedIds = new Set()) {
    const pool = (EVENT_TEMPLATES[category] || []).filter((item) => !usedIds.has(item.id));
    if (!pool.length) return null;
    const template = pick(pool);
    const event = {
      id: makeId(template.id),
      templateId: template.id,
      category,
      title: template.title,
      summary: template.summary,
      mandatory: !!template.mandatory,
      resolved: false,
      chosenLabel: '',
      choices: template.choices || [],
      autoEffects: template.autoEffects || null,
    };
    if (category === 'news') {
      event.resolved = true;
      event.chosenLabel = 'Ambient nonsense';
      applyEffects(event.autoEffects || {});
      addModifier(`${event.title}: ${event.summary}`);
      logWeek(event.title, 'news');
    }
    return event;
  }

  function buildPoliticalMoves() {
    const ids = ['tell_truth', 'spin_boss'];
    if (S.backlog > 58) ids.push(pick(['hide_backlog', 'midnight_oil']));
    else if (getOpenHeadcount() > 0) ids.push('freeze_hiring');
    else if (S.compliance > 35) ids.push('skip_time_tracking');
    else ids.push(pick(['cancel_one_on_ones', 'blame_vendor']));
    if (S.weeklyInbox.some((event) => event.category === 'vendor')) ids.push('blame_vendor');
    return [...new Set(ids)].slice(0, 4);
  }

  function buildBossState() {
    const boss = BOSS_ARCHETYPES[Math.min(BOSS_ARCHETYPES.length - 1, Math.floor(S.careerTier / 2))] || BOSS_ARCHETYPES[0];
    const moodScore = computePromotionScore() - Math.round(S.narrativeDebt * 0.15) - (S.pipStatus ? 10 : 0) - S.warningCount * 5;
    return {
      archetypeId: boss.id,
      mood: moodScore >= 70 ? boss.moods[0] : moodScore >= 45 ? boss.moods[1] : boss.moods[2],
      ask: pick(boss.asks),
      needsExplanation: S.backlog > 68 || S.narrativeDebt > 55 || S.warningCount > 0 || S.pipStatus,
      availableMoves: buildPoliticalMoves(),
    };
  }

  function generateWeeklyInbox() {
    const usedIds = new Set();
    const inbox = [];
    const first = makeEvent(metricCategory(), usedIds);
    if (first) {
      usedIds.add(first.templateId);
      inbox.push(first);
    }
    const secondCategory = S.narrativeDebt > 60 || S.warningCount > 0 || S.backlog > 72 ? (S.compliance < 45 ? 'audit' : pick(['boss', 'finance', 'vendor', 'hr'])) : pick(['vendor', 'hr', 'ai', 'finance', 'theater']);
    const second = makeEvent(secondCategory, usedIds);
    if (second) {
      usedIds.add(second.templateId);
      inbox.push(second);
    }
    const news = makeEvent('news', usedIds);
    if (news) inbox.push(news);
    if (Math.random() < 0.45) {
      const optional = makeEvent(pick(['theater', 'ai']), usedIds);
      if (optional) inbox.push(optional);
    }
    return inbox;
  }

  function chooseManagerForHire() {
    const supervisors = S.staffState.filter((staff) => staff.isSupervisor);
    if (!supervisors.length) return 'player';
    const capacity = getSupervisorCapacity();
    const managerLoad = [{ id: 'player', load: directReports('player').length }].concat(supervisors.map((staff) => ({ id: staff.id, load: directReports(staff.id).length }))).sort((a, b) => a.load - b.load);
    const open = managerLoad.find((entry) => entry.id === 'player' || entry.load < capacity);
    return open ? open.id : managerLoad[0].id;
  }

  function rebalanceReports() {
    const supervisors = S.staffState.filter((staff) => staff.isSupervisor);
    if (!supervisors.length) {
      S.staffState.forEach((staff) => { if (!staff.isSupervisor) staff.managerId = 'player'; });
      return;
    }
    const capacity = getSupervisorCapacity();
    const managed = supervisors.map((supervisor) => ({ id: supervisor.id, load: 0 }));
    S.staffState.filter((staff) => !staff.isSupervisor).forEach((staff) => {
      const preferred = managed.find((entry) => entry.id === staff.managerId && entry.load < capacity);
      if (preferred) return void (preferred.load += 1);
      managed.sort((a, b) => a.load - b.load);
      if (directReports('player').length < capacity) staff.managerId = 'player';
      else {
        staff.managerId = managed[0].id;
        managed[0].load += 1;
      }
    });
  }

  function prepareWeek(initial = false) {
    processConsequences();
    S.actionPoints = currentCareer().weeklyAP;
    S.weeklyActionsTaken = [];
    S.weeklyModifiers = [];
    S.weeklyFlags = { usedPoliticalMove: false, freezeHiring: false, reviewRequested: false, midnightOil: false };
    chooseCandidates(S);
    S.weeklyInbox = generateWeeklyInbox();
    S.bossState = buildBossState();
    recomputeMorale();
    if (!S.selectedStaffId || !staffById(S.selectedStaffId)) S.selectedStaffId = S.staffState[0] ? S.staffState[0].id : null;
    if (!S.selectedCandidateId || !candidateById(S.selectedCandidateId)) S.selectedCandidateId = S.candidateSlate[0] ? S.candidateSlate[0].id : null;
    if (initial) logWeek('You inherited a service desk pod that works just well enough to fail upward or implode.', 'neutral');
  }

  function buildFreshState(meta = {}) {
    const starters = shuffle(STAFF_POOL).slice(0, START_TEAM).map((hero) => buildStaff(hero, 'player'));
    return {
      saveVersion: SAVE_KEY,
      week: 1,
      careerTier: 0,
      actionPoints: CAREER[0].weeklyAP,
      backlog: 52,
      morale: 62,
      budgetHealth: 56,
      compliance: 46,
      politicalCapital: meta.politicalCapital ?? 34,
      narrativeDebt: meta.narrativeDebt ?? 8,
      promotionPressure: 0,
      warningCount: 0,
      pipStatus: false,
      demotions: 0,
      firings: meta.firings || 0,
      lifetimeEarnings: meta.lifetimeEarnings || 0,
      staffState: starters,
      candidateSlate: [],
      bossState: { archetypeId: BOSS_ARCHETYPES[0].id, mood: '', ask: '', needsExplanation: false, availableMoves: [] },
      weeklyInbox: [],
      weeklyActionsTaken: [],
      weeklyModifiers: [],
      pendingConsequences: meta.pendingConsequences || [],
      selectedStaffId: starters[0] ? starters[0].id : null,
      selectedCandidateId: null,
      weekLog: meta.weekLog || [],
      weeklyFlags: {},
      lastFiredReason: '',
      isFired: false,
    };
  }

  function saveGame(label = 'Saved') {
    if (!S) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    const indicator = document.getElementById('save-indicator');
    if (!indicator) return;
    indicator.textContent = label;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { indicator.textContent = 'Saved'; }, 1500);
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.saveVersion === SAVE_KEY ? parsed : null;
    } catch {
      return null;
    }
  }

  function toast(message, tone = 'neutral') {
    const area = document.getElementById('toast-area');
    if (!area) return;
    const node = document.createElement('div');
    node.className = `toast ${tone}`;
    node.textContent = message;
    area.prepend(node);
    setTimeout(() => node.remove(), 2800);
  }

  function spendAP(cost) {
    if (S.actionPoints < cost) {
      toast('Not enough AP this week.', 'bad');
      if (SFX.error) SFX.error();
      return false;
    }
    S.actionPoints -= cost;
    return true;
  }

  function recordAction(label) {
    S.weeklyActionsTaken.unshift(label);
    S.weeklyActionsTaken = S.weeklyActionsTaken.slice(0, 10);
    addModifier(label);
  }

  function canUseAction(action) {
    if (S.actionPoints < action.apCost) return 'Not enough AP';
    if (action.target === 'staff' && !staffById(S.selectedStaffId)) return 'Select an employee';
    if (action.target === 'candidate' && !candidateById(S.selectedCandidateId)) return 'Select a candidate';
    if (action.id === 'approve_offer' && getOpenHeadcount() <= 0) return 'No open headcount';
    if (action.id === 'approve_offer' && S.weeklyFlags.freezeHiring) return 'Hiring is frozen this week';
    if (action.id === 'promote_supervisor') {
      const staff = staffById(S.selectedStaffId);
      if (!staff) return 'Select an employee';
      if (staff.isSupervisor) return 'Already a supervisor';
      if (getOpenSupervisorSlots() <= 0) return 'No supervisor slot';
      if (staff.competence < 62) return 'Needs more competence';
      if (S.careerTier < 1) return 'Promote first';
    }
    if (action.id === 'fire_employee') {
      const staff = staffById(S.selectedStaffId);
      if (!staff || staff.isSupervisor) return 'Select a non-supervisor';
    }
    if (action.id === 'fire_supervisor') {
      const staff = staffById(S.selectedStaffId);
      if (!staff || !staff.isSupervisor) return 'Select a supervisor';
    }
    if (action.id === 'ask_review' && S.weeklyFlags.reviewRequested) return 'Already asked this week';
    return '';
  }

  function performAction(id) {
    const action = WEEKLY_ACTIONS.find((item) => item.id === id);
    if (!action) return;
    const blocked = canUseAction(action);
    if (blocked) {
      toast(blocked, 'bad');
      if (SFX.error) SFX.error();
      return;
    }
    if (!spendAP(action.apCost)) return;
    const staff = staffById(S.selectedStaffId);
    const candidate = candidateById(S.selectedCandidateId);

    switch (id) {
      case 'work_tickets':
        applyEffects({ backlog: -9, politicalCapital: 1 });
        shiftAllStaff('burnout', 1);
        recordAction('Worked tickets instead of making slides.');
        break;
      case 'reporting':
        applyEffects({ politicalCapital: 7, compliance: 2, backlog: 2, promotionPressure: 2 });
        recordAction('Built executive-ready reporting and called it visibility.');
        break;
      case 'budgeting':
        applyEffects({ budgetHealth: 8, politicalCapital: 1, morale: -1 });
        recordAction('Did budgeting before Finance weaponized the spreadsheet.');
        break;
      case 'meetings':
        applyEffects({ politicalCapital: 4, backlog: 3, morale: 2 });
        recordAction('Sat in meetings until alignment replaced progress.');
        break;
      case 'time_tracking':
        applyEffects({ compliance: 10, backlog: 2, politicalCapital: -1 });
        recordAction('Fed compliance with timestamps.');
        break;
      case 'one_on_one':
        staff.morale = clamp(staff.morale + 14, 0, 100);
        staff.loyalty = clamp(staff.loyalty + 10, 0, 100);
        staff.managerRelationship = clamp(staff.managerRelationship + 10, 0, 100);
        staff.burnout = clamp(staff.burnout - 8, 0, 100);
        if (staff.flags.includes('hidden-problem')) {
          staff.flags = staff.flags.filter((flag) => flag !== 'hidden-problem');
          applyEffects({ backlog: -3, compliance: 2 });
          recordAction(`Held a 1:1 with ${staff.name} and found a hidden problem.`);
        } else recordAction(`Held a 1:1 with ${staff.name}.`);
        recomputeMorale();
        break;
      case 'approve_offer': {
        const hire = { ...candidate, managerId: chooseManagerForHire() };
        S.staffState.push(hire);
        S.candidateSlate = S.candidateSlate.filter((item) => item.id !== candidate.id);
        S.selectedCandidateId = S.candidateSlate[0] ? S.candidateSlate[0].id : null;
        applyEffects({ budgetHealth: -5, backlog: -4, politicalCapital: 2, morale: 1 });
        recordAction(`Approved an offer for ${hire.name}.`);
        if (SFX.recruit) SFX.recruit();
        break;
      }
      case 'approve_raise':
        staff.annualSalary = Math.round(staff.annualSalary * 1.08);
        staff.morale = clamp(staff.morale + 18, 0, 100);
        staff.loyalty = clamp(staff.loyalty + 12, 0, 100);
        staff.managerRelationship = clamp(staff.managerRelationship + 8, 0, 100);
        applyEffects({ budgetHealth: -6, politicalCapital: 1 });
        recomputeMorale();
        recordAction(`Approved a raise for ${staff.name}.`);
        break;
      case 'promote_supervisor':
        staff.isSupervisor = true;
        staff.role = `Supervisor - ${staff.role}`;
        staff.annualSalary = Math.round(staff.annualSalary * 1.14);
        staff.loyalty = clamp(staff.loyalty + 10, 0, 100);
        staff.managerRelationship = clamp(staff.managerRelationship + 8, 0, 100);
        applyEffects({ politicalCapital: 5, budgetHealth: -4, morale: 3 });
        rebalanceReports();
        recordAction(`Promoted ${staff.name} to supervisor.`);
        if (SFX.levelUp) SFX.levelUp();
        break;
      case 'fire_employee': {
        const name = staff.name;
        S.staffState = S.staffState.filter((item) => item.id !== staff.id);
        applyEffects({ budgetHealth: 8, morale: -12, backlog: 8, narrativeDebt: 6, politicalCapital: S.budgetHealth < 40 ? 2 : -4 });
        recomputeMorale();
        recordAction(`Fired ${name}.`);
        break;
      }
      case 'fire_supervisor': {
        const name = staff.name;
        S.staffState.filter((item) => item.managerId === staff.id).forEach((item) => { item.managerId = 'player'; });
        S.staffState = S.staffState.filter((item) => item.id !== staff.id);
        applyEffects({ budgetHealth: 12, morale: -18, backlog: 10, narrativeDebt: 8, politicalCapital: 4 });
        rebalanceReports();
        recomputeMorale();
        recordAction(`Fired supervisor ${name}.`);
        break;
      }
      case 'ask_review': {
        const score = computePromotionScore();
        S.weeklyFlags.reviewRequested = true;
        if (score >= currentCareer().promotionTarget - 6 && !S.pipStatus) {
          applyEffects({ politicalCapital: 6, promotionPressure: 18 });
          recordAction('Asked for review at the exact moment the numbers could support it.');
        } else {
          applyEffects({ politicalCapital: -6, narrativeDebt: 1 });
          recordAction('Asked for review too early and leadership noticed.');
        }
        break;
      }
    }

    if (!staffById(S.selectedStaffId)) S.selectedStaffId = S.staffState[0] ? S.staffState[0].id : null;
    saveGame('Autosaved');
    renderAll();
  }
  function performPoliticalMove(id) {
    if (S.weeklyFlags.usedPoliticalMove) {
      toast('You already spent your weekly political move.', 'bad');
      return;
    }
    const move = POLITICAL_MOVES.find((item) => item.id === id);
    if (!move) return;
    if (!spendAP(move.apCost)) return;

    switch (id) {
      case 'tell_truth':
        applyEffects({ politicalCapital: -4, narrativeDebt: -8, compliance: 3, promotionPressure: 4 });
        enqueueConsequence('truth_respect');
        recordAction('Told the truth and watched the room react like it was impolite.');
        break;
      case 'spin_boss':
        applyEffects({ politicalCapital: 9, narrativeDebt: 8, compliance: -1 });
        recordAction('Spun the week into an executive narrative with only light fraud energy.');
        break;
      case 'hide_backlog':
        applyEffects({ politicalCapital: 8, narrativeDebt: 10 });
        enqueueConsequence('hidden_backlog');
        recordAction('Hid backlog behind platform stabilization language.');
        break;
      case 'freeze_hiring':
        applyEffects({ budgetHealth: 8, morale: -5, narrativeDebt: 4 });
        enqueueConsequence('frozen_hiring');
        S.weeklyFlags.freezeHiring = true;
        S.candidateSlate = [];
        S.selectedCandidateId = null;
        recordAction('Froze hiring and called it fiscal discipline.');
        break;
      case 'skip_time_tracking':
        applyEffects({ actionPoints: 1, compliance: -8, narrativeDebt: 7 });
        enqueueConsequence('skipped_tracking');
        recordAction('Skipped time tracking to create strategic capacity out of audit risk.');
        break;
      case 'cancel_one_on_ones':
        applyEffects({ actionPoints: 1, morale: -7, narrativeDebt: 6 });
        enqueueConsequence('canceled_one_on_ones');
        recordAction('Canceled 1:1s and converted trust into free AP.');
        break;
      case 'blame_vendor':
        applyEffects({ politicalCapital: 6, narrativeDebt: 7 });
        enqueueConsequence('vendor_receipts');
        recordAction('Blamed the vendor. This usually works right up until it does not.');
        break;
      case 'midnight_oil':
        applyEffects({ backlog: -8, politicalCapital: 4, morale: -6, narrativeDebt: 5 });
        enqueueConsequence('burnout_wave');
        S.weeklyFlags.midnightOil = true;
        recordAction('Pushed midnight oil and called exhaustion commitment.');
        break;
    }

    S.weeklyFlags.usedPoliticalMove = true;
    saveGame('Autosaved');
    renderAll();
  }

  function resolveInboxChoice(eventId, choiceId) {
    const event = S.weeklyInbox.find((item) => item.id === eventId);
    if (!event || event.resolved) return;
    const choice = event.choices.find((item) => item.id === choiceId);
    if (!choice) return;
    applyEffects(choice.effects);
    if (choice.consequence) enqueueConsequence(choice.consequence);
    event.resolved = true;
    event.chosenLabel = choice.label;
    recordAction(`${event.title}: ${choice.label}.`);
    if (SFX.purchase) SFX.purchase();
    saveGame('Autosaved');
    renderAll();
  }

  function unresolvedMandatory() {
    return S.weeklyInbox.filter((item) => item.mandatory && !item.resolved).length;
  }

  function computePromotionScore() {
    const score =
      S.politicalCapital * 0.35 +
      (100 - S.backlog) * 0.25 +
      S.budgetHealth * 0.20 +
      S.compliance * 0.10 +
      S.morale * 0.10;
    const debtPenalty = Math.max(0, S.narrativeDebt - 40) * 0.25;
    const warningPenalty = S.warningCount * 4 + (S.pipStatus ? 8 : 0);
    return clamp(Math.round(score - debtPenalty - warningPenalty), 0, 100);
  }

  function teamDelivery() {
    const total = S.staffState.reduce((sum, staff) => {
      const effectiveness = staff.competence * (0.55 + staff.morale / 200) * (1 - staff.burnout / 160);
      return sum + Math.max(0, effectiveness);
    }, 0);
    const supervisorBonus = S.staffState.filter((staff) => staff.isSupervisor).reduce((sum, staff) => sum + staff.competence * 0.12, 0);
    return Math.round(total / 22 + supervisorBonus / 14);
  }

  function applyStaffDrift() {
    S.staffState.forEach((staff) => {
      const moraleDrift = (S.backlog > 72 ? -5 : S.backlog > 58 ? -2 : 0) + (S.weeklyFlags.freezeHiring ? -2 : 0);
      const burnoutDrift = S.weeklyFlags.midnightOil ? 12 : S.backlog > 65 ? 4 : -2;
      staff.morale = clamp(staff.morale + moraleDrift, 0, 100);
      staff.burnout = clamp(staff.burnout + burnoutDrift, 0, 100);
      staff.managerRelationship = clamp(staff.managerRelationship + (S.weeklyFlags.usedPoliticalMove ? -1 : 1), 0, 100);
      if (staff.burnout > 78 && !staff.flags.includes('flight-risk')) staff.flags.push('flight-risk');
    });
    recomputeMorale();
  }

  function maybeQuitter() {
    const risky = S.staffState.filter((staff) => !staff.isSupervisor && (staff.morale < 24 || staff.burnout > 88 || (staff.flags.includes('flight-risk') && staff.morale < 40)));
    if (!risky.length || Math.random() > 0.22) return;
    const quitter = pick(risky);
    S.staffState = S.staffState.filter((staff) => staff.id !== quitter.id);
    applyEffects({ backlog: 8, politicalCapital: -3, morale: -4 });
    logWeek(`${quitter.name} quit for a role described as “strategic but better staffed.”`, 'bad');
    toast(`${quitter.name} quit.`, 'bad');
  }

  function maybeExposure() {
    if (S.narrativeDebt < 55) return false;
    const threshold = 0.12 + (S.narrativeDebt - 55) / 120;
    if (Math.random() > threshold) return false;
    applyEffects({ politicalCapital: -10, compliance: -6, backlog: 5 });
    logWeek('An exposure event hits: somebody senior found the difference between the deck and reality.', 'bad');
    toast('Exposure event: the narrative cracked.', 'bad');
    return true;
  }

  function promoteCareer() {
    if (S.careerTier >= CAREER.length - 1) return;
    S.careerTier += 1;
    S.promotionPressure = 0;
    S.warningCount = Math.max(0, S.warningCount - 1);
    S.pipStatus = false;
    applyEffects({ politicalCapital: 8, narrativeDebt: -4, budgetHealth: 3 });
    logWeek(`Promoted to ${currentCareer().title}. The org is bigger and the excuses are more expensive.`, 'good');
    toast(`Promoted to ${currentCareer().title}.`, 'good');
    if (SFX.promotion) SFX.promotion();
  }

  function demoteCareer(reason) {
    if (S.careerTier <= 0) return firePlayer(reason);
    S.careerTier -= 1;
    S.demotions += 1;
    S.promotionPressure = 0;
    S.warningCount = 1;
    S.pipStatus = true;
    applyEffects({ politicalCapital: -14, narrativeDebt: 4, morale: -4 });
    logWeek(`Demoted to ${currentCareer().title}. ${reason}`, 'bad');
    toast('Demoted.', 'bad');
  }

  function firePlayer(reason) {
    S.isFired = true;
    S.lastFiredReason = reason;
    document.getElementById('fired-reason').textContent = reason;
    document.getElementById('fired-modal').classList.remove('hidden');
    logWeek(`Fired. ${reason}`, 'bad');
    saveGame('Fired');
  }

  function evaluatePromotionAndFailure(exposureTriggered) {
    const score = computePromotionScore();
    const target = currentCareer().promotionTarget;
    if (target < 999 && !S.pipStatus && S.warningCount === 0) {
      if (score > target) S.promotionPressure = clamp(S.promotionPressure + Math.max(8, score - target + 8), 0, 100);
      else if (score > target - 8) S.promotionPressure = clamp(S.promotionPressure + 6, 0, 100);
      else S.promotionPressure = clamp(S.promotionPressure - 4, 0, 100);
    }
    const severe = S.backlog > 85 || S.compliance < 24 || S.morale < 24 || S.narrativeDebt > 86 || exposureTriggered;
    const badWeek = severe || score < 42;
    if (badWeek) {
      if (S.pipStatus || severe) {
        demoteCareer('Leadership has decided that accountability is directional and downward.');
      } else if (S.warningCount >= 1) {
        S.pipStatus = true;
        logWeek('You are now on a Performance Improvement Plan. The plan is mostly vibes and threat.', 'bad');
        toast('You are now on PIP.', 'bad');
      } else {
        S.warningCount += 1;
        logWeek('Formal warning issued. The slide deck now contains your name in red.', 'bad');
      }
    } else if (score > 62) {
      if (S.warningCount > 0) S.warningCount -= 1;
      if (S.pipStatus && score > 68) {
        S.pipStatus = false;
        logWeek('PIP cleared. You remain employed, which is its own reward.', 'good');
      }
      if (S.promotionPressure >= 100) promoteCareer();
    }
  }

  function endWeek() {
    if (unresolvedMandatory()) return void toast('Resolve mandatory inbox decisions before ending the week.', 'bad');
    const incomingLoad = 8 + S.careerTier * 2 + Math.round(S.staffState.length / 4) + getOpenHeadcount() * 2 + rand(0, 4);
    const worked = S.weeklyActionsTaken.filter((item) => item.includes('Worked tickets')).length;
    const resolved = teamDelivery() + worked * 8 + (S.weeklyFlags.midnightOil ? 4 : 0);
    S.backlog = clamp(S.backlog + incomingLoad - resolved, 0, 100);
    S.budgetHealth = clamp(S.budgetHealth - 1, 0, 100);
    S.compliance = clamp(S.compliance - 1, 0, 100);
    applyStaffDrift();
    maybeQuitter();
    const exposureTriggered = maybeExposure();
    S.lifetimeEarnings += weeklyPay();
    evaluatePromotionAndFailure(exposureTriggered);
    if (S.isFired) {
      saveGame('Fired');
      renderAll();
      return;
    }
    S.week += 1;
    rebalanceReports();
    prepareWeek();
    saveGame('Autosaved');
    renderAll();
  }

  function restartAfterFiring() {
    const keep = {
      firings: S.firings + 1,
      lifetimeEarnings: S.lifetimeEarnings,
      politicalCapital: 26,
      narrativeDebt: 6,
      weekLog: [{ week: 1, text: 'You were fired and rehired somewhere lower in the org chart. Corporate memory is short.', tone: 'bad' }],
    };
    S = buildFreshState(keep);
    prepareWeek(true);
    document.getElementById('fired-modal').classList.add('hidden');
    saveGame('Restarted');
    renderAll();
  }

  function selectedStaff() {
    return staffById(S.selectedStaffId);
  }
  function renderHeader() {
    const role = currentCareer();
    const score = computePromotionScore();
    const status = S.pipStatus ? 'PIP' : S.warningCount > 0 ? `Warning x${S.warningCount}` : S.careerTier === CAREER.length - 1 ? 'CIO' : 'Active';
    document.getElementById('week-display').textContent = `Week ${S.week}`;
    document.getElementById('role-title').textContent = role.title;
    document.getElementById('org-scale').textContent = role.orgScale;
    document.getElementById('salary-hourly').textContent = `$${role.hourlyRate}/hr`;
    document.getElementById('salary-annual').textContent = fmtMoney(role.annualSalary);
    document.getElementById('salary-lifetime').textContent = fmtMoney(S.lifetimeEarnings);
    document.getElementById('promotion-pressure').textContent = `${S.promotionPressure}%`;
    document.getElementById('promotion-score').textContent = `${score}`;
    document.getElementById('status-pill').textContent = status;
    document.getElementById('status-pill').className = `status-pill ${S.pipStatus ? 'bad' : S.warningCount ? 'warn' : 'good'}`;
  }

  function metricCard(label, value, tone, invert = false) {
    const pctValue = invert ? 100 - value : value;
    return `<div class="metric-card ${tone}"><div class="metric-top"><span>${label}</span><strong>${pct(value)}</strong></div><div class="metric-bar"><span style="width:${clamp(pctValue, 0, 100)}%"></span></div></div>`;
  }

  function renderSummary() {
    document.getElementById('summary-metrics').innerHTML = [
      metricCard('Backlog', S.backlog, 'bad', true),
      metricCard('Morale', S.morale, 'good'),
      metricCard('Budget Health', S.budgetHealth, 'warn'),
      metricCard('Compliance', S.compliance, 'info'),
      metricCard('Political Capital', S.politicalCapital, 'purple'),
      metricCard('Narrative Debt', S.narrativeDebt, 'bad'),
    ].join('');
    document.getElementById('week-modifiers').innerHTML = (S.weeklyModifiers.length ? S.weeklyModifiers : ['No active modifiers yet.']).map((item) => `<li>${item}</li>`).join('');
  }

  function renderInbox() {
    document.getElementById('inbox-list').innerHTML = S.weeklyInbox.map((event) => `
      <article class="inbox-card ${event.mandatory ? 'mandatory' : ''} ${event.resolved ? 'resolved' : ''}">
        <div class="inbox-head">
          <span class="badge">${event.category.toUpperCase()}</span>
          ${event.mandatory ? '<span class="badge danger">Mandatory</span>' : '<span class="badge">Optional</span>'}
        </div>
        <h3>${event.title}</h3>
        <p>${event.summary}</p>
        ${event.resolved ? `<div class="resolved-note">Resolved: ${event.chosenLabel}</div>` : `<div class="choice-list">${event.choices.map((choice) => `<button class="choice-btn" data-event-id="${event.id}" data-choice-id="${choice.id}"><strong>${choice.label}</strong><span>${choice.summary}</span></button>`).join('')}</div>`}
      </article>`).join('') || '<div class="empty-state">No inbox items. This is suspicious.</div>';
    document.getElementById('mandatory-count').textContent = `${unresolvedMandatory()} unresolved`;
  }

  function renderActions() {
    const employee = selectedStaff();
    const candidate = candidateById(S.selectedCandidateId);
    document.getElementById('ap-display').textContent = `${S.actionPoints} AP`;
    document.getElementById('action-target').textContent = employee ? `Employee focus: ${employee.name}` : candidate ? `Candidate focus: ${candidate.name}` : 'Select an employee or candidate for targeted actions.';
    document.getElementById('action-grid').innerHTML = WEEKLY_ACTIONS.map((action) => {
      const blocked = canUseAction(action);
      return `<button class="action-card" data-action-id="${action.id}" ${blocked ? 'disabled' : ''}><span class="action-icon">${action.icon}</span><span class="action-name">${action.label}</span><span class="action-cost">${action.apCost} AP</span><span class="action-desc">${blocked || action.description}</span></button>`;
    }).join('');
    document.getElementById('action-log').innerHTML = (S.weeklyActionsTaken.length ? S.weeklyActionsTaken : ['No actions taken yet.']).map((item) => `<li>${item}</li>`).join('');
  }

  function orgSummary() {
    return `${S.staffState.length} filled • ${getOpenHeadcount()} open req • ${S.staffState.filter((staff) => staff.isSupervisor).length} supervisors • ${getOpenSupervisorSlots()} open supervisor slots`;
  }

  function staffCard(staff, managerLabel = '') {
    const selected = S.selectedStaffId === staff.id ? 'selected' : '';
    const manager = managerLabel || (staff.managerId === 'player' ? 'You' : (staffById(staff.managerId)?.name || 'You'));
    return `<button class="staff-card ${selected}" data-staff-id="${staff.id}"><div class="staff-top"><span class="staff-emoji">${staff.emoji}</span><span class="staff-name">${staff.name}</span>${staff.isSupervisor ? '<span class="badge purple">Supervisor</span>' : ''}</div><div class="staff-role">${staff.role}</div><div class="staff-meta">Mgr: ${manager}</div><div class="staff-stats"><span>Comp ${staff.competence}</span><span>Morale ${staff.morale}</span><span>Burnout ${staff.burnout}</span></div></button>`;
  }

  function renderOrg() {
    const supervisors = S.staffState.filter((staff) => staff.isSupervisor);
    const directsToPlayer = S.staffState.filter((staff) => !staff.isSupervisor && staff.managerId === 'player');
    const managerGroups = supervisors.map((supervisor) => `<section class="org-group"><div class="org-group-title">${supervisor.name} (${directReports(supervisor.id).length}/${getSupervisorCapacity()})</div><div class="staff-grid small">${directReports(supervisor.id).map((staff) => staffCard(staff, supervisor.name)).join('') || '<div class="open-slot">Open under supervisor</div>'}</div></section>`).join('');
    document.getElementById('org-summary').textContent = orgSummary();
    document.getElementById('org-chart').innerHTML = `<section class="org-group player-group"><div class="player-node"><div><div class="player-title">You</div><div class="player-role">${currentCareer().title}</div></div><div class="player-mini">${directsToPlayer.length} direct reports</div></div><div class="staff-grid">${directsToPlayer.map((staff) => staffCard(staff, 'You')).join('') || '<div class="open-slot">No direct reports</div>'}</div></section>${supervisors.length ? managerGroups : '<section class="org-group"><div class="org-group-title">Supervisors</div><div class="open-slot">No supervisors yet. Promote one after your first promotion.</div></section>'}`;
    document.getElementById('candidate-slate').innerHTML = S.candidateSlate.length ? S.candidateSlate.map((candidate) => `<button class="candidate-card ${S.selectedCandidateId === candidate.id ? 'selected' : ''}" data-candidate-id="${candidate.id}"><div class="staff-top"><span class="staff-emoji">${candidate.emoji}</span><span class="staff-name">${candidate.name}</span></div><div class="staff-role">${candidate.role}</div><div class="staff-meta">${fmtMoney(candidate.annualSalary)} • ${candidate.flags.join(' / ')}</div></button>`).join('') : '<div class="open-slot">No candidate slate this week.</div>';
    const staff = selectedStaff();
    document.getElementById('staff-detail').innerHTML = staff ? `<div class="detail-head"><div><div class="detail-name">${staff.name}</div><div class="detail-role">${staff.role}</div></div><span class="badge ${staff.isSupervisor ? 'purple' : ''}">${staff.isSupervisor ? 'Supervisor' : 'Employee'}</span></div><div class="detail-grid"><div><span>Competence</span><strong>${staff.competence}</strong></div><div><span>Morale</span><strong>${staff.morale}</strong></div><div><span>Burnout</span><strong>${staff.burnout}</strong></div><div><span>Loyalty</span><strong>${staff.loyalty}</strong></div><div><span>Salary</span><strong>${fmtMoney(staff.annualSalary)}</strong></div><div><span>Manager Rel.</span><strong>${staff.managerRelationship}</strong></div></div><div class="detail-flags">${staff.flags.map((flag) => `<span class="tag">${flag}</span>`).join('')}</div><p class="detail-note">${staff.notes}</p>` : '<div class="empty-state">Select an employee to inspect them.</div>';
  }

  function renderBoss() {
    const boss = currentBoss();
    document.getElementById('boss-name').textContent = boss.name;
    document.getElementById('boss-title').textContent = boss.title;
    document.getElementById('boss-mood').textContent = S.bossState.mood;
    document.getElementById('boss-ask').textContent = S.bossState.ask;
    document.getElementById('boss-explain').textContent = S.bossState.needsExplanation ? 'You owe leadership an explanation this week.' : 'Leadership is distracted by someone else for the moment.';
    document.getElementById('political-moves').innerHTML = S.bossState.availableMoves.map((id) => {
      const move = POLITICAL_MOVES.find((item) => item.id === id);
      const disabled = S.weeklyFlags.usedPoliticalMove || S.actionPoints < move.apCost;
      return `<button class="move-card" data-move-id="${move.id}" ${disabled ? 'disabled' : ''}><span class="action-icon">${move.icon}</span><span class="action-name">${move.label}</span><span class="action-cost">${move.apCost} AP</span><span class="action-desc">${S.weeklyFlags.usedPoliticalMove ? 'Political move already spent.' : move.description}</span></button>`;
    }).join('');
    document.getElementById('history-log').innerHTML = S.weekLog.map((entry) => `<li class="${entry.tone}">Week ${entry.week}: ${entry.text}</li>`).join('');
  }

  function renderResolve() {
    const pending = unresolvedMandatory();
    document.getElementById('resolve-note').textContent = pending ? `${pending} mandatory inbox decisions still unresolved.` : 'Week is ready to resolve. If this goes badly, it will still be your fault.';
    const button = document.getElementById('btn-end-week');
    button.disabled = pending > 0;
    button.textContent = `Resolve Week ${S.week}`;
  }

  function renderAll() {
    renderHeader();
    renderSummary();
    renderInbox();
    renderActions();
    renderOrg();
    renderBoss();
    renderResolve();
  }
  function onDelegatedClick(event) {
    const action = event.target.closest('[data-action-id]');
    if (action) return performAction(action.dataset.actionId);
    const move = event.target.closest('[data-move-id]');
    if (move) return performPoliticalMove(move.dataset.moveId);
    const choice = event.target.closest('[data-event-id]');
    if (choice) return resolveInboxChoice(choice.dataset.eventId, choice.dataset.choiceId);
    const staff = event.target.closest('[data-staff-id]');
    if (staff) {
      S.selectedStaffId = staff.dataset.staffId;
      return void renderAll();
    }
    const candidate = event.target.closest('[data-candidate-id]');
    if (candidate) {
      S.selectedCandidateId = candidate.dataset.candidateId;
      renderAll();
    }
  }

  function bindEvents() {
    document.body.addEventListener('click', onDelegatedClick);
    document.getElementById('btn-end-week').addEventListener('click', endWeek);
    document.getElementById('btn-save').addEventListener('click', () => saveGame('Saved'));
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (!window.confirm('Reset the strategy sim and start over as Service Desk Supervisor?')) return;
      localStorage.removeItem(SAVE_KEY);
      S = buildFreshState();
      prepareWeek(true);
      saveGame('Reset');
      renderAll();
    });
    document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
    document.getElementById('close-help').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
    document.getElementById('btn-restart-fired').addEventListener('click', restartAfterFiring);
    document.getElementById('btn-sound').addEventListener('click', () => {
      const enabled = SFX.toggle ? SFX.toggle() : true;
      document.getElementById('btn-sound').textContent = enabled ? '🔊' : '🔇';
    });
    window.addEventListener('beforeunload', () => saveGame('Saved'));
  }

  function init() {
    const loaded = loadGame();
    S = loaded || buildFreshState();
    if (loaded) {
      S.weeklyModifiers = Array.isArray(S.weeklyModifiers) ? S.weeklyModifiers : [];
      S.weeklyActionsTaken = Array.isArray(S.weeklyActionsTaken) ? S.weeklyActionsTaken : [];
      S.pendingConsequences = Array.isArray(S.pendingConsequences) ? S.pendingConsequences : [];
      S.weeklyInbox = Array.isArray(S.weeklyInbox) ? S.weeklyInbox : [];
      S.candidateSlate = Array.isArray(S.candidateSlate) ? S.candidateSlate : [];
      S.staffState = Array.isArray(S.staffState) ? S.staffState : [];
      S.weeklyFlags = S.weeklyFlags || { usedPoliticalMove: false, freezeHiring: false, reviewRequested: false, midnightOil: false };
      S.bossState = S.bossState || buildBossState();
      rebalanceReports();
      recomputeMorale();
      if (S.isFired) {
        document.getElementById('fired-reason').textContent = S.lastFiredReason || 'Leadership has decided your story no longer aligns with the org.';
        document.getElementById('fired-modal').classList.remove('hidden');
      }
    } else {
      prepareWeek(true);
    }
    bindEvents();
    renderAll();
    saveGame('Saved');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
