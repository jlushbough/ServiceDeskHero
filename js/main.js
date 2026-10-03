/* ============================================================
   main.js — Core game engine, state, rendering, event handling
   Loaded as type="module". Reads GAME_DATA from window.
   ============================================================ */

// ── Wait for constants.js to populate window.GAME_DATA ──
const { CAREER, UPGRADES, HEROES, SKILLS, OFFICE_UPGRADES, INCIDENTS, ACHIEVEMENTS, DIFFICULTY_MODES } = window.GAME_DATA;
const SFX = window.SFX;
const FEEDBACK_ALLOWED = ['servicedeskhero.com', 'www.servicedeskhero.com'].includes(window.location.hostname);
const FEEDBACK_ENDPOINT = 'https://xthqp43m7fbaunjuvalsg5qgdm0ooggz.lambda-url.us-east-1.on.aws/';

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
let S = buildDefaultState();

function buildDefaultState() {
  return {
    // Resources
    tickets: 0,
    lifetimeTickets: 0,
    // Progression
    level: 1,
    xp: 0,
    xpRequired: 100,
    skillPoints: 0,
    // Career / prestige
    careerTier: 0,
    prestiges: 0,
    prestigeMultiplier: 1.0,
    officePerksChosen: [],
    officeDraftChoices: [],
    // Difficulty & balancing controls
    difficultyId: 'medium',
    strikes: 0,
    // Stats
    basePerClick: 1,
    basePerSec: 0,
    // Combo
    combo: 0,
    comboTimer: null,
    maxCombo: 0,
    // Skill unlocks (ids)
    unlockedSkills: [],
    // Upgrade ownership { id: count }
    upgradeOwned: {},
    // Hero state { id: { owned, level, xp, status, morale, absenceDays } }
    heroState: {},
    // Tracking day progression
    gameDay: 1,
    dayProgress: 0,
    // Guided onboarding flags
    tutorialDismissed: false,
    tutorialFirstClickDone: false,
    tutorialFirstRecruitDone: false,
    tutorialFirstUpgradeDone: false,
    tutorialFirstIncidentSeen: false,
    tutorialFirstIncidentResolved: false,
    tutorialRewardsClaimed: [],
    // Shift state
    clockedOut: false,
    clockedOutAt: null,
    restedBuffUntil: 0,
    shiftGraceUntil: 0,
    // Heroes currently available for hire
    applicantPool: [],
    // Metadata for active recruit candidates (bad hire flags/hints)
    recruitCandidateMeta: {},
    // Achievements earned
    achievedIds: [],
    // Stats for achievement checks
    incidentsResolved: 0,
    dispatches: 0,
    incidentLog: [],
    upgradesPurchased: 0,
    heroesOwned: 0,
    // Skill-driven modifiers
    skillMods: {
      perClick: 0,
      perSec: 0,
      perSecMult: 0,
      xpMult: 0,
      comboTime: 1.0,
      critChance: 0,
      critMult: 1,
      squadMult: 0,
      offlineHours: 4,
      prestigeMult: 1.0,
      globalMult: 1.0,
    },
    // Achievement-driven modifiers
    achMods: {
      perClick: 0,
      perSec: 0,
      clickMult: 0,
      globalMult: 0,
      squadMult: 0,
      prestigeMult: 0,
      skillPoints: 0,
    },
    officeMods: {
      perClick: 0,
      perSec: 0,
      clickMult: 0,
      xpMult: 0,
      globalMult: 0,
      incidentRewardMult: 0,
    },
    // Timestamps
    lastSave: Date.now(),
    lastTick: Date.now(),
    lastBadHirePenaltyTick: Date.now(),
  };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function fmt(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9 ).toFixed(2) + 'B';
  if (n >= 1e6)  return (n / 1e6 ).toFixed(2) + 'M';
  if (n >= 1e3)  return (n / 1e3 ).toFixed(2) + 'K';
  return Math.floor(n).toLocaleString();
}

function fmtDecimal(n, d = 1) {
  if (n >= 1e9)  return (n / 1e9).toFixed(d) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(d) + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(d) + 'K';
  return n.toFixed(d);
}

function getDifficulty() {
  return DIFFICULTY_MODES.find((d) => d.id === S.difficultyId) || DIFFICULTY_MODES.find((d) => d.id === 'medium') || DIFFICULTY_MODES[0];
}

function recalcOfficeMods() {
  const totals = {
    perClick: 0,
    perSec: 0,
    clickMult: 0,
    xpMult: 0,
    globalMult: 0,
    incidentRewardMult: 0,
  };

  (S.officePerksChosen || []).forEach(id => {
    const perk = OFFICE_UPGRADES.find(x => x.id === id);
    if (!perk || !perk.effect) return;
    Object.entries(perk.effect).forEach(([key, value]) => {
      totals[key] = (totals[key] || 0) + value;
    });
  });

  S.officeMods = totals;
}

function rollOfficeDraftChoices() {
  const pool = OFFICE_UPGRADES.filter(perk => !(S.officePerksChosen || []).includes(perk.id));
  if (pool.length === 0) {
    S.officeDraftChoices = [];
    return [];
  }

  const picks = [...pool]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(3, pool.length))
    .map(perk => perk.id);

  S.officeDraftChoices = picks;
  return picks;
}

function getIncidentRewardMultiplier() {
  return 1 + (S.officeMods?.incidentRewardMult || 0);
}

function getRemainingOfficePerks() {
  return OFFICE_UPGRADES.filter(perk => !(S.officePerksChosen || []).includes(perk.id));
}

function getCareerIntelModel() {
  const tier = CAREER[S.careerTier];
  const nextTier = CAREER[S.careerTier + 1] || null;
  const remainingOfficePerks = getRemainingOfficePerks();

  if (!nextTier) {
    return {
      tier,
      nextTier: null,
      pct: 100,
      remaining: 0,
      remainingOfficePerks,
      previewPerks: [],
    };
  }

  const req = getCareerRequirement(nextTier);
  const remaining = Math.max(0, req - S.lifetimeTickets);
  const pct = req > 0 ? Math.min((S.lifetimeTickets / req) * 100, 100) : 0;
  const previewPool = remainingOfficePerks
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 3);

  return {
    tier,
    nextTier,
    req,
    remaining,
    pct,
    remainingOfficePerks,
    previewPerks: previewPool,
  };
}

function getCareerIntelMarkup() {
  const intel = getCareerIntelModel();
  if (!intel.nextTier) {
    return {
      status: 'Top of pyramid',
      summary: 'You made CIO. Congratulations, you now own the meetings and the blame.',
      chips: ['<span class="career-intel-chip highlight">👑 Max rank reached</span>'],
      resetNote: 'Promotion loop complete. Now optimize the machine, chase achievements, or torment incidents for sport.',
    };
  }

  const promotionBonus = Math.max(0, ((intel.nextTier.prestigeBonus - 1) * 100));
  const officeText = intel.remainingOfficePerks.length
    ? `${intel.remainingOfficePerks.length} office upgrade${intel.remainingOfficePerks.length === 1 ? '' : 's'} still in the interlude pool.`
    : 'All office upgrades already secured.';

  return {
    status: intel.remaining === 0 ? 'Promotion armed' : `${Math.round(intel.pct)}% to ${intel.nextTier.title}`,
    summary: intel.remaining === 0
      ? `${intel.nextTier.icon} ${intel.nextTier.title} is ready. Promote for a permanent ×${intel.nextTier.prestigeBonus.toFixed(2)} multiplier, then pick an office upgrade before the next disaster cycle.`
      : `${fmt(intel.remaining)} tickets until ${intel.nextTier.icon} ${intel.nextTier.title}. Promotion adds roughly +${promotionBonus.toFixed(0)}% permanent power on this run's reset.${intel.remaining <= Math.max(1500, intel.req * 0.12) ? ' You are in striking distance, so stop buying decorative nonsense unless it pays back fast.' : ''}`,
    chips: [
      `<span class="career-intel-chip highlight">🏆 Next bonus ×${intel.nextTier.prestigeBonus.toFixed(2)}</span>`,
      `<span class="career-intel-chip">👥 Squad persists</span>`,
      `<span class="career-intel-chip">🧠 Skills persist</span>`,
      `<span class="career-intel-chip">🪑 ${officeText}</span>`,
      ...intel.previewPerks.map(perk => `<span class="career-intel-chip">${perk.icon} ${perk.name}</span>`),
    ],
    resetNote: 'Promotion resets current tickets, upgrades, level, and strikes. It keeps your squad, achievements, office perks, and the permanent prestige multiplier. In other words: shed the clutter, keep the empire.',
  };
}

function logIncidentEvent(incident, outcome, extra = {}) {
  if (!incident) return;
  const entry = {
    id: `${incident.id || 'incident'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    incidentId: incident.id || 'unknown',
    title: incident.title || 'Incident',
    icon: incident.icon || '🚨',
    category: incident.category || 'clerical',
    severity: getIncidentSeverity(incident).label,
    outcome,
    reward: extra.reward || 0,
    responder: extra.responder || null,
    responderType: extra.responderType || null,
    matchLabel: extra.matchLabel || null,
    note: extra.note || '',
    gameDay: S.gameDay || 1,
    at: Date.now(),
  };

  S.incidentLog = [entry, ...(Array.isArray(S.incidentLog) ? S.incidentLog : [])].slice(0, 8);
}

function getIncidentOutcomeTone(entry) {
  switch (entry.outcome) {
    case 'resolved_dispatch':
      return { label: 'Dispatched', cls: 'success' };
    case 'resolved_self':
      return { label: 'Handled Myself', cls: 'success' };
    case 'partial_self':
      return { label: 'Partial Save', cls: 'warning' };
    case 'failed_self':
      return { label: 'Failed', cls: 'danger' };
    case 'missed':
      return { label: 'Missed', cls: 'danger' };
    case 'deferred':
      return { label: 'Deferred', cls: 'neutral' };
    default:
      return { label: 'Logged', cls: 'neutral' };
  }
}

function dampenBonus(sum) {
  if (!sum || sum <= 0) return 0;
  return Math.sqrt(sum);
}

function applySoftCap(value, knee = 180, exponent = 0.8) {
  if (!value || value <= 0) return 0;
  if (value <= knee) return value;
  return knee * Math.pow(value / knee, exponent);
}

function getCareerRequirement(tier) {
  const d = getDifficulty();
  return Math.floor((tier?.xpRequired || 0) * (d.careerScale || 1));
}

function getHeroRecruitCost(h) {
  const d = getDifficulty();
  return Math.max(1, Math.floor(h.recruitCost * (d.recruitCostMultiplier || 1)));
}

function getHeroLevelCost(h, currentLevel = 1) {
  const d = getDifficulty();
  return Math.max(1, Math.floor(h.levelUpBaseCost * Math.pow(1.42, Math.max(0, currentLevel - 1)) * (d.heroLevelCostMultiplier || 1)));
}

function getHeroFireCost(h, hs) {
  const d = getDifficulty();
  const base = 120 + h.recruitCost + h.levelUpBaseCost * Math.max(1, (hs?.level || 1) * 0.5);
  return Math.max(1, Math.floor(base * (d.fireCostMultiplier || 0.7)));
}

function getHeroPenaltyHintLevel(meta, now = Date.now()) {
  if (!meta || !meta.badHire) return 0;
  const age = now - (meta.discoveredAt || now);
  if (age >= 150_000) return 3;
  if (age >= 90_000) return 2;
  if (age >= 30_000) return 1;
  return 0;
}

function xpForLevel(lvl) {
  return Math.floor(100 * Math.pow(lvl, 1.55));
}

// ══════════════════════════════════════════════════════════════
// BAD HIRE MORALE DRAIN
// ══════════════════════════════════════════════════════════════
function applyBadHireMoraleDrain() {
  const now = Date.now();
  const elapsed = now - (S.lastBadHirePenaltyTick || now);
  if (elapsed < 3000) return; // Only run every 3 seconds
  S.lastBadHirePenaltyTick = now;

  // Count active bad hires
  let badCount = 0;
  HEROES.forEach(h => {
    const hs = S.heroState[h.id];
    if (hs && hs.owned && hs.badHire && hs.status === 'Active') {
      badCount++;
      const ownedMs = now - (hs.ownedAt || now);
      const newHintLevel = ownedMs >= 150000 ? 3 : ownedMs >= 90000 ? 2 : ownedMs >= 30000 ? 1 : 0;
      if (newHintLevel > (hs.badHireHintLevel || 0)) {
        hs.badHireHintLevel = newHintLevel;
        if (newHintLevel === 1) toast(`🤨 ${h.name} is saying all the right buzzwords and none of the right things.`, 'red');
        if (newHintLevel === 2) toast(`🚩 ${h.name} is dragging the team down. People are starting to notice.`, 'red');
        if (newHintLevel === 3) toast(`☠️ ${h.name} has achieved full bad-hire visibility. Nobody trusts them anymore.`, 'red');
      }
    }
  });
  if (badCount === 0) {
    // Slowly recover morale when no bad hires present
    HEROES.forEach(h => {
      const hs = S.heroState[h.id];
      if (hs && hs.owned && !hs.badHire) {
        hs.badHirePenalty = Math.min(1, (hs.badHirePenalty || 1) + 0.005);
      }
    });
    return;
  }

  // Each bad hire reduces all other heroes' effective CPS by 1-2%
  const drainPerBad = 0.015; // 1.5% per bad hire per 3 seconds
  HEROES.forEach(h => {
    const hs = S.heroState[h.id];
    if (hs && hs.owned && !hs.badHire) {
      hs.badHirePenalty = Math.max(0.3, (hs.badHirePenalty || 1) - (drainPerBad * badCount));
    }
  });
}

// ══════════════════════════════════════════════════════════════
// STRIKE RECOVERY EVENTS
// ══════════════════════════════════════════════════════════════
const STRIKE_RECOVERY_EVENTS = [
  { name: 'CIO Knows My Dad', text: '👔 Nepotism wins again! Strike forgiven through connections.', icon: '🤝' },
  { name: 'Fixed a Big Problem Publicly', text: '🦸 You heroically fixed a major outage! (Never mind that you caused it.) -1 strike!', icon: '🔧' },
  { name: 'Blamed It On The Intern', text: '🎯 Strike reassigned to the intern. They probably deserved it anyway.', icon: '📋' },
  { name: 'Server Room Fire Drill', text: '🔥 Mandatory evacuation! By the time everyone got back, your mistake was forgotten.', icon: '🚨' },
  { name: 'Vendor Took The Fall', text: '🏢 The outsourcer absorbed the blame. That is what SLAs are for, right?', icon: '📝' },
  { name: 'Beer Friday Saved You', text: '🍺 Team bonding erased the grudge. Nothing a cold one cannot fix.', icon: '🎉' },
  { name: 'Convenient System Crash', text: '💥 A well-timed BSOD wiped the incident log. What strike?', icon: '💻' },
  { name: 'CEO Distracted by AI Hype', text: '🤖 Leadership is too busy talking about AI to remember your screw-up.', icon: '✨' },
];

function rollStrikeRecovery() {
  if (S.strikes <= 0) return;
  const chance = 0.07; // 7% chance per incident cycle
  if (Math.random() > chance) return;

  const evt = STRIKE_RECOVERY_EVENTS[Math.floor(Math.random() * STRIKE_RECOVERY_EVENTS.length)];
  S.strikes = Math.max(0, S.strikes - 1);
  toast(`${evt.icon} ${evt.name}: ${evt.text} Strikes: ${S.strikes}/3`, 'gold');
  SFX.levelUp();
  renderStats();
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.getElementById('toast-area').appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 350);
  }, 2800);
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
  if (tabName === 'squad') renderSquad();
  if (tabName === 'upgrades') renderUpgrades();
  if (tabName === 'skills') renderSkills();
  if (tabName === 'achievements') renderAchievements();
  if (tabName === 'stats') renderStatsTab();
}

function getCheapestRecruitTarget() {
  const candidates = S.applicantPool
    .map(id => HEROES.find(x => x.id === id))
    .filter(Boolean)
    .map(hero => ({ hero, cost: getHeroRecruitCost(hero) }));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.cost - b.cost)[0];
}

function getCheapestUpgradeTarget() {
  const candidates = UPGRADES.map(upgrade => ({ upgrade, cost: upgradeCost(upgrade) }));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.cost - b.cost)[0];
}

const ONBOARDING_REWARDS = {
  firstClick: {
    label: '+25 tickets',
    tickets: 25,
    xp: 0,
    toast: '⚡ First ticket bonus: +25 tickets. Bribery? No. Momentum.'
  },
  firstRecruit: {
    label: '+60 tickets',
    tickets: 60,
    xp: 0,
    toast: '👥 Delegation bonus: +60 tickets. Management loves headcount.'
  },
  firstUpgrade: {
    label: '+75 tickets',
    tickets: 75,
    xp: 0,
    toast: '🛠️ Process bonus: +75 tickets. Look at you, automating your way out of labor.'
  },
  firstIncidentResolved: {
    label: '+150 tickets +25 XP',
    tickets: 150,
    xp: 25,
    toast: '🚨 Firefight bonus: +150 tickets and +25 XP. Competence remains suspicious but profitable.'
  },
  firstShiftComplete: {
    label: '+250 tickets +60 XP',
    tickets: 250,
    xp: 60,
    toast: '🏁 First shift complete: +250 tickets and +60 XP. Fine. You survived probation.'
  },
};

function hasClaimedOnboardingReward(id) {
  return (S.tutorialRewardsClaimed || []).includes(id);
}

function claimOnboardingReward(id) {
  const reward = ONBOARDING_REWARDS[id];
  if (!reward || hasClaimedOnboardingReward(id)) return false;

  S.tutorialRewardsClaimed = [...(S.tutorialRewardsClaimed || []), id];
  if (reward.tickets) gainTickets(reward.tickets);
  if (reward.xp) gainXp(reward.xp);
  toast(reward.toast, 'gold');
  return true;
}

function tryCompleteFirstShiftBonus() {
  if (
    S.tutorialFirstClickDone &&
    S.tutorialFirstRecruitDone &&
    S.tutorialFirstUpgradeDone &&
    S.tutorialFirstIncidentResolved
  ) {
    claimOnboardingReward('firstShiftComplete');
  }
}

function renderOnboarding() {
  const panel = document.getElementById('onboarding-panel');
  if (!panel) return;

  const recruitTarget = getCheapestRecruitTarget();
  const upgradeTarget = getCheapestUpgradeTarget();
  const steps = [
    {
      id: 'firstClick',
      done: S.tutorialFirstClickDone,
      text: 'Resolve your first ticket and start the queue moving.'
    },
    {
      id: 'firstRecruit',
      done: S.tutorialFirstRecruitDone,
      text: recruitTarget
        ? `Recruit your first hero (${recruitTarget.hero.name} is ${fmt(recruitTarget.cost)} tickets right now).`
        : 'Recruit your first hero so tickets keep moving without your fingers.',
    },
    {
      id: 'firstUpgrade',
      done: S.tutorialFirstUpgradeDone,
      text: upgradeTarget
        ? `Buy your first upgrade (${upgradeTarget.upgrade.name} starts at ${fmt(upgradeTarget.cost)} tickets).`
        : 'Buy your first upgrade and begin automating your way into management.',
    },
    {
      id: 'firstIncidentResolved',
      done: S.tutorialFirstIncidentResolved,
      text: 'Survive your first incident without collecting a strike.'
    },
  ];

  const allDone = steps.every(step => step.done);
  if (S.tutorialDismissed || allDone) {
    if (allDone && !hasClaimedOnboardingReward('firstShiftComplete')) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
      return;
    }
  } else {
    panel.classList.remove('hidden');
  }

  document.getElementById('onboarding-checklist').innerHTML = steps.map(step => {
    const reward = ONBOARDING_REWARDS[step.id];
    const claimed = hasClaimedOnboardingReward(step.id);
    return `
      <div class="onboarding-item ${step.done ? 'done' : ''}">
        <span class="onboarding-mark">${step.done ? '✓' : '•'}</span>
        <div class="onboarding-copy">
          <span>${step.text}</span>
          ${reward ? `<span class="onboarding-reward ${claimed ? 'claimed' : ''}">${claimed ? 'Claimed' : reward.label}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  let tip = 'Clear a few tickets to get the queue moving.';
  let actionLabel = 'Resolve Some Tickets';
  let action = 'click';

  const recruitNeeded = recruitTarget ? Math.max(0, recruitTarget.cost - S.tickets) : Infinity;
  const upgradeNeeded = upgradeTarget ? Math.max(0, upgradeTarget.cost - S.tickets) : Infinity;
  const shouldPrioritizeUpgrade = !S.tutorialFirstUpgradeDone && !S.tutorialFirstRecruitDone && upgradeNeeded < recruitNeeded;

  if (allDone && !hasClaimedOnboardingReward('firstShiftComplete')) {
    tip = 'All first-shift objectives complete. Cash the completion bonus and enjoy your temporary delusion of competence.';
    actionLabel = 'Claim First Shift Bonus';
    action = 'claim-first-shift';
  } else if (!S.tutorialFirstClickDone) {
    tip = 'Mash Resolve Ticket a few times. Momentum first, dignity later.';
    actionLabel = 'Resolve Some Tickets';
    action = 'click';
  } else if (shouldPrioritizeUpgrade) {
    if (upgradeTarget) {
      tip = upgradeNeeded > 0
        ? `${upgradeTarget.upgrade.name} is the fastest power spike at ${fmt(upgradeTarget.cost)} tickets. Need ${fmt(upgradeNeeded)} more before you can stop brute-forcing the queue.`
        : `${upgradeTarget.upgrade.name} is affordable now. Open Upgrades and buy your first bit of process theater.`;
    } else {
      tip = 'Now buy one upgrade. Tools beat heroics, mostly.';
    }
    actionLabel = 'Open Upgrades';
    action = 'upgrades';
  } else if (!S.tutorialFirstRecruitDone) {
    if (recruitTarget) {
      tip = recruitNeeded > 0
        ? `${recruitTarget.hero.name} is your cheapest hire at ${fmt(recruitTarget.cost)} tickets. Need ${fmt(recruitNeeded)} more before delegation begins.`
        : `${recruitTarget.hero.name} is affordable now. Open Squad and stop doing all the work yourself.`;
    } else {
      tip = 'Your first recruit is the first taste of passive income. Open Squad and hire one.';
    }
    actionLabel = 'Open Squad';
    action = 'squad';
  } else if (!S.tutorialFirstUpgradeDone) {
    if (upgradeTarget) {
      tip = upgradeNeeded > 0
        ? `${upgradeTarget.upgrade.name} is the cheapest upgrade at ${fmt(upgradeTarget.cost)} tickets. Need ${fmt(upgradeNeeded)} more to start automating.`
        : `${upgradeTarget.upgrade.name} is affordable now. Open Upgrades and buy your first bit of process theater.`;
    } else {
      tip = 'Now buy one upgrade. Tools beat heroics, mostly.';
    }
    actionLabel = 'Open Upgrades';
    action = 'upgrades';
  } else if (activeIncident) {
    tip = `Incident live: ${activeIncident.title}. Hit respond now before HR turns this into a personality test.`;
    actionLabel = 'Respond Now';
    action = 'incident';
  } else {
    tip = 'Your last quick-start step is your first real incident. Review the incident rules now so you do not panic decoratively later.';
    actionLabel = 'Review Incident Rules';
    action = 'help';
  }

  document.getElementById('onboarding-tip').textContent = tip;
  const btn = document.getElementById('btn-onboarding-action');
  btn.textContent = actionLabel;
  btn.dataset.action = action;
}

function floatNumber(text, x, y) {
  const el = document.createElement('div');
  el.className = 'float-num';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.getElementById('float-layer').appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// ══════════════════════════════════════════════════════════════
// DERIVED STATS
// ══════════════════════════════════════════════════════════════
function calcPerClick() {
  if (S.clockedOut) return 0;
  const sm = S.skillMods;
  const am = S.achMods;
  const om = S.officeMods || {};
  const diff = getDifficulty();
  const restedBonus = Date.now() < (S.restedBuffUntil || 0) ? 1.15 : 1;
  const base = S.basePerClick + sm.perClick + am.perClick + (om.perClick || 0);
  const clickMult = 1 + sm.critChance + am.clickMult + (om.clickMult || 0);
  const global = (1 + dampenBonus(sm.globalMult + am.globalMult + (om.globalMult || 0))) * diff.incomeMultiplier * S.prestigeMultiplier * restedBonus;
  return Math.max(1, applySoftCap(base * clickMult * global, 120, 0.88));
}

function calcPerSec() {
  const sm = S.skillMods;
  const am = S.achMods;
  const om = S.officeMods || {};
  const diff = getDifficulty();
  const restedBonus = Date.now() < (S.restedBuffUntil || 0) ? 1.15 : 1;
  const offShiftPenalty = S.clockedOut ? 0.6 : 1;
  // Base from upgrades
  let upgradePs = UPGRADES.reduce((acc, u) => {
    const owned = S.upgradeOwned[u.id] || 0;
    return acc + (u.perSecBonus || 0) * owned;
  }, 0);
  // Squad contribution
  let squadPs = 0;
  HEROES.forEach(h => {
    const hs = S.heroState[h.id];
    if (!hs || !hs.owned) return;
    if (hs.status && hs.status !== 'Active') return; // Out on crisis
    const lvlMult = 1 + (hs.level - 1) * 0.25;
    const moralePenalty = hs.badHire ? 1 : (typeof hs.badHirePenalty === 'number' ? hs.badHirePenalty : 1);
    squadPs += h.baseCps * lvlMult * moralePenalty;
  });
  squadPs = applySoftCap(squadPs, 180, 0.82);
  upgradePs = applySoftCap(upgradePs, 180, 0.82);
  squadPs *= (1 + sm.squadMult + am.squadMult);

  const flat = sm.perSec + am.perSec + (om.perSec || 0);
  const psMult = 1 + sm.perSecMult;
  const squadBonus = 1 + dampenBonus(sm.squadMult + am.squadMult);
  const global = (1 + dampenBonus(sm.globalMult + am.globalMult + (om.globalMult || 0))) * diff.incomeMultiplier * S.prestigeMultiplier * restedBonus;
  return applySoftCap((upgradePs + squadPs + flat) * psMult * squadBonus * global * offShiftPenalty, 220, 0.8);
}

function calcXpGain(tickets) {
  const base = tickets * 0.1;
  const mult = 1 + S.skillMods.xpMult + (S.officeMods?.xpMult || 0);
  // Sam Voss xpBoost
  const samBoost = (S.heroState['sam'] && S.heroState['sam'].owned) ? 1.5 : 1;
  return base * mult * samBoost * (getDifficulty().xpMultiplier || 1);
}

// ══════════════════════════════════════════════════════════════
// CORE CLICK
// ══════════════════════════════════════════════════════════════
function handleClick(evt) {
  if (S.clockedOut) {
    toast('🕒 You are clocked out. Go home, you magnificent work goblin.', 'red');
    return;
  }
  const sm = S.skillMods;
  let amount = calcPerClick();
  S.totalClicks = (S.totalClicks || 0) + 1;

  if (!S.tutorialFirstClickDone) {
    S.tutorialFirstClickDone = true;
    toast('🧾 Queue open. Good. Now turn panic into throughput.', 'gold');
    claimOnboardingReward('firstClick');
    renderOnboarding();
  }

  // Critical click
  if (sm.critChance > 0 && Math.random() < sm.critChance) {
    amount *= sm.critMult;
    floatNumber(`💥 CRIT! +${fmt(amount)}`, evt.clientX, evt.clientY);
    SFX.crit();
  } else {
    floatNumber(`+${fmt(amount)}`, evt.clientX, evt.clientY);
    SFX.click();
  }

  // Combo
  S.combo = Math.min(S.combo + 1, 200);
  if (S.combo > S.maxCombo) S.maxCombo = S.combo;
  const comboMult = 1 + (S.combo - 1) * 0.02;
  amount *= comboMult;
  if (S.combo > 1 && S.combo % 10 === 0) SFX.comboMilestone();

  // Reset combo timer
  clearTimeout(S.comboTimer);
  const comboMs = 1500 * S.skillMods.comboTime;
  S.comboTimer = setTimeout(() => { S.combo = 0; updateComboUI(); }, comboMs);

  gainTickets(amount);
  gainXp(calcXpGain(amount));
  updateComboUI();

  // Visual feedback
  const btn = document.getElementById('main-clicker');
  btn.classList.remove('click-animate');
  void btn.offsetWidth;
  btn.classList.add('click-animate');
  btn.addEventListener('animationend', () => btn.classList.remove('click-animate'), { once: true });

  // Burst
  const burst = document.querySelector('.click-burst');
  burst.classList.remove('pop');
  void burst.offsetWidth;
  burst.classList.add('pop');
  burst.addEventListener('animationend', () => burst.classList.remove('pop'), { once: true });

  checkAchievements();
}

// ══════════════════════════════════════════════════════════════
// GAIN FUNCTIONS
// ══════════════════════════════════════════════════════════════
function gainTickets(amount) {
  S.tickets += amount;
  S.lifetimeTickets += amount;
  renderStats();
  updateButtonStates();
}

function updateButtonStates() {
  document.querySelectorAll('.upgrade-card').forEach(card => {
    const id = card.dataset.upgrade;
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return;
    const btn = card.querySelector('.btn-buy');
    if (btn) btn.disabled = S.tickets < upgradeCost(u);
  });
  document.querySelectorAll('.hero-card').forEach(card => {
    const id = card.dataset.hero;
    const h = HEROES.find(x => x.id === id);
    if (!h) return;
    const hs = S.heroState[id];
    if (hs && hs.owned) {
      const lvlUpCost = getHeroLevelCost(h, hs.level);
      const btn = card.querySelector('.btn-levelup');
      if (btn) btn.disabled = S.tickets < lvlUpCost;
      const fireBtn = card.querySelector('.btn-fire');
      if (fireBtn) {
        const ownedMs = Date.now() - (hs.ownedAt || Date.now());
        const canFire = ownedMs >= 120_000;
        const fireCost = getHeroFireCost(h, hs);
        fireBtn.textContent = canFire ? `Fire (${fmt(fireCost)} tickets)` : `Fire (${Math.ceil((120_000 - ownedMs) / 1000)}s)`;
        fireBtn.disabled = !canFire || S.tickets < fireCost;
      }
    } else {
      const btn = card.querySelector('.btn-recruit');
      if (btn) btn.disabled = S.tickets < getHeroRecruitCost(h);
    }
  });
}

function gainXp(amount) {
  S.xp += amount;
  while (S.xp >= S.xpRequired) {
    S.xp -= S.xpRequired;
    S.level++;
    S.skillPoints++;
    S.xpRequired = xpForLevel(S.level);
    onLevelUp();
  }
  renderXpBar();
}

function onLevelUp() {
  SFX.levelUp();
  const firstBigLevel = S.level === 2;
  toast(firstBigLevel ? '🎉 Level 2! Fine. You are now marginally employable. +1 Skill Point!' : `🎉 LEVEL UP! Now Level ${S.level}. +1 Skill Point!`, 'gold');
  const btn = document.getElementById('main-clicker');
  btn.classList.add('level-up-flash');
  btn.addEventListener('animationend', () => btn.classList.remove('level-up-flash'), { once: true });
  renderSkills();
  renderStats();
  checkAchievements();
}

// ══════════════════════════════════════════════════════════════
// TICK (Idle Income)
// ══════════════════════════════════════════════════════════════
let tickInterval = null;

function startTick() {
  tickInterval = setInterval(() => {
    applyBadHireMoraleDrain();
    const ps = calcPerSec();
    if (ps > 0) {
      const earned = ps / 10; // 100ms ticks
      gainTickets(earned);
      gainXp(calcXpGain(earned));
    }
    checkPromotionReady();
    checkAchievements();
    updateDay();
  }, 100);
}

function updateDay() {
  S.dayProgress += 1; // 100ms = 1 tick
  if (S.dayProgress >= 600) { // 60 seconds = 1 day
    S.dayProgress = 0;
    S.gameDay++;
    triggerDailyEvents();
    renderStats();
  }
}

function triggerDailyEvents() {
  const CRISIS_CHANCE = 0.05; // 5% chance per day someone has a crisis
  const statusOptions = [
    { name: 'Sick Kid', days: 3, msg: 'has a sick kid and is out for 3 days.' },
    { name: 'Vacation', days: 7, msg: 'is on vacation for a week!' },
    { name: 'Flu', days: 4, msg: 'caught the flu. Out for 4 days.' },
    { name: 'Family Crisis', days: 5, msg: 'has a family emergency. Out for 5 days.' },
    { name: 'Burnout', days: 2, msg: 'is feeling burnt out. Taking 2 mental health days.' },
  ];

  HEROES.forEach(h => {
    const hs = S.heroState[h.id];
    if (!hs || !hs.owned) return;

    // Handle existing absences
    if (hs.absenceDays > 0) {
      hs.absenceDays--;
      if (hs.absenceDays <= 0) {
        if (hs.status === 'Training' && hs.pendingSkill) {
          if (!h.skills) h.skills = [];
          h.skills.push(hs.pendingSkill);
          toast(`🎓 ${h.name} finished training: ${hs.pendingSkill}!`, 'gold');
          hs.pendingSkill = null;
        }
        hs.status = 'Active';
        hs.absenceDays = 0;
        toast(`✅ ${h.name} is back online!`, 'green');
        renderSquad();
      }
    }

    // Roll for new crisis if active
    if (hs.status === 'Active' && Math.random() < CRISIS_CHANCE) {
      const crisis = statusOptions[Math.floor(Math.random() * statusOptions.length)];
      hs.status = crisis.name;
      hs.absenceDays = crisis.days;
      toast(`🚨 ${h.name} ${crisis.msg}`, 'red');
      SFX.error();
      renderSquad();
    }

    // Boredom decay (if active but not worked)
    if (hs.status === 'Active') {
      hs.daysSinceLastTask = (hs.daysSinceLastTask || 0) + 1;
      if (hs.daysSinceLastTask > 5) {
        const boredomDecay = Math.floor(hs.daysSinceLastTask / 5);
        hs.morale = Math.max(0, hs.morale - boredomDecay);
        if (S.gameDay % 5 === 0 && hs.daysSinceLastTask > 10) {
          toast(`😴 ${h.name} is getting bored...`, 'red');
        }
      }
    }

    // Resignation check
    if (hs.morale < 25) {
      const RESIGN_CHANCE = 0.15; // 15% chance per day if very low morale
      if (Math.random() < RESIGN_CHANCE) {
        toast(`⚠️ ${h.name} has RESIGNED due to low morale!`, 'red');
        hs.owned = false;
        S.heroesOwned--;
        SFX.error();
        renderSquad();
        renderStats();
        return; // Next hero
      }
    }
  });
}

function startTraining(heroId) {
  const h = HEROES.find(x => x.id === heroId);
  const hs = S.heroState[heroId];
  if (!h || !hs) return;

  const cost = 2500 * (h.skills.length + 1); // Cost scales with skill count
  if (S.tickets < cost) {
    toast(`Not enough tickets for training! (${fmt(cost)}🎫)`, 'red');
    SFX.error();
    return;
  }

  S.tickets -= cost;
  hs.status = 'Training';
  hs.absenceDays = 3; // Training takes 3 days
  
  // Pick a new random skill from a global list if they don't have it
  const potentialSkills = ["Automation", "AI/ML", "Cloud Native", "Security Pro", "Diagnostics", "Process Optimization", "Documentation"];
  const newSkill = potentialSkills.find(s => !h.skills.includes(s));
  
  if (newSkill) {
    toast(`🎓 ${h.name} started training for: ${newSkill}!`, 'gold');
    // We'll actually add the skill once training finishes
    hs.pendingSkill = newSkill;
  } else {
    toast(`🎓 ${h.name} is staying sharp!`, 'gold');
  }

  renderSquad();
  renderStats();
  SFX.purchase();
}

// ══════════════════════════════════════════════════════════════
// UPGRADES
// ══════════════════════════════════════════════════════════════
function upgradeCost(upgrade) {
  const owned = S.upgradeOwned[upgrade.id] || 0;
  const difficulty = getDifficulty();
  return Math.max(1, Math.floor(upgrade.baseCost * Math.pow(upgrade.costScale, owned) * (difficulty.upgradeCostMultiplier || 1)));
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u) return;
  const cost = upgradeCost(u);
  if (S.tickets < cost) {
    const card = document.querySelector(`[data-upgrade="${id}"]`);
    if (card) { card.classList.remove('shake-animate'); void card.offsetWidth; card.classList.add('shake-animate'); }
    SFX.error();
    toast('Not enough tickets!', 'red');
    return;
  }
  S.tickets -= cost;
  S.upgradeOwned[u.id] = (S.upgradeOwned[u.id] || 0) + 1;
  S.upgradesPurchased++;
  if (u.perClickBonus) S.basePerClick += u.perClickBonus;
  SFX.purchase();
  toast(`✅ Purchased: ${u.name}`, 'green');
  if (!S.tutorialFirstUpgradeDone) {
    S.tutorialFirstUpgradeDone = true;
    toast('⚙️ First upgrade online. Congratulations, you have invented process.', 'gold');
    claimOnboardingReward('firstUpgrade');
    tryCompleteFirstShiftBonus();
    renderOnboarding();
  }
  renderUpgrades();
  renderStats();
  checkAchievements();
}

// ══════════════════════════════════════════════════════════════
// SQUAD / HEROES
// ══════════════════════════════════════════════════════════════
function recruitHero(id) {
  const h = HEROES.find(x => x.id === id);
  if (!h) return;
  const recruitCost = getHeroRecruitCost(h);
  const meta = (S.recruitCandidateMeta && S.recruitCandidateMeta[id]) || {};
  if (S.tickets < recruitCost) {
    SFX.error();
    toast('Not enough tickets to recruit!', 'red');
    return;
  }
  S.tickets -= recruitCost;
  const now = Date.now();
  S.heroState[id] = {
    owned: true,
    level: 1,
    xp: 0,
    status: 'Active',
    morale: 100,
    absenceDays: 0,
    badHire: !!meta.badHire,
    badHireFailChance: meta.badHire ? (meta.badHireFailChance || (0.4 + Math.random() * 0.2)) : 0,
    badHireClue: meta.badHireClue || '',
    ownedAt: now,
    discoveredAt: now,
    badHirePenalty: 1,
    badHireHintLevel: 0,
  };
  S.applicantPool = S.applicantPool.filter(appId => appId !== id);
  S.heroesOwned++;
  SFX.recruit();
  toast(`🦸 ${h.name} joined your squad!`, meta.badHire ? 'red' : 'gold');
  if (!S.tutorialFirstRecruitDone) {
    S.tutorialFirstRecruitDone = true;
    toast('👥 First hire secured. Delegation: the first step toward management and plausible deniability.', 'gold');
    claimOnboardingReward('firstRecruit');
    tryCompleteFirstShiftBonus();
    renderOnboarding();
  }
  renderSquad();
  renderStats();
  checkAchievements();
}

function refreshJobBoard(cost = 0) {
  if (cost > 0 && S.tickets < cost) {
    SFX.error();
    toast('Not enough tickets to refresh the board!', 'red');
    return;
  }
  if (cost > 0) S.tickets -= cost;
  
  // Find all heroes we don't own yet
  const unowned = HEROES.filter(h => !(S.heroState[h.id] && S.heroState[h.id].owned));
  
  // If we own everyone, don't crash
  if (unowned.length === 0) {
    S.applicantPool = [];
    if (cost > 0) toast('There is no one left to hire!', 'gold');
    renderSquad();
    return;
  }
  
  // Pick up to 4 random heroes
  const poolSize = Math.min(4, unowned.length);
  S.applicantPool = [];
  S.recruitCandidateMeta = S.recruitCandidateMeta || {};
  const shuffled = [...unowned].sort(() => 0.5 - Math.random());
  const now = Date.now();
  const selected = [];
  for (let i = 0; i < poolSize; i++) {
    const id = shuffled[i].id;
    selected.push(id);
    S.applicantPool.push(id);
    S.recruitCandidateMeta[id] = {
      ...(S.recruitCandidateMeta[id] || {}),
      badHire: false,
      discoveredAt: now,
      badHireClue: S.recruitCandidateMeta[id]?.badHireClue || '',
    };
  }

  if (selected.length > 0 && Math.random() < (getDifficulty().badHireChance || 0.12)) {
    const badIdx = Math.floor(Math.random() * selected.length);
    const badId = selected[badIdx];
    const clues = [
      'Keeps saying synergy.',
      'Reply-all specialist.',
      'Has a blockchain solution for everything.',
      'Brings charts to simple outages.',
    ];
    const badMeta = S.recruitCandidateMeta[badId];
    badMeta.badHire = true;
    badMeta.discoveredAt = now;
    badMeta.badHireFailChance = 0.4 + Math.random() * 0.2;
    badMeta.badHireClue = clues[Math.floor(Math.random() * clues.length)];
  }
  
  if (cost > 0) {
    SFX.purchase();
    toast('Job board refreshed!', 'green');
    renderStats();
  }
  renderSquad();
}

function levelUpHero(id) {
  const h = HEROES.find(x => x.id === id);
  const hs = S.heroState[id];
  if (!h || !hs) return;
  const cost = getHeroLevelCost(h, hs.level);
  if (S.tickets < cost) {
    toast('Not enough tickets to level up!', 'red');
    return;
  }
  S.tickets -= cost;
  hs.level++;
  toast(`⬆️ ${h.name} is now Level ${hs.level}!`, 'green');
  renderSquad();
  renderStats();
}

function fireHero(id) {
  const h = HEROES.find(x => x.id === id);
  if (!h) return;
  const hs = S.heroState[id];
  if (!hs || !hs.owned) return;
  if (!hs.badHire) {
    toast(`🧊 ${h.name} is a reliable hire. No reason to fire them.`, 'green');
    return;
  }

  const ownedMs = Date.now() - (hs.ownedAt || Date.now());
  if (ownedMs < 120_000) {
    toast(`🕒 ${h.name} is on the clock. Fire option unlocks after 2 minutes.`, 'red');
    return;
  }

  const cost = getHeroFireCost(h, hs);
  if (S.tickets < cost) {
    toast(`Not enough tickets to fire ${h.name}!`, 'red');
    SFX.error();
    return;
  }

  S.tickets -= cost;
  delete S.heroState[id];
  S.heroesOwned--;
  SFX.purchase();
  toast(`🧯 ${h.name} removed from your roster.`, 'green');
  renderSquad();
  renderStats();
}

// ══════════════════════════════════════════════════════════════
// SKILLS
// ══════════════════════════════════════════════════════════════
function buySkill(id) {
  const skill = SKILLS.find(s => s.id === id);
  if (!skill) return;
  if (S.unlockedSkills.includes(id)) { toast('Already unlocked!'); return; }
  const prereqsMet = skill.requires.every(r => S.unlockedSkills.includes(r));
  if (!prereqsMet) { SFX.error(); toast('Unlock prerequisites first!', 'red'); return; }
  if (S.skillPoints < skill.cost) { SFX.error(); toast('Not enough Skill Points!', 'red'); return; }
  S.skillPoints -= skill.cost;
  S.unlockedSkills.push(id);
  applySkillEffect(skill);
  SFX.skillUnlock();
  toast(`🧠 Skill Unlocked: ${skill.name}!`, 'gold');
  const node = document.querySelector(`[data-skill="${id}"]`);
  if (node) {
    node.classList.add('skill-unlock-ripple');
    node.addEventListener('animationend', () => node.classList.remove('skill-unlock-ripple'), { once: true });
  }
  renderSkills();
  renderStats();
}

function applySkillEffect(skill) {
  const e = skill.effect;
  const sm = S.skillMods;
  if (e.perClick)    sm.perClick    += e.perClick;
  if (e.perSec)      sm.perSec      += e.perSec;
  if (e.perSecMult)  sm.perSecMult  += e.perSecMult;
  if (e.xpMult)      sm.xpMult      += e.xpMult;
  if (e.comboTime)   sm.comboTime   = sm.comboTime * e.comboTime;
  if (e.critChance)  sm.critChance  += e.critChance;
  if (e.critMult)    sm.critMult     = e.critMult;
  if (e.squadMult)   sm.squadMult   += e.squadMult;
  if (e.offlineHours)sm.offlineHours = e.offlineHours;
  if (e.prestigeMult)sm.prestigeMult = sm.prestigeMult * e.prestigeMult;
  if (e.globalMult)  sm.globalMult  += e.globalMult;
}

function reapplyAllSkills() {
  S.skillMods = {
    perClick: 0, perSec: 0, perSecMult: 0, xpMult: 0,
    comboTime: 1.0, critChance: 0, critMult: 1,
    squadMult: 0, offlineHours: 4, prestigeMult: 1.0, globalMult: 1.0,
  };
  S.unlockedSkills.forEach(id => {
    const sk = SKILLS.find(s => s.id === id);
    if (sk) applySkillEffect(sk);
  });
}

// ══════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ══════════════════════════════════════════════════════════════
function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (S.achievedIds.includes(a.id)) return;
    let current = 0;
    if (a.stat === 'lifetime')  current = S.lifetimeTickets;
    if (a.stat === 'heroes')    current = S.heroesOwned;
    if (a.stat === 'upgrades')  current = S.upgradesPurchased;
    if (a.stat === 'incidents') current = S.incidentsResolved;
    if (a.stat === 'dispatches') current = S.dispatches;
    if (a.stat === 'maxCombo')  current = S.maxCombo;
    if (a.stat === 'prestiges') current = S.prestiges;
    if (a.stat === 'level')     current = S.level;
    if (current >= a.goal) {
      S.achievedIds.push(a.id);
      applyAchievementBonus(a);
      SFX.achievement();
      toast(`🏅 Achievement Unlocked: ${a.name}! (${a.reward})`, 'gold');
      const card = document.querySelector(`[data-achievement="${a.id}"]`);
      if (card) { card.classList.add('achieved', 'ach-unlock-flash'); }
    }
    updateAchievementProgress(a, current);
  });
  document.getElementById('skill-points-label').textContent = `${S.skillPoints} SP available`;
}

function applyAchievementBonus(a) {
  const b = a.bonus;
  const am = S.achMods;
  if (b.perClick)    am.perClick    += b.perClick;
  if (b.perSec)      am.perSec      += b.perSec;
  if (b.clickMult)   am.clickMult   += b.clickMult;
  if (b.globalMult)  am.globalMult  += b.globalMult;
  if (b.squadMult)   am.squadMult   += b.squadMult;
  if (b.prestigeMult)am.prestigeMult+= b.prestigeMult;
  if (b.skillPoints) { S.skillPoints += b.skillPoints; }
}

function reapplyAllAchievements() {
  S.achMods = { perClick:0, perSec:0, clickMult:0, globalMult:0, squadMult:0, prestigeMult:0, skillPoints:0 };
  S.achievedIds.forEach(id => {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a) applyAchievementBonus(a);
  });
}

// ══════════════════════════════════════════════════════════════
// CAREER / PRESTIGE
// ══════════════════════════════════════════════════════════════
function checkPromotionReady() {
  const nextTier = CAREER[S.careerTier + 1];
  const panel = document.getElementById('promotion-panel');
  const titleEl = document.getElementById('promo-title');
  const descEl = document.getElementById('promo-description');
  const btnEl = document.getElementById('btn-promote');
  if (!nextTier) {
    panel.classList.add('hidden');
    return;
  }
  const req = getCareerRequirement(nextTier);
  const progress = req > 0 ? (S.lifetimeTickets / req) : 0;
  const remainingOfficePerks = getRemainingOfficePerks();
  const officeHint = remainingOfficePerks.length
    ? ` Office interlude still has ${remainingOfficePerks.length} permanent upgrade${remainingOfficePerks.length === 1 ? '' : 's'} left.`
    : ' Office interlude pool is exhausted, so this one is pure prestige.';
  if (S.lifetimeTickets >= req) {
    panel.classList.remove('hidden');
    titleEl.textContent = '🚀 Promotion Ready!';
    descEl.textContent = `You survived long enough to be rewarded with more responsibility. Promote to ${nextTier.icon} ${nextTier.title} for a permanent ×${nextTier.prestigeBonus.toFixed(2)} bonus. Reset: current tickets, upgrades, level, strikes. Keep: squad, skills, achievements, office perks.${officeHint}`;
    btnEl.textContent = `Accept Promotion to ${nextTier.title}`;
    btnEl.disabled = false;
  } else if (progress >= 0.72) {
    panel.classList.remove('hidden');
    titleEl.textContent = '👀 Promotion Track';
    descEl.textContent = `${fmt(req - S.lifetimeTickets)} tickets until ${nextTier.icon} ${nextTier.title}. Permanent bonus waiting: ×${nextTier.prestigeBonus.toFixed(2)}.${officeHint}`;
    btnEl.textContent = 'Not Quite There Yet';
    btnEl.disabled = true;
  } else {
    panel.classList.add('hidden');
    btnEl.disabled = false;
  }
}

function renderOfficeInterlude() {
  const modal = document.getElementById('office-interlude-modal');
  const list = document.getElementById('office-choice-list');
  if (!modal || !list) return;

  const picks = (S.officeDraftChoices || []).length ? S.officeDraftChoices : rollOfficeDraftChoices();
  if (!picks.length) {
    modal.classList.add('hidden');
    return;
  }

  list.innerHTML = picks.map(id => {
    const perk = OFFICE_UPGRADES.find(x => x.id === id);
    if (!perk) return '';
    return `
      <button class="office-choice-card" data-office-perk="${perk.id}">
        <span class="office-choice-icon">${perk.icon}</span>
        <div class="office-choice-content">
          <strong>${perk.name}</strong>
          <span>${perk.desc}</span>
          <small>${perk.effectText}</small>
        </div>
      </button>
    `;
  }).join('');

  list.querySelectorAll('[data-office-perk]').forEach(btn => {
    btn.addEventListener('click', () => chooseOfficePerk(btn.dataset.officePerk));
  });

  modal.classList.remove('hidden');
}

function chooseOfficePerk(perkId) {
  if ((S.officePerksChosen || []).includes(perkId)) return;
  const perk = OFFICE_UPGRADES.find(x => x.id === perkId);
  if (!perk) return;

  S.officePerksChosen = [...(S.officePerksChosen || []), perkId];
  S.officeDraftChoices = [];
  recalcOfficeMods();
  document.getElementById('office-interlude-modal').classList.add('hidden');
  toast(`${perk.icon} Office upgrade secured: ${perk.name}. ${perk.effectText}`, 'gold');
  renderAll();
}

function doPromotion() {
  const nextTier = CAREER[S.careerTier + 1];
  if (!nextTier) return;
  S.careerTier++;
  S.prestiges++;
  S.prestigeMultiplier = nextTier.prestigeBonus * (1 + S.achMods.prestigeMult + S.skillMods.prestigeMult - 1);
  S.strikes = 0;
  // Soft reset
  S.tickets = 0;
  S.lifetimeTickets = 0;
  S.xp = 0;
  S.level = 1;
  S.skillPoints = Math.floor(S.prestiges * 2);
  S.xpRequired = xpForLevel(1);
  S.upgradeOwned = {};
  S.basePerClick = 1;
  S.basePerSec = 0;
  reapplyAllSkills();
  reapplyAllAchievements();
  recalcOfficeMods();
  SFX.promotion();
  toast(`🚀 PROMOTED to ${nextTier.icon} ${nextTier.title}! Bonus: ×${nextTier.prestigeBonus}`, 'gold');
  toast(`📣 New title, same chaos. Enjoy your fresh badge and expanded blast radius.`, 'gold');
  if (S.careerTier === CAREER.length - 1) {
    toast('🏆 YOU ARE THE CIO! The ultimate achievement unlocked!', 'gold');
  }
  document.getElementById('promotion-panel').classList.add('hidden');
  if ((S.officePerksChosen || []).length < OFFICE_UPGRADES.length) {
    rollOfficeDraftChoices();
    renderOfficeInterlude();
  }
  renderAll();
}

function addStrike() {
  S.strikes = (S.strikes || 0) + 1;
  renderStats();
  if (S.strikes >= 3) {
    firePlayer();
  } else {
    toast(`⚠️ STRIKE ${S.strikes} / 3! Handle incidents or get fired!`, 'red');
    SFX.error();
  }
}

function firePlayer() {
  S.strikes = 0;
  S.tickets = 0;
  S.lifetimeTickets = 0;
  S.xp = 0;
  S.level = 1;
  S.careerTier = 0;
  S.skillPoints = Math.floor(S.prestiges * 2);
  S.xpRequired = xpForLevel(1);
  S.upgradeOwned = {};
  S.heroState = {};
  S.basePerClick = 1;
  S.basePerSec = 0;
  reapplyAllSkills();
  reapplyAllAchievements();
  SFX.error();
  document.getElementById('fired-modal').classList.remove('hidden');
  renderAll();
}

// ══════════════════════════════════════════════════════════════
// INCIDENTS + DISPATCH SYSTEM
// ══════════════════════════════════════════════════════════════
let activeIncident = null;
let incidentCountdown = null;

function getIncidentSeverity(inc) {
  if ((inc.rewardMult || 0) >= 4 || (inc.timeLimit || 999) <= 12) return { label: 'SEV-1', risk: 'Ignore this and you are asking for a strike.' };
  if ((inc.rewardMult || 0) >= 2.5 || (inc.timeLimit || 999) <= 18) return { label: 'SEV-2', risk: 'High-pressure issue. Respond fast for the juicy reward.' };
  return { label: 'SEV-3', risk: 'Manageable mess. Still not something to leave burning.' };
}

function getIncidentCommentary(inc) {
  const pool = {
    critical: [
      'The executive chain is already forming an opinion and it is a bad one.',
      'Somewhere, a VP has started typing in all caps.',
      'This is the sort of outage that creates meetings for years.'
    ],
    security: [
      'Security would like to remind everyone they warned about this exact thing.',
      'Someone just said “containment” and the room got very quiet.',
      'This one ends with either heroics or mandatory training.'
    ],
    database: [
      'Finance can smell this problem from three floors away.',
      'The database team is preparing a sermon on index hygiene.',
      'If this goes badly, somebody is blaming the migration notes.'
    ],
    network: [
      'Packets are fleeing the scene in terror.',
      'Networking insists it is DNS until proven otherwise.',
      'Several conference rooms are now spiritually disconnected.'
    ],
    devops: [
      'A dashboard somewhere just became performance art.',
      'This smells like automation with too much confidence.',
      'There are far too many graphs involved in this disaster.'
    ],
    cloud: [
      'The cloud remains someone else’s computer and somehow still your problem.',
      'A finance analyst just refreshed the billing page and screamed softly.',
      'Elastic scale has become elastic regret.'
    ],
    clerical: [
      'This is petty, stupid, and somehow still career-limiting.',
      'The queue has achieved sentience and it resents you personally.',
      'Perfect. A low-glamour catastrophe.'
    ],
  };
  const arr = pool[inc.category] || pool.clerical;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getIncidentBestResponder(incident) {
  const ownedHeroes = HEROES.filter(h => S.heroState[h.id]?.owned);
  if (!ownedHeroes.length) return null;

  return ownedHeroes
    .map(hero => getDispatchCardData(hero, incident))
    .sort((a, b) => b.score - a.score)[0] || null;
}

function renderIncidentBannerDetails(incident, previewReward, sev) {
  const severityEl = document.getElementById('incident-severity');
  const timerEl = document.getElementById('incident-timer');
  const skillsEl = document.getElementById('incident-skill-chips');
  const bestEl = document.getElementById('incident-best-response');
  const bestResponder = getIncidentBestResponder(incident);
  const skillChips = (incident.requiredSkills || []).length
    ? [
        '<span class="incident-skill-chip label">Needed</span>',
        ...(incident.requiredSkills || []).map(skill => `<span class="incident-skill-chip">${skill}</span>`)
      ]
    : ['<span class="incident-skill-chip">Any competent gremlin can take this one.</span>'];

  severityEl.classList.remove('sev-1', 'sev-2', 'sev-3');
  severityEl.classList.add(sev.label.toLowerCase());
  timerEl.classList.toggle('urgent', (incident.timeLeft || 0) <= 10);
  skillsEl.innerHTML = skillChips.join('');

  if (!bestResponder) {
    bestEl.textContent = `Best response: solo panic mode. No squad yet. Reward preview still sits around ~${fmt(previewReward)} tickets if you can brute-force it.`;
    return;
  }

  if (!bestResponder.isActive) {
    bestEl.textContent = `Best response: ${bestResponder.hero.emoji} ${bestResponder.hero.name}, but they are ${bestResponder.hs.status.toLowerCase()}. You may need to handle this yourself.`;
    return;
  }

  bestEl.textContent = `Best available responder: ${bestResponder.hero.emoji} ${bestResponder.hero.name} • ${bestResponder.match.label.replace(/^[^ ]+\s*/, '')} • ~${fmt(bestResponder.projectedReward)} tickets.`;
}

function triggerIncident() {
  if (activeIncident) return;
  if (S.clockedOut) return;
  if (Date.now() < (S.shiftGraceUntil || 0)) return;
  const inc = INCIDENTS[Math.floor(Math.random() * INCIDENTS.length)];
  activeIncident = { ...inc, timeLeft: inc.timeLimit };
  const banner = document.getElementById('incident-banner');
  const sev = getIncidentSeverity(inc);
  const previewReward = Math.max(Math.floor(calcPerSec() * inc.rewardMult * 10 * getIncidentRewardMultiplier()), 500);
  const commentary = getIncidentCommentary(inc);
  document.getElementById('incident-icon').textContent = inc.icon;
  document.getElementById('incident-severity').textContent = sev.label;
  document.getElementById('incident-title').textContent = inc.title;
  document.getElementById('incident-text').textContent  = `${inc.text} ${commentary}`;
  document.getElementById('incident-meta').textContent = `${sev.risk} Reward preview: ~${fmt(previewReward)} tickets.`;
  document.getElementById('incident-timer').textContent = `${inc.timeLimit}s`;
  renderIncidentBannerDetails(activeIncident, previewReward, sev);
  banner.classList.remove('hidden');
  SFX.incident();
  if (!S.tutorialFirstIncidentSeen) {
    S.tutorialFirstIncidentSeen = true;
    toast('🚨 First incident! Move now or let HR start a scrapbook.', 'red');
    renderOnboarding();
  }
  incidentCountdown = setInterval(() => {
    if (!activeIncident) { clearInterval(incidentCountdown); return; }
    activeIncident.timeLeft--;
    document.getElementById('incident-timer').textContent = `${activeIncident.timeLeft}s`;
    document.getElementById('incident-timer').classList.toggle('urgent', activeIncident.timeLeft <= 10);
    const cn = document.getElementById('dispatch-countdown-num');
    if (cn) cn.textContent = activeIncident.timeLeft;
    if (activeIncident.timeLeft <= 0) dismissIncident(false);
  }, 1000);
}

function dismissIncident(resolved, silently = false) {
  clearInterval(incidentCountdown);
  document.getElementById('incident-banner').classList.add('hidden');
  closeDispatchModal();
  if (!resolved && !silently && activeIncident) {
    logIncidentEvent(activeIncident, 'missed', {
      note: 'Timer expired before the team responded.',
    });
    toast('⚠️ Incident abandoned! That is a strike!', 'red');
    addStrike();
    renderStatsTab();
  } else if (!resolved && silently && activeIncident) {
    logIncidentEvent(activeIncident, 'deferred', {
      note: 'Deferred while clocking out or changing flow.',
    });
    renderStatsTab();
  }
  activeIncident = null;

  // Roll for strike recovery after each incident cycle
  rollStrikeRecovery();
}

// ── Dispatch Modal ──────────────────────────────────────────
function calcSkillMatch(hero, incident) {
  const reqSkills = incident.requiredSkills || [];
  if (reqSkills.length === 0) return { label: '✅ All Capable', cls: 'all', mult: 1.5 };
  const matches = (hero.skills || []).filter(s => reqSkills.includes(s)).length;
  if (matches >= 2) return { label: '🎯 Perfect Match', cls: 'perfect', mult: 3.0 };
  if (matches === 1) return { label: '👍 Good Match',   cls: 'good',    mult: 2.0 };
  return                     { label: '⚠️ Out of Element', cls: 'weak', mult: 0.6 };
}

function getDispatchCardData(hero, incident) {
  const hs = S.heroState[hero.id] || { status: 'Active', morale: 100, level: 1 };
  const match = calcSkillMatch(hero, incident);
  const isActive = hs.status === 'Active';
  const rewardBase = Math.max(calcPerSec() * incident.rewardMult * 10 * getIncidentRewardMultiplier(), 500);
  const projectedReward = Math.floor(rewardBase * match.mult);
  const morale = hs.morale ?? 100;
  const level = hs.level ?? 1;
  const score = (isActive ? 1000 : 0) + (match.mult * 100) + (level * 6) + (morale * 0.4) + ((hero.baseCps || 0) * 5);

  return {
    hero,
    hs,
    match,
    isActive,
    projectedReward,
    score,
    recommendation: isActive
      ? `${hero.emoji} ${hero.name} is your best available ${match.label.replace(/^[^ ]+\s*/, '').toLowerCase()} for ~${fmt(projectedReward)} tickets.`
      : `${hero.emoji} ${hero.name} would be ideal, but they are currently ${hs.status.toLowerCase()}.`
  };
}

function renderDispatchBriefing(incident, heroCards) {
  const sev = getIncidentSeverity(incident);
  const chipsEl = document.getElementById('dispatch-briefing-chips');
  const recommendationEl = document.getElementById('dispatch-recommendation-text');
  const previewReward = Math.max(Math.floor(calcPerSec() * incident.rewardMult * 10 * getIncidentRewardMultiplier()), 500);
  const timePressure = incident.timeLeft <= 10 ? 'Immediate' : incident.timeLeft <= 18 ? 'High' : 'Manageable';

  chipsEl.innerHTML = [
    `<span class="dispatch-chip severity-${sev.label.toLowerCase()}">${sev.label}</span>`,
    `<span class="dispatch-chip">⏱️ ${incident.timeLeft}s to contain</span>`,
    `<span class="dispatch-chip">🔥 ${timePressure} pressure</span>`,
    `<span class="dispatch-chip">💰 ~${fmt(previewReward)} base reward</span>`
  ].join('');

  const bestAvailable = heroCards.find(card => card.isActive);
  if (bestAvailable) {
    recommendationEl.textContent = bestAvailable.recommendation;
  } else if (heroCards.length) {
    recommendationEl.textContent = 'Your squad is unavailable. Handle this yourself before HR turns the postmortem into performance art.';
  } else {
    recommendationEl.textContent = 'No squad yet. This is a solo panic attack. Hit Handle Myself and go earn your paycheck.';
  }
}

function openDispatchModal() {
  if (!activeIncident) {
    toast('No active incident. A rare moment of peace.', 'green');
    return;
  }
  const inc = activeIncident;

  // Populate header
  document.getElementById('dispatch-inc-icon').textContent  = inc.icon;
  document.getElementById('dispatch-inc-title').textContent = inc.title;
  document.getElementById('dispatch-inc-text').textContent  = inc.text;
  document.getElementById('dispatch-countdown-num').textContent = inc.timeLeft;

  // Required skills
  const reqEl = document.getElementById('dispatch-required-skills');
  reqEl.innerHTML = (inc.requiredSkills || []).length
    ? (inc.requiredSkills).map(s => `<span class="skill-badge match">${s}</span>`).join('')
    : '<span style="color:var(--text-muted);font-size:0.8rem">Any hero can handle this</span>';

  // Hero list
  const heroListEl = document.getElementById('dispatch-hero-list');
  heroListEl.innerHTML = '';
  const ownedHeroes = HEROES.filter(h => S.heroState[h.id]?.owned);
  const heroCards = ownedHeroes
    .map(hero => getDispatchCardData(hero, inc))
    .sort((a, b) => b.score - a.score);

  renderDispatchBriefing(inc, heroCards);

  if (ownedHeroes.length === 0) {
    heroListEl.innerHTML = '<div class="dispatch-no-heroes">No heroes recruited yet — handle it yourself or recruit from the Squad tab first!</div>';
  } else {
    heroCards.forEach((card, index) => {
      try {
        const { hero, hs, match, isActive, projectedReward } = card;
        const item = document.createElement('div');
        item.className = `dispatch-hero-item ${!isActive ? 'disabled' : ''}${index === 0 ? ' recommended' : ''}`;
        const skillBadges = (hero.skills || []).map(s => {
          const isMatch = (inc.requiredSkills || []).includes(s);
          return `<span class="skill-badge${isMatch ? ' match' : ''}">${s}</span>`;
        }).join('');
        const statusText = !isActive ? `<span class="dispatch-status-out">${hs.status}</span>` : '';
        const recommendationBadge = index === 0 ? '<span class="dispatch-recommended-badge">TOP PICK</span>' : '';
        const detailText = isActive
          ? `Projected reward: ~${fmt(projectedReward)} tickets • Morale ${hs.morale ?? 100}%`
          : `Unavailable right now • Morale ${hs.morale ?? 100}%`;

        item.innerHTML = `
          <span class="dispatch-hero-emoji">${hero.emoji}</span>
          <div class="dispatch-hero-info">
            <div class="dispatch-hero-name">${hero.name} ${statusText} ${recommendationBadge}</div>
            <div class="dispatch-hero-role">${hero.role}</div>
            <div class="dispatch-skills-row">${skillBadges}</div>
            <div class="dispatch-hero-detail">${detailText}</div>
          </div>
          <div class="dispatch-match-label ${match.cls}">${match.label}</div>
          <button class="btn-dispatch-hero" data-hero="${hero.id}" ${!isActive ? 'disabled' : ''}>
            ${!isActive ? 'Out' : 'Dispatch'}
          </button>
        `;
        if (isActive) {
          item.querySelector('.btn-dispatch-hero').addEventListener('click', () => dispatchHeroToIncident(hero.id));
        }
        heroListEl.appendChild(item);
      } catch (err) {
        console.error('dispatch hero render failed', card?.hero?.id, err);
      }
    });
  }

  document.getElementById('dispatch-modal').classList.remove('hidden');
}

function closeDispatchModal() {
  document.getElementById('dispatch-modal').classList.add('hidden');
}

function dispatchHeroToIncident(heroId) {
  if (!activeIncident) return;
  const inc   = activeIncident;
  const hero  = HEROES.find(h => h.id === heroId);
  if (!hero) return;

  const match      = calcSkillMatch(hero, inc);
  const rewardBase = Math.max(calcPerSec() * inc.rewardMult * 10 * getIncidentRewardMultiplier(), 500);
  const reward     = Math.floor(rewardBase * match.mult);

  dismissIncident(false, true); // clears banner/modal/timer safely
  S.dispatches++;
  
  // Impact morale and track activity
  const hs = S.heroState[heroId];
  hs.daysSinceLastTask = 0; // Reset boredom

  if (match.cls === 'weak') {
    hs.morale = Math.max(0, (hs.morale || 100) - 15);
    toast(`📉 ${hero.name} is frustrated by the unsuitable task!`, 'red');
  } else {
    hs.morale = Math.min(100, (hs.morale || 100) + 5);
  }

  toast(`📡 ${hero.emoji} ${hero.name} dispatched! Resolving...`, 'gold');

  const resolveTime = 2000 + Math.random() * 2000;
  setTimeout(() => {
    gainTickets(reward);
    gainXp(calcXpGain(reward));
    S.incidentsResolved++;
    logIncidentEvent(inc, 'resolved_dispatch', {
      reward,
      responder: hero.name,
      responderType: 'hero',
      matchLabel: match.label,
      note: `${hero.name} handled the escalation with ${match.label.replace(/^[^ ]+\s*/, '').toLowerCase()}.`,
    });
    if (!S.tutorialFirstIncidentResolved) {
      S.tutorialFirstIncidentResolved = true;
      toast('🛡️ Incident contained. Excellent. Pretend this level of competence is sustainable.', 'gold');
      claimOnboardingReward('firstIncidentResolved');
      tryCompleteFirstShiftBonus();
      renderOnboarding();
    }
    toast(`✅ ${hero.name}: ${match.label} — +${fmt(reward)} tickets!`, 'green');
    renderStatsTab();
    checkAchievements();
  }, resolveTime);
}

// ── Handle Myself → Minigame ───────────────────────────────────
let mgState = null;

function handleSelf() {
  if (!activeIncident) return;
  closeDispatchModal();
  openMinigame(activeIncident);
}

function openMinigame(inc) {
  // Dismiss banner & pause incident timer — keep activeIncident for reward
  clearInterval(incidentCountdown);
  document.getElementById('incident-banner').classList.add('hidden');

  const clicksNeeded = Math.max(15, Math.min(40, Math.round(inc.rewardMult * 3.5)));
  const timeLimit    = Math.min(inc.timeLeft, 15);
  const baseReward   = Math.max(calcPerSec() * inc.rewardMult * 6 * getIncidentRewardMultiplier(), 300);

  mgState = { inc, clicksNeeded, timeLimit, timeLeft: timeLimit,
              clicksMade: 0, progress: 0, baseReward, done: false, timer: null };

  // Populate
  document.getElementById('minigame-icon').textContent    = inc.icon;
  document.getElementById('minigame-title').textContent   = inc.title;
  document.getElementById('minigame-subtitle').textContent =
    `Mash to resolve — need ${clicksNeeded} clicks before time runs out!`;
  document.getElementById('minigame-timer').textContent   = `${timeLimit}s`;
  document.getElementById('minigame-bar').style.width     = '0%';
  document.getElementById('minigame-bar-label').textContent = '0%';
  document.getElementById('minigame-click-counter').innerHTML =
    `Clicks: <strong>0 / ${clicksNeeded}</strong>`;
  document.getElementById('minigame-reward-preview').innerHTML =
    `Reward: <strong>${fmt(Math.floor(baseReward * 0.5))}–${fmt(Math.floor(baseReward * 2))} tickets</strong>`;
  document.getElementById('btn-minigame-resolve').classList.add('hidden');
  document.getElementById('minigame-active').classList.remove('hidden');
  document.getElementById('minigame-result').classList.add('hidden');
  document.getElementById('minigame-panel').classList.remove('urgent');
  document.getElementById('minigame-timer').classList.remove('urgent');
  document.getElementById('btn-minigame-click').classList.remove('urgent');
  document.getElementById('minigame-bar').classList.remove('urgent');
  document.getElementById('minigame-modal').classList.remove('hidden');

  mgState.timer = setInterval(() => {
    if (mgState.done) return;
    mgState.timeLeft--;
    document.getElementById('minigame-timer').textContent = `${mgState.timeLeft}s`;
    if (mgState.timeLeft <= 5) {
      document.getElementById('minigame-panel').classList.add('urgent');
      document.getElementById('minigame-timer').classList.add('urgent');
      document.getElementById('btn-minigame-click').classList.add('urgent');
      document.getElementById('minigame-bar').classList.add('urgent');
    }
    if (mgState.timeLeft <= 0) endMinigame(false);
  }, 1000);
}

function onMinigameClick() {
  if (!mgState || mgState.done) return;
  mgState.clicksMade++;
  mgState.progress = Math.min(mgState.clicksMade / mgState.clicksNeeded, 1);
  SFX.minigameClick();
  const pct = Math.round(mgState.progress * 100);
  document.getElementById('minigame-bar').style.width     = pct + '%';
  document.getElementById('minigame-bar-label').textContent = pct + '%';
  document.getElementById('minigame-click-counter').innerHTML =
    `Clicks: <strong>${mgState.clicksMade} / ${mgState.clicksNeeded}</strong>`;
  const previewReward = Math.floor(mgState.baseReward * (0.5 + mgState.progress * 1.5));
  document.getElementById('minigame-reward-preview').innerHTML =
    `Current Reward: <strong>${fmt(previewReward)} tickets</strong>`;
  if (mgState.progress >= 1) {
    // Do not reveal a new clickable reward button under the player's cursor.
    // High-speed clicking was causing accidental follow-up clicks in the same spot.
    endMinigame(true);
  }
}

function endMinigame(success) {
  if (!mgState) return;
  mgState.done = true;
  clearInterval(mgState.timer);
  const mult   = success ? (0.5 + mgState.progress * 1.8) : (mgState.progress * 0.5);
  const reward = Math.max(Math.floor(mgState.baseReward * mult), success ? 50 : 0);

  document.getElementById('minigame-active').classList.add('hidden');
  document.getElementById('minigame-result').classList.remove('hidden');
  const titleEl = document.getElementById('minigame-result-title');
  const emojiEl = document.getElementById('minigame-result-emoji');

  let outcome = 'failed_self';
  let note = `Only ${Math.round(mgState.progress * 100)}% resolved before the situation cratered.`;
  if (success || mgState.progress >= 1) {
    emojiEl.textContent = '🎉'; titleEl.textContent = 'INCIDENT RESOLVED!';
    titleEl.className = 'minigame-result-title success';
    document.getElementById('minigame-result-reward').textContent = `+${fmt(reward)} tickets earned!`;
    SFX.minigameWin();
    outcome = 'resolved_self';
    note = `Chuck personally dragged this mess over the finish line for +${fmt(reward)} tickets.`;
  } else if (mgState.progress >= 0.5) {
    emojiEl.textContent = '😅'; titleEl.textContent = 'Partially Resolved';
    titleEl.className = 'minigame-result-title success';
    document.getElementById('minigame-result-reward').textContent =
      `Salvaged +${fmt(reward)} tickets (${Math.round(mgState.progress*100)}% complete)`;
    SFX.minigameWin();
    outcome = 'partial_self';
    note = `Chuck stabilized ${Math.round(mgState.progress * 100)}% of the blast radius and salvaged +${fmt(reward)} tickets.`;
  } else {
    emojiEl.textContent = '💀'; titleEl.textContent = 'INCIDENT FAILED!';
    titleEl.className = 'minigame-result-title failed';
    document.getElementById('minigame-result-reward').textContent =
      `Only ${Math.round(mgState.progress*100)}% resolved. You gained a STRIKE.`;
    SFX.minigameFail();
    addStrike();
  }

  if (reward > 0) { gainTickets(reward); gainXp(calcXpGain(reward)); }
  S.incidentsResolved++;
  if ((success || mgState.progress >= 0.5) && !S.tutorialFirstIncidentResolved) {
    S.tutorialFirstIncidentResolved = true;
    toast('🛡️ Incident contained. Excellent. Pretend this level of competence is sustainable.', 'gold');
    claimOnboardingReward('firstIncidentResolved');
    tryCompleteFirstShiftBonus();
    renderOnboarding();
  }
  logIncidentEvent(mgState.inc, outcome, {
    reward,
    responder: 'Chuck Sterling',
    responderType: 'self',
    note,
  });
  activeIncident = null;
  mgState = null;
  renderStatsTab();
  checkAchievements();
}

function closeMinigame() {
  if (mgState && !mgState.done) { clearInterval(mgState.timer); mgState = null; }
  activeIncident = null;
  document.getElementById('minigame-modal').classList.add('hidden');
}

// ── Schedule incidents every 30-90 seconds ──
function scheduleNextIncident() {
  const delay = 30_000 + Math.random() * 60_000;
  setTimeout(() => { triggerIncident(); scheduleNextIncident(); }, delay);
}

// ══════════════════════════════════════════════════════════════
// OFFLINE INCOME
// ══════════════════════════════════════════════════════════════
function calcOfflineIncome() {
  const now = Date.now();
  const elapsed = (now - (S.lastTick || now)) / 1000; // seconds
  const maxSeconds = S.skillMods.offlineHours * 3600;
  const credited = Math.min(elapsed, maxSeconds);
  if (credited > 60) {
    const income = calcPerSec() * credited * 0.5; // 50% efficiency offline
    gainTickets(income);
    toast(`💤 Welcome back! Earned ${fmt(income)} tickets while away.`, 'gold');
  }
  S.lastTick = now;
}

// ══════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════
function renderCareerIntel() {
  const panel = document.getElementById('career-intel-panel');
  if (!panel) return;
  const intel = getCareerIntelModel();
  const markup = getCareerIntelMarkup();
  const statusEl = document.getElementById('career-intel-status');
  const summaryEl = document.getElementById('career-intel-summary');
  const perksEl = document.getElementById('career-intel-perks');
  const noteEl = document.getElementById('career-intel-reset-note');
  const progressEl = document.getElementById('career-intel-progress-bar');

  if (statusEl) statusEl.textContent = markup.status;
  if (summaryEl) summaryEl.textContent = markup.summary;
  if (perksEl) perksEl.innerHTML = markup.chips.join('');
  if (noteEl) noteEl.textContent = markup.resetNote;
  if (progressEl) progressEl.style.width = `${intel.pct || 0}%`;
}

function getShiftStatusText() {
  const now = Date.now();
  const restedMs = Math.max(0, (S.restedBuffUntil || 0) - now);
  const graceMs = Math.max(0, (S.shiftGraceUntil || 0) - now);

  if (S.clockedOut) {
    return 'Off Shift • incidents paused • squad running at 60%';
  }

  const parts = ['On Shift'];
  if (restedMs > 0) {
    parts.push(`rested bonus ${Math.ceil(restedMs / 1000)}s`);
  }
  if (graceMs > 0) {
    parts.push(`incident grace ${Math.ceil(graceMs / 1000)}s`);
  }
  return parts.join(' • ');
}

function renderStats() {
  const ps = calcPerSec();
  const pc = calcPerClick();
  document.getElementById('tickets-display').textContent  = fmt(S.tickets);
  const diffDisplay = document.getElementById('difficulty-display');
  if (diffDisplay) diffDisplay.textContent = getDifficulty().name;
  const shiftBtn = document.getElementById('btn-clock-toggle');
  const shiftStatus = document.getElementById('shift-status');
  const clickBtn = document.getElementById('main-clicker');
  const rested = Date.now() < (S.restedBuffUntil || 0);
  if (shiftBtn && shiftStatus && clickBtn) {
    shiftBtn.textContent = S.clockedOut ? '🟢 Clock In' : '🕒 Clock Out';
    shiftBtn.classList.toggle('clocked-out', S.clockedOut);
    shiftStatus.textContent = getShiftStatusText();
    shiftStatus.classList.toggle('rested', rested && !S.clockedOut);
    clickBtn.disabled = S.clockedOut;
    clickBtn.classList.toggle('is-disabled', S.clockedOut);
  }
  document.getElementById('lifetime-display').textContent = fmt(S.lifetimeTickets);
  document.getElementById('per-click-display').textContent= fmtDecimal(pc);
  document.getElementById('per-sec-display').textContent  = fmtDecimal(ps);
  document.getElementById('per-min-display').textContent  = fmtDecimal(ps * 60);
  document.getElementById('prestige-display').textContent = S.prestiges;
  document.getElementById('prestige-bonus-display').textContent = `×${S.prestigeMultiplier.toFixed(2)}`;
  const officeRow = document.getElementById('office-upgrades-row');
  const officeLabel = document.getElementById('office-upgrades-display');
  if (officeRow && officeLabel) {
    officeRow.style.display = (S.officePerksChosen || []).length > 0 ? 'flex' : 'none';
    officeLabel.textContent = `${(S.officePerksChosen || []).length} permanent`;
  }
  
  // Day display (new)
  const dayEl = document.getElementById('game-day-label');
  if (dayEl) dayEl.textContent = `Day ${S.gameDay}`;

  // Strikes display
  const strikesRow = document.getElementById('strikes-row');
  if (strikesRow) {
    if (S.strikes > 0) {
      strikesRow.style.display = 'flex';
      document.getElementById('strikes-display').textContent = `${S.strikes} / 3`;
    } else {
      strikesRow.style.display = 'none';
    }
  }
  
  document.getElementById('click-power-label').textContent = `+${fmtDecimal(pc)} ticket${pc !== 1 ? 's' : ''}`;

  // Career progress bar
  const tier = CAREER[S.careerTier];
  const nextTier = CAREER[S.careerTier + 1];
  if (nextTier) {
    const req = getCareerRequirement(nextTier);
    const pct = req > 0 ? Math.min(S.lifetimeTickets / req * 100, 100) : 0;
    document.getElementById('career-progress-bar').style.width = pct + '%';
  } else {
    document.getElementById('career-progress-bar').style.width = '100%';
  }
  document.getElementById('career-title').textContent = `${tier.icon} ${tier.title}`;
  renderCareerIntel();
}

function renderXpBar() {
  const pct = Math.min(S.xp / S.xpRequired * 100, 100);
  document.getElementById('xp-bar').style.width = pct + '%';
  document.getElementById('xp-label').textContent = `${fmt(S.xp)} / ${fmt(S.xpRequired)} XP`;
  document.getElementById('hero-level').textContent = S.level;
}

function updateComboUI() {
  const el = document.getElementById('combo-meter');
  if (S.combo <= 1) {
    el.classList.add('hidden');
  } else {
    el.classList.remove('hidden');
    document.getElementById('combo-count').textContent = `×${S.combo}`;
  }
}

function renderUpgrades() {
  const container = document.getElementById('upgrades-list');
  container.innerHTML = '';
  UPGRADES.forEach(u => {
    const owned = S.upgradeOwned[u.id] || 0;
    const cost  = upgradeCost(u);
    const canAfford = S.tickets >= cost;
    const div = document.createElement('div');
    div.className = 'upgrade-card';
    div.dataset.upgrade = u.id;
    const bonusTags = [];
    if (u.perClickBonus) bonusTags.push(`<span class="upgrade-tag">+${u.perClickBonus} /click</span>`);
    if (u.perSecBonus)   bonusTags.push(`<span class="upgrade-tag green">+${fmtDecimal(u.perSecBonus)} /sec</span>`);
    div.innerHTML = `
      <span class="upgrade-icon">${u.icon}</span>
      <div class="upgrade-info">
        <div class="upgrade-name">${u.name}</div>
        <div class="upgrade-desc">${u.desc}</div>
        <div class="upgrade-stats">${bonusTags.join('')}</div>
        <div class="upgrade-owned">Owned: ${owned}</div>
      </div>
      <button class="btn-buy" ${canAfford ? '' : 'disabled'}>${fmt(cost)} 🎫</button>
    `;
    div.querySelector('.btn-buy').addEventListener('click', () => buyUpgrade(u.id));
    container.appendChild(div);
  });
}

function renderSquad() {
  const rosterEl   = document.getElementById('squad-roster');
  const recruitEl  = document.getElementById('recruit-roster');
  rosterEl.innerHTML  = '';
  recruitEl.innerHTML = '';

  HEROES.forEach(h => {
    const hs = S.heroState[h.id];
    if (hs && hs.owned) {
      const card = buildHeroCard(h, hs, true);
      rosterEl.appendChild(card);
    }
  });

  S.applicantPool.forEach(id => {
    const h = HEROES.find(x => x.id === id);
    if (!h) return;
    const card = buildHeroCard(h, null, false);
    recruitEl.appendChild(card);
  });

  if (rosterEl.children.length === 0) {
    rosterEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.88rem;">No heroes recruited yet. Hire from the Available Recruits below!</p>';
  }
}

function buildHeroCard(h, hs, owned) {
  const card = document.createElement('div');
  card.className = `hero-card ${h.rarity}`;
  card.dataset.hero = h.id;

  const rarityColors = { common:'#9ea5d1', uncommon:'#4ade80', rare:'#3b82f6', epic:'#a78bfa', legendary:'#ffc94b' };
  const rarityColor  = rarityColors[h.rarity] || '#fff';

  if (owned) {
    const lvl = hs.level;
    const lvlUpCost = getHeroLevelCost(h, lvl);
    const trainCost = 2500 * ((h.skills || []).length + 1);
    const cpsContrib = fmtDecimal(h.baseCps * (1 + (lvl - 1) * 0.25));
    const skillBadges = (h.skills || []).map(s => `<span class="skill-badge">${s}</span>`).join('');

    if (hs.morale === undefined) hs.morale = 100;
    const moraleColor = hs.morale > 70 ? 'var(--green)' : hs.morale > 30 ? 'var(--gold)' : 'var(--red)';
    const statusClass = hs.status === 'Active' ? 'status-active' : 'status-out';
    const hintLevel = hs.badHire ? (hs.badHireHintLevel || 0) : 0;
    const badHireHint = hs.badHire
      ? `<div class="bad-hire-hint hint-${hintLevel}">${hintLevel === 0 ? '[Watchlist] Slightly off vibes.' : hintLevel === 1 ? '[Warning] Talks in buzzwords. Output not found.' : hintLevel === 2 ? '[Problem] Team morale dropping around this one.' : '[Confirmed] Bad hire. Act accordingly.'}</div>`
      : '';
    const fireButton = hs.badHire ? '<button class="btn-hero btn-fire">Review for Exit</button>' : '';
    const actionCols = hs.badHire ? 'grid-template-columns: repeat(3, minmax(0, 1fr));' : 'grid-template-columns: 1fr 1fr;';

    card.innerHTML = `
      <div class="hero-card-top">
        <span class="hero-emoji">${h.emoji}</span>
        <div class="hero-meta">
          <div class="hero-card-name">${h.name} <span class="hero-status-pill ${statusClass}">${hs.status}</span></div>
          <div class="hero-card-role">${h.role}</div>
          <div class="hero-card-rarity" style="color:${rarityColor}">${h.rarity.toUpperCase()}</div>
        </div>
      </div>
      <div class="hero-skills-row">${skillBadges}</div>
      ${badHireHint}
      <div class="hero-card-stats">
        <div class="hero-stat">Level<span>${lvl}</span></div>
        <div class="hero-stat">Tickets/sec<span>${hs.status === 'Active' ? cpsContrib : '0'}</span></div>
      </div>
      <div class="hero-morale-wrap">
        <div class="hero-morale-label">Morale: ${hs.morale}%</div>
        <div class="hero-morale-bar-bg"><div class="hero-morale-bar" style="width:${hs.morale}%; background:${moraleColor}"></div></div>
      </div>
      <div class="hero-lvl-bar-wrap"><div class="hero-lvl-bar" style="width:${Math.min((lvl/20)*100,100)}%"></div></div>
      <div class="hero-card-actions" style="display:grid; ${actionCols} gap:6px;">
        <button class="btn-hero btn-levelup" ${S.tickets >= lvlUpCost ? '' : 'disabled'}>Lvl Up (${fmt(lvlUpCost)} tickets)</button>
        <button class="btn-hero btn-train" ${S.tickets >= trainCost && hs.status === 'Active' ? '' : 'disabled'}>Train (${fmt(trainCost)} tickets)</button>
        ${fireButton}
      </div>
    `;
    card.querySelector('.btn-levelup').addEventListener('click', () => levelUpHero(h.id));
    card.querySelector('.btn-train').addEventListener('click', () => startTraining(h.id));
    if (hs.badHire) {
      card.querySelector('.btn-fire')?.addEventListener('click', () => fireHero(h.id));
    }
  } else {
    const skillBadges = (h.skills || []).map(s => `<span class="skill-badge">${s}</span>`).join('');
    const recruitCost = getHeroRecruitCost(h);
    const candidateMeta = S.recruitCandidateMeta?.[h.id] || {};
    const clueLevel = getHeroPenaltyHintLevel(candidateMeta);
    const clueText = candidateMeta.badHireClue || 'Proceed only if you enjoy consequences.';
    const candidateWarning = candidateMeta.badHire
      ? `<div class="bad-hire-hint hint-${clueLevel}">${clueLevel === 0 ? '[Vibe check] Background check pending. Something feels off.' : clueLevel === 1 ? `[Recruiter note] ${clueText}` : clueLevel === 2 ? `[Interview panel] ${clueText}` : `[Known risk] Everyone can smell the mistake now. ${clueText}`}</div>`
      : '';

    card.innerHTML = `
      <div class="hero-card-top">
        <span class="hero-emoji">${h.emoji}</span>
        <div class="hero-meta">
          <div class="hero-card-name">${h.name}</div>
          <div class="hero-card-role">${h.role}</div>
          <div class="hero-card-rarity" style="color:${rarityColor}">${h.rarity.toUpperCase()}</div>
        </div>
      </div>
      <div class="hero-skills-row">${skillBadges}</div>
      ${candidateWarning}
      <p style="font-size:0.79rem;color:var(--text-dim);margin:0 0 8px;">${h.desc}</p>
      <div class="hero-card-stats">
        <div class="hero-stat">Base CPS<span>${h.baseCps}</span></div>
        <div class="hero-stat">Cost<span>${fmt(recruitCost)} tickets</span></div>
      </div>
      <div class="hero-card-actions">
        <button class="btn-hero btn-recruit" ${S.tickets >= recruitCost ? '' : 'disabled'}>${candidateMeta.badHire ? 'Recruit Anyway' : 'Recruit'}</button>
      </div>
    `;
    card.querySelector('.btn-recruit').addEventListener('click', () => recruitHero(h.id));
  }
  return card;
}

function renderSkills() {
  const tree = document.getElementById('skill-tree');
  tree.innerHTML = '';
  SKILLS.forEach(sk => {
    const unlocked = S.unlockedSkills.includes(sk.id);
    const prereqsMet = sk.requires.every(r => S.unlockedSkills.includes(r));
    const affordable = S.skillPoints >= sk.cost && !unlocked && prereqsMet;
    const locked = !prereqsMet && !unlocked;
    const node = document.createElement('div');
    node.className = `skill-node${unlocked ? ' unlocked' : ''}${locked ? ' locked' : ''}${affordable ? ' affordable' : ''}`;
    node.dataset.skill = sk.id;
    const prereqNames = sk.requires.map(r => SKILLS.find(s => s.id === r)?.name || r).join(', ');
    node.innerHTML = `
      <div class="skill-icon">${sk.icon}</div>
      <div class="skill-name">${sk.name}</div>
      <div class="skill-desc">${sk.desc}</div>
      ${sk.requires.length ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Requires: ${prereqNames}</div>` : ''}
      <div class="skill-cost">${unlocked ? '✓ Unlocked' : `${sk.cost} SP`}</div>
    `;
    if (!unlocked && !locked) node.addEventListener('click', () => buySkill(sk.id));
    tree.appendChild(node);
  });
  document.getElementById('skill-points-label').textContent = `${S.skillPoints} SP available`;
}

function renderAchievements() {
  const grid = document.getElementById('achievements-grid');
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const achieved = S.achievedIds.includes(a.id);
    let current = 0;
    if (a.stat === 'lifetime')  current = S.lifetimeTickets;
    if (a.stat === 'heroes')    current = S.heroesOwned;
    if (a.stat === 'upgrades')  current = S.upgradesPurchased;
    if (a.stat === 'incidents') current = S.incidentsResolved;
    if (a.stat === 'dispatches') current = S.dispatches;
    if (a.stat === 'maxCombo')  current = S.maxCombo;
    if (a.stat === 'prestiges') current = S.prestiges;
    if (a.stat === 'level')     current = S.level;
    const pct = Math.min(current / a.goal * 100, 100);
    const card = document.createElement('div');
    card.className = `achievement-card${achieved ? ' achieved' : ''}`;
    card.dataset.achievement = a.id;
    card.innerHTML = `
      <div class="ach-icon">${a.icon}</div>
      <div class="ach-name">${a.name}</div>
      <div class="ach-desc">${a.desc}</div>
      <div class="ach-progress-wrap"><div class="ach-progress-bar" style="width:${pct}%"></div></div>
      <div class="ach-progress-label">${fmt(current)} / ${fmt(a.goal)}</div>
      <div class="ach-reward">${achieved ? '✅ ' : '🔒 '}${a.reward}</div>
    `;
    grid.appendChild(card);
  });
}

function updateAchievementProgress(a, current) {
  const card = document.querySelector(`[data-achievement="${a.id}"]`);
  if (!card) return;
  const pct = Math.min(current / a.goal * 100, 100);
  const bar = card.querySelector('.ach-progress-bar');
  if (bar) bar.style.width = pct + '%';
  const lbl = card.querySelector('.ach-progress-label');
  if (lbl) lbl.textContent = `${fmt(current)} / ${fmt(a.goal)}`;
}

// ══════════════════════════════════════════════════════════════
// STATS TAB
// ══════════════════════════════════════════════════════════════
function renderStatsTab() {
  const el = document.getElementById('stats-content');
  if (!el) return;
  const tier = CAREER[S.careerTier];
  const ps = calcPerSec();
  const pc = calcPerClick();
  const totalClicks = S.totalClicks || 0;
  const playTime = getPlayTimeStr();
  const officePerks = (S.officePerksChosen || []).map(id => OFFICE_UPGRADES.find(x => x.id === id)).filter(Boolean);
  const incidentLog = Array.isArray(S.incidentLog) ? S.incidentLog : [];
  const careerIntel = getCareerIntelMarkup();
  const careerIntelModel = getCareerIntelModel();
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><span class="stat-card-icon">🖥️</span><div class="stat-card-label">Current Title</div><div class="stat-card-value">${tier.icon} ${tier.title}</div></div>
      <div class="stat-card"><span class="stat-card-icon">⭐</span><div class="stat-card-label">Level</div><div class="stat-card-value">${S.level}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🎫</span><div class="stat-card-label">Current Tickets</div><div class="stat-card-value">${fmt(S.tickets)}</div></div>
      <div class="stat-card"><span class="stat-card-icon">📊</span><div class="stat-card-label">Lifetime Tickets</div><div class="stat-card-value">${fmt(S.lifetimeTickets)}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🖱️</span><div class="stat-card-label">Total Clicks</div><div class="stat-card-value">${fmt(totalClicks)}</div></div>
      <div class="stat-card"><span class="stat-card-icon">⚡</span><div class="stat-card-label">Per Click</div><div class="stat-card-value">${fmtDecimal(pc)}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🔄</span><div class="stat-card-label">Per Second</div><div class="stat-card-value">${fmtDecimal(ps)}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🏆</span><div class="stat-card-label">Promotions</div><div class="stat-card-value">${S.prestiges}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🪑</span><div class="stat-card-label">Office Upgrades</div><div class="stat-card-value">${officePerks.length}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🔥</span><div class="stat-card-label">Best Combo</div><div class="stat-card-value">×${S.maxCombo}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🚨</span><div class="stat-card-label">Incidents Resolved</div><div class="stat-card-value">${S.incidentsResolved}</div></div>
      <div class="stat-card"><span class="stat-card-icon">📡</span><div class="stat-card-label">Dispatches</div><div class="stat-card-value">${S.dispatches}</div></div>
      <div class="stat-card"><span class="stat-card-icon">👥</span><div class="stat-card-label">Heroes Recruited</div><div class="stat-card-value">${S.heroesOwned} / ${HEROES.length}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🛒</span><div class="stat-card-label">Upgrades Purchased</div><div class="stat-card-value">${S.upgradesPurchased}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🧠</span><div class="stat-card-label">Skills Unlocked</div><div class="stat-card-value">${S.unlockedSkills.length} / ${SKILLS.length}</div></div>
      <div class="stat-card"><span class="stat-card-icon">🏅</span><div class="stat-card-label">Achievements</div><div class="stat-card-value">${S.achievedIds.length} / ${ACHIEVEMENTS.length}</div></div>
      <div class="stat-card"><span class="stat-card-icon">⏱️</span><div class="stat-card-label">Play Time</div><div class="stat-card-value">${playTime}</div></div>
    </div>
    <div class="career-outlook-wrap">
      <h3 class="career-outlook-title">📈 Career Outlook</h3>
      <p class="career-intel-summary">${careerIntel.summary}</p>
      <div class="career-intel-progress">
        <div class="career-intel-progress-bar" style="width:${careerIntelModel.pct || 0}%"></div>
      </div>
      <div class="career-intel-perks">${careerIntel.chips.join('')}</div>
      <div class="career-intel-reset-note">${careerIntel.resetNote}</div>
    </div>
    ${officePerks.length ? `
      <div class="office-owned-wrap">
        <h3 class="office-owned-title">🏢 Office Upgrades</h3>
        <div class="office-owned-list">
          ${officePerks.map(perk => `
            <div class="office-owned-item">
              <span class="office-owned-icon">${perk.icon}</span>
              <div>
                <strong>${perk.name}</strong>
                <div>${perk.effectText}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    <div class="incident-log-wrap">
      <div class="incident-log-header">
        <h3 class="office-owned-title">🚨 Recent Incident Desk</h3>
        <span class="incident-log-subtitle">Last ${incidentLog.length || 0} escalations</span>
      </div>
      ${incidentLog.length ? `
        <div class="incident-log-list">
          ${incidentLog.map(entry => {
            const tone = getIncidentOutcomeTone(entry);
            const rewardText = entry.reward > 0 ? `+${fmt(entry.reward)} tickets` : 'No ticket gain';
            const responderText = entry.responder ? `${entry.responder}${entry.matchLabel ? ` • ${entry.matchLabel}` : ''}` : 'Nobody stepped up';
            return `
              <div class="incident-log-item ${tone.cls}">
                <div class="incident-log-topline">
                  <div class="incident-log-title-wrap">
                    <span class="incident-log-icon">${entry.icon}</span>
                    <div>
                      <div class="incident-log-title">${entry.title}</div>
                      <div class="incident-log-meta">Day ${entry.gameDay} • ${entry.severity} • ${entry.category}</div>
                    </div>
                  </div>
                  <span class="incident-log-pill ${tone.cls}">${tone.label}</span>
                </div>
                <div class="incident-log-body">
                  <div><strong>Responder:</strong> ${responderText}</div>
                  <div><strong>Impact:</strong> ${rewardText}</div>
                  <div class="incident-log-note">${entry.note || 'Logged for posterity and future blame assignment.'}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="incident-log-empty">No incidents logged yet. Enjoy the temporary illusion of control.</div>
      `}
    </div>
  `;
}

function getPlayTimeStr() {
  const started = S.gameStarted || Date.now();
  const ms = Date.now() - started;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ══════════════════════════════════════════════════════════════
// EXPORT / IMPORT / SHARE
// ══════════════════════════════════════════════════════════════
function exportSave() {
  saveGame();
  const data = localStorage.getItem(SAVE_KEY);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `servicedeskhero_save_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('💾 Save exported!', 'green');
}

function importSave() {
  document.getElementById('import-file-input').click();
}

function handleImportFile(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.lifetimeTickets && data.lifetimeTickets !== 0) throw new Error('Invalid save');
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      loadGame();
      calcOfflineIncome();
      renderAll();
      toast('📂 Save imported successfully!', 'green');
    } catch (err) {
      toast('❌ Invalid save file!', 'red');
    }
  };
  reader.readAsText(file);
  evt.target.value = '';
}

function shareStats() {
  const tier = CAREER[S.careerTier];
  const ps = calcPerSec();
  const text = [
    `🖥️ Service Desk Hero — Career Stats`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `${tier.icon} Title: ${tier.title}`,
    `⭐ Level: ${S.level}`,
    `🏆 Promotions: ${S.prestiges}`,
    `🎫 Lifetime Tickets: ${fmt(S.lifetimeTickets)}`,
    `⚡ Tickets/sec: ${fmtDecimal(ps)}`,
    `🔥 Best Combo: ×${S.maxCombo}`,
    `🚨 Incidents Resolved: ${S.incidentsResolved}`,
    `🏅 Achievements: ${S.achievedIds.length}/${ACHIEVEMENTS.length}`,
    ``,
    `Play at www.servicedeskhero.com`
  ].join('\n');
  navigator.clipboard.writeText(text).then(() => {
    toast('📋 Stats copied to clipboard!', 'green');
  }).catch(() => {
    toast('❌ Could not copy to clipboard', 'red');
  });
}

// ══════════════════════════════════════════════════════════════
// HELP MODAL
// ══════════════════════════════════════════════════════════════
function openHelp() {
  document.getElementById('help-modal').classList.remove('hidden');
}
function closeHelp() {
  document.getElementById('help-modal').classList.add('hidden');
  renderOnboarding();
}

function openFeedback() {
  document.getElementById('feedback-modal').classList.remove('hidden');
  document.getElementById('feedback-status').textContent = FEEDBACK_ALLOWED ? '' : 'Feedback is disabled in previews. Nothing will be sent.';
  document.getElementById('btn-submit-feedback').disabled = !FEEDBACK_ALLOWED;
}

function closeFeedback() {
  document.getElementById('feedback-modal').classList.add('hidden');
}

async function submitFeedback(evt) {
  evt.preventDefault();
  if (!FEEDBACK_ALLOWED) return;
  const type = document.getElementById('feedback-type').value;
  const message = document.getElementById('feedback-message').value.trim();
  const email = document.getElementById('feedback-email').value.trim();
  const statusEl = document.getElementById('feedback-status');
  const submitBtn = document.getElementById('btn-submit-feedback');

  if (!message) {
    statusEl.textContent = 'Please write something first.';
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = 'Sending feedback...';

  try {
    const version = document.getElementById('build-version')?.textContent || 'unknown';
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        message,
        email,
        version,
        page: window.location.pathname,
        userAgent: navigator.userAgent,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    document.getElementById('feedback-form').reset();
    statusEl.textContent = 'Feedback sent. Good. Now we have evidence.';
    toast('💬 Feedback submitted!', 'green');
    setTimeout(closeFeedback, 700);
  } catch (err) {
    console.error('feedback submit failed', err);
    statusEl.textContent = 'Could not send feedback right now. Try again later.';
    toast('Feedback failed to send.', 'red');
  } finally {
    submitBtn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════
// SOUND TOGGLE
// ══════════════════════════════════════════════════════════════
function toggleClockedOut() {
  const now = Date.now();
  if (S.clockedOut) {
    S.clockedOut = false;
    const offMs = now - (S.clockedOutAt || now);
    S.clockedOutAt = null;
    S.shiftGraceUntil = now + 20_000;
    if (offMs >= 60_000) {
      S.restedBuffUntil = now + 120_000;
      toast('☀️ Clocked back in. Rested bonus active for 2 minutes, plus 20 seconds of incident grace.', 'green');
    } else {
      toast('☀️ Back on shift. Barely a break, but you still get 20 seconds before the next fire.', 'green');
    }
  } else {
    S.clockedOut = true;
    S.clockedOutAt = now;
    S.restedBuffUntil = 0;
    S.shiftGraceUntil = 0;
    if (activeIncident) {
      dismissIncident(false, true);
      toast('🕒 Clocked out. Current incident deferred. The queue can scream into the void without you for a bit.', 'gold');
    } else {
      toast('🕒 Clocked out. Click income halted, incidents paused, squad keeps the lights on at 60%.', 'gold');
    }
  }
  renderStats();
}

function toggleSound() {
  const on = SFX.toggle();
  document.getElementById('btn-sound').textContent = on ? '🔊' : '🔇';
  localStorage.setItem('sdh_sound', on ? '1' : '0');
}

function loadSoundPref() {
  const pref = localStorage.getItem('sdh_sound');
  if (pref === '0') {
    SFX.enabled = false;
    document.getElementById('btn-sound').textContent = '🔇';
  }
}

function renderAll() {
  renderStats();
  renderXpBar();
  renderUpgrades();
  renderSquad();
  renderSkills();
  renderAchievements();
  renderStatsTab();
  renderOnboarding();
  checkPromotionReady();
  if ((S.officeDraftChoices || []).length) renderOfficeInterlude();
}

// ══════════════════════════════════════════════════════════════
// SAVE / LOAD
// ══════════════════════════════════════════════════════════════
const SAVE_KEY = 'sdh_save_v2';

function saveGame() {
  S.lastSave = Date.now();
  S.lastTick = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  const ind = document.getElementById('save-indicator');
  ind.textContent = '💾 Saved';
  ind.style.color = 'var(--green)';
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    const defaults = buildDefaultState();
    // Carefully merge nested objects so we don't overwrite new defaults with undefined
    const merged = Object.assign({}, defaults, saved);
    merged.skillMods = Object.assign({}, defaults.skillMods, saved.skillMods || {});
    merged.heroState = Object.assign({}, defaults.heroState, saved.heroState || {});
    merged.upgradeOwned = Object.assign({}, defaults.upgradeOwned, saved.upgradeOwned || {});
    merged.officeMods = Object.assign({}, defaults.officeMods, saved.officeMods || {});
    merged.officePerksChosen = Array.isArray(saved.officePerksChosen) ? saved.officePerksChosen : [];
    merged.officeDraftChoices = Array.isArray(saved.officeDraftChoices) ? saved.officeDraftChoices : [];
    merged.incidentLog = Array.isArray(saved.incidentLog) ? saved.incidentLog.slice(0, 8) : [];
    S = merged;
    // Restore non-serializable (timers)
    S.comboTimer = null;
    // Re-apply modifiers from scratch to avoid double-stacking
    reapplyAllSkills();
    reapplyAllAchievements();
    recalcOfficeMods();
  } catch(e) {
    console.error('Failed to load save:', e);
  }
}

let _resetPending = false;
function resetGame() {
  const btn = document.getElementById('btn-reset');
  if (!_resetPending) {
    // First click: arm the button
    _resetPending = true;
    btn.textContent = 'Sure? Click again';
    btn.style.background = 'rgba(248,113,113,0.25)';
    setTimeout(() => {
      if (_resetPending) {
        _resetPending = false;
        btn.textContent = 'Reset';
        btn.style.background = '';
      }
    }, 3000);
    return;
  }
  // Second click: actually reset
  _resetPending = false;
  btn.textContent = 'Reset';
  btn.style.background = '';

  // Stop the tick so it doesn't re-save over the cleared state
  clearInterval(tickInterval);
  tickInterval = null;

  localStorage.removeItem(SAVE_KEY);
  S = buildDefaultState();

  renderAll();
  startTick();
  toast('💀 Game reset. Fresh start!', 'red');
}

// ── Auto-save every 30s ──
setInterval(saveGame, 30_000);

// ══════════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════════
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
}

// ══════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════
(function init() {
  loadGame();
  recalcOfficeMods();

  // Pick up difficulty from bootstrap (stored in localStorage by difficulty-modal script)
  const bootstrapDiff = localStorage.getItem('difficultyMode') || localStorage.getItem('sdhDifficulty') || (window.GAME_SETTINGS && window.GAME_SETTINGS.difficulty);
  if (bootstrapDiff && DIFFICULTY_MODES.find(d => d.id === bootstrapDiff)) {
    S.difficultyId = bootstrapDiff;
  }

  // Ensure gameStarted is tracked
  if (!S.gameStarted) S.gameStarted = Date.now();
  if (!S.totalClicks) S.totalClicks = 0;
  if (!S.applicantPool || S.applicantPool.length === 0) refreshJobBoard(0);
  calcOfflineIncome();
  initTabs();
  loadSoundPref();
  renderAll();
  startTick();
  scheduleNextIncident();

  // Show help on first visit
  if (!localStorage.getItem('sdh_seen_help')) {
    openHelp();
    localStorage.setItem('sdh_seen_help', '1');
  }

  // Event bindings
  document.getElementById('btn-refresh-board').addEventListener('click', () => refreshJobBoard(500));
  document.getElementById('main-clicker').addEventListener('click', handleClick);
  document.getElementById('btn-save').addEventListener('click', saveGame);
  document.getElementById('btn-reset').addEventListener('click', resetGame);
  document.getElementById('btn-promote').addEventListener('click', doPromotion);
  document.getElementById('btn-sound').addEventListener('click', toggleSound);
  document.getElementById('btn-help').addEventListener('click', openHelp);
  document.getElementById('btn-feedback').addEventListener('click', openFeedback);
  document.getElementById('btn-clock-toggle').addEventListener('click', toggleClockedOut);
  document.getElementById('btn-close-help').addEventListener('click', closeHelp);
  document.getElementById('help-overlay').addEventListener('click', closeHelp);
  document.getElementById('btn-close-feedback').addEventListener('click', closeFeedback);
  document.getElementById('feedback-overlay').addEventListener('click', closeFeedback);
  document.getElementById('feedback-form').addEventListener('submit', submitFeedback);
  document.getElementById('btn-dismiss-onboarding').addEventListener('click', () => {
    S.tutorialDismissed = true;
    renderOnboarding();
  });
  document.getElementById('btn-onboarding-action').addEventListener('click', () => {
    const action = document.getElementById('btn-onboarding-action').dataset.action;
    if (action === 'squad') setActiveTab('squad');
    else if (action === 'upgrades') setActiveTab('upgrades');
    else if (action === 'click') document.getElementById('main-clicker').click();
    else if (action === 'incident') openDispatchModal();
    else if (action === 'help') openHelp();
    else if (action === 'claim-first-shift') {
      if (claimOnboardingReward('firstShiftComplete')) {
        renderOnboarding();
      }
    }
  });
  // Incident: RESPOND NOW opens dispatch modal
  document.getElementById('incident-resolve').addEventListener('click', openDispatchModal);
  // Dispatch modal: self-handle + overlay close
  document.getElementById('dispatch-self-btn').addEventListener('click', handleSelf);
  document.getElementById('dispatch-overlay').addEventListener('click', closeDispatchModal);
  // Minigame: click button + close/continue
  document.getElementById('btn-minigame-click').addEventListener('click', onMinigameClick);
  document.getElementById('btn-minigame-close').addEventListener('click', closeMinigame);
  document.getElementById('btn-share').addEventListener('click', shareStats);
  document.getElementById('btn-export').addEventListener('click', exportSave);
  document.getElementById('btn-import').addEventListener('click', importSave);
  document.getElementById('import-file-input').addEventListener('change', handleImportFile);
  
  // Fired Modal
  document.getElementById('btn-accept-fired').addEventListener('click', () => {
    document.getElementById('fired-modal').classList.add('hidden');
  });

  // Auto-save on window close or refresh
  window.addEventListener('beforeunload', saveGame);
})();
