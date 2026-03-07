/* ============================================================
   constants.js - Strategy sim data
   ============================================================ */

window.GAME_DATA = (() => {
  const STAFF_POOL = window.RECRUIT_POOL || [];

  const CAREER = [
    { id: 0, title: 'Service Desk Supervisor', hourlyRate: 38, annualSalary: 79040, weeklyAP: 5, headcount: 5, supervisorSlots: 0, promotionTarget: 58, orgScale: 'Support Pod' },
    { id: 1, title: 'Senior Supervisor', hourlyRate: 46, annualSalary: 95680, weeklyAP: 5, headcount: 8, supervisorSlots: 1, promotionTarget: 61, orgScale: 'Escalation Floor' },
    { id: 2, title: 'Incident Manager', hourlyRate: 58, annualSalary: 120640, weeklyAP: 5, headcount: 12, supervisorSlots: 2, promotionTarget: 64, orgScale: 'Incident Cluster' },
    { id: 3, title: 'Ops Manager', hourlyRate: 72, annualSalary: 149760, weeklyAP: 5, headcount: 18, supervisorSlots: 3, promotionTarget: 67, orgScale: 'Operations Wing' },
    { id: 4, title: 'Senior Ops Manager', hourlyRate: 88, annualSalary: 183040, weeklyAP: 5, headcount: 26, supervisorSlots: 4, promotionTarget: 70, orgScale: 'Regional Command Floor' },
    { id: 5, title: 'Director', hourlyRate: 108, annualSalary: 224640, weeklyAP: 6, headcount: 38, supervisorSlots: 6, promotionTarget: 72, orgScale: 'Shared Services Tower' },
    { id: 6, title: 'Senior Director', hourlyRate: 132, annualSalary: 274560, weeklyAP: 6, headcount: 52, supervisorSlots: 8, promotionTarget: 74, orgScale: 'Transformation District' },
    { id: 7, title: 'VP', hourlyRate: 168, annualSalary: 349440, weeklyAP: 7, headcount: 70, supervisorSlots: 11, promotionTarget: 76, orgScale: 'Platform Region' },
    { id: 8, title: 'SVP', hourlyRate: 215, annualSalary: 447200, weeklyAP: 7, headcount: 96, supervisorSlots: 15, promotionTarget: 79, orgScale: 'Global Ops Megablock' },
    { id: 9, title: 'CIO', hourlyRate: 285, annualSalary: 592800, weeklyAP: 8, headcount: 140, supervisorSlots: 20, promotionTarget: 999, orgScale: 'Enterprise Gravity Well' },
  ];

  const BOSS_ARCHETYPES = [
    {
      id: 'deck_addict',
      name: 'Pat Caldwell',
      title: 'VP, Strategic Alignment',
      temperament: 'Wants slides, not truth.',
      moods: ['performatively calm', 'asking for a tighter narrative', 'already drafting a scapegoat memo'],
      asks: [
        'Make the queue look intentional before the steering committee sees it.',
        'Translate operational pain into three bullets and a North Star arrow.',
        'Keep the board from learning what the word backlog means.',
      ],
    },
    {
      id: 'finops_monk',
      name: 'Dana Mercer',
      title: 'Director, FinOps Governance',
      temperament: 'Treats every invoice like a personal betrayal.',
      moods: ['tracking spend in real time', 'weaponizing a spreadsheet', 'smelling headcount'],
      asks: [
        'Prove your team can do more with less before Finance does it for you.',
        'Reduce cost without changing service, staffing, or reality.',
        'Explain overtime without using the phrase under-resourced.',
      ],
    },
    {
      id: 'ai_prophet',
      name: 'Morgan Pike',
      title: 'SVP, Agentic Transformation',
      temperament: 'Believes AI can replace process and weather.',
      moods: ['drunk on buzzwords', 'demanding an AI narrative', 'one keynote away from a reorg'],
      asks: [
        'Show visible momentum on the agentic service desk initiative.',
        'Frame debt as temporary friction on the AI journey.',
        'Find a way to say RAG and governance in the same sentence.',
      ],
    },
    {
      id: 'audit_hawk',
      name: 'Evelyn Shaw',
      title: 'Chief Risk Liaison',
      temperament: 'If it is not documented, it did not happen.',
      moods: ['circling a control failure', 'looking for evidence', 'ready to make your week educational'],
      asks: [
        'Show me the control, the owner, and the timestamp.',
        'I need proof, not vibes, that your org can survive an audit.',
        'Assume I will read the appendix.',
      ],
    },
  ];

  const WEEKLY_ACTIONS = [
    { id: 'work_tickets', label: 'Work Tickets', icon: '🎫', apCost: 1, target: 'none', description: 'Reduce backlog directly. Nobody notices unless it fails.' },
    { id: 'reporting', label: 'Reporting', icon: '📊', apCost: 1, target: 'none', description: 'Turn pain into executive-ready charts.' },
    { id: 'budgeting', label: 'Budgeting', icon: '💸', apCost: 1, target: 'none', description: 'Protect budget health before Finance gets creative.' },
    { id: 'meetings', label: 'Meetings', icon: '📅', apCost: 1, target: 'none', description: 'Perform alignment and absorb entropy.' },
    { id: 'time_tracking', label: 'Time Tracking', icon: '⏱️', apCost: 1, target: 'none', description: 'Feed compliance. Starve your soul.' },
    { id: 'one_on_one', label: '1:1s', icon: '🗣️', apCost: 1, target: 'staff', description: 'Repair one person before they update LinkedIn.' },
    { id: 'approve_offer', label: 'Approve Offer', icon: '🧾', apCost: 2, target: 'candidate', description: 'Fill approved headcount from the HR slate.' },
    { id: 'approve_raise', label: 'Approve Raise', icon: '💵', apCost: 1, target: 'staff', description: 'Stabilize retention by hurting budget health.' },
    { id: 'promote_supervisor', label: 'Promote to Supervisor', icon: '📈', apCost: 2, target: 'staff', description: 'Trade one IC for one stressed-out manager.' },
    { id: 'fire_employee', label: 'Fire Employee', icon: '🪓', apCost: 1, target: 'staff', description: 'Immediate budget relief, delayed morale damage.' },
    { id: 'fire_supervisor', label: 'Fire Supervisor', icon: '🔥', apCost: 2, target: 'staff', description: 'Visible decisiveness, expensive disruption.' },
    { id: 'ask_review', label: 'Ask for Review', icon: '🧠', apCost: 1, target: 'none', description: 'Force the promotion conversation onto the calendar.' },
  ];

  const POLITICAL_MOVES = [
    { id: 'tell_truth', label: 'Tell the Truth', icon: '🧾', apCost: 1, description: 'Take the hit and reduce narrative debt.' },
    { id: 'spin_boss', label: 'Spin to Boss', icon: '🎭', apCost: 1, description: 'Buy political capital now. Pay later.' },
    { id: 'hide_backlog', label: 'Hide Backlog', icon: '🫥', apCost: 1, description: 'Reclassify unresolved work as platform stabilization.' },
    { id: 'freeze_hiring', label: 'Freeze Hiring', icon: '🧊', apCost: 1, description: 'Finance loves it. The team does not.' },
    { id: 'skip_time_tracking', label: 'Skip Time Tracking', icon: '🚫', apCost: 1, description: 'Steal capacity from compliance and call it agility.' },
    { id: 'cancel_one_on_ones', label: 'Cancel 1:1s', icon: '📵', apCost: 1, description: 'Free time now. Burn trust later.' },
    { id: 'blame_vendor', label: 'Blame Vendor', icon: '📡', apCost: 1, description: 'Works until the receipts surface.' },
    { id: 'midnight_oil', label: 'Push Midnight Oil', icon: '🌙', apCost: 1, description: 'Crush this week at the cost of next month.' },
  ];

  const CONSEQUENCES = {
    hidden_backlog: { delayWeeks: 2, log: 'The hidden queue appears in an appendix nobody was supposed to read.', effects: { backlog: 10, politicalCapital: -9, narrativeDebt: 6 } },
    frozen_hiring: { delayWeeks: 1, log: 'The hiring freeze lands as morale damage instead of discipline.', effects: { backlog: 7, morale: -8, politicalCapital: -3 } },
    skipped_tracking: { delayWeeks: 1, log: 'Audit notices that your timesheets have entered an experimental phase.', effects: { compliance: -14, politicalCapital: -4, narrativeDebt: 5 } },
    canceled_one_on_ones: { delayWeeks: 1, log: 'Silence from management gets interpreted correctly.', effects: { morale: -9, narrativeDebt: 4 } },
    vendor_receipts: { delayWeeks: 2, log: 'The vendor forwards the email thread with your blame note attached.', effects: { politicalCapital: -12, narrativeDebt: 8, compliance: -3 } },
    burnout_wave: { delayWeeks: 1, log: 'The overtime push lands as sickness and passive-aggressive PTO.', effects: { morale: -10, backlog: 6, narrativeDebt: 5 } },
    truth_respect: { delayWeeks: 1, log: 'Somebody senior quietly notices that you gave a straight answer.', effects: { politicalCapital: 4, narrativeDebt: -4 } },
    shadow_ai_blowback: { delayWeeks: 2, log: 'The shadow AI pilot hallucinates a process map and Audit wants a meeting.', effects: { compliance: -10, politicalCapital: -5, narrativeDebt: 7 } },
  };

  const EVENT_TEMPLATES = {
    boss: [
      {
        id: 'boss_queue_story',
        title: 'Boss Wants a Cleaner Queue Story',
        summary: 'Monday steering committee. Same queue, new vocabulary.',
        mandatory: true,
        choices: [
          { id: 'truth', label: 'Tell the truth', summary: 'Backlog is real and headcount is thin.', effects: { politicalCapital: -5, compliance: 3, narrativeDebt: -5, promotionPressure: 4 }, consequence: 'truth_respect' },
          { id: 'soften', label: 'Soften the truth', summary: 'Rename the backlog and pray nobody asks for raw numbers.', effects: { politicalCapital: 5, narrativeDebt: 6, compliance: -1 } },
          { id: 'hide', label: 'Hide backlog', summary: 'Bury low-priority work in a platform stabilization bucket.', effects: { politicalCapital: 8, narrativeDebt: 9 }, consequence: 'hidden_backlog' },
        ],
      },
      {
        id: 'boss_headcount_pitch',
        title: 'COO Wants Headcount Discipline',
        summary: 'You have one open req and a boss who thinks pain builds character.',
        mandatory: true,
        choices: [
          { id: 'freeze', label: 'Freeze hiring', summary: 'Look disciplined now, absorb pain later.', effects: { budgetHealth: 8, morale: -5, narrativeDebt: 5 }, consequence: 'frozen_hiring' },
          { id: 'justify', label: 'Defend the req', summary: 'Ask for the seat and explain the queue honestly.', effects: { politicalCapital: -3, compliance: 2, narrativeDebt: -2, promotionPressure: 4 } },
          { id: 'hide_need', label: 'Pretend you can absorb it', summary: 'Protect optics by underplaying staffing risk.', effects: { politicalCapital: 5, narrativeDebt: 7, morale: -2 }, consequence: 'hidden_backlog' },
        ],
      },
      {
        id: 'boss_staffing_signal',
        title: 'Boss Wants Visible Leadership Signal',
        summary: 'Leadership wants a symbolic act of control.',
        mandatory: true,
        choices: [
          { id: 'coach', label: 'Coach the team', summary: 'Do the slow thing that helps.', effects: { morale: 5, politicalCapital: -2, narrativeDebt: -3, promotionPressure: 4 } },
          { id: 'fire_someone', label: 'Signal decisiveness', summary: 'Hint that underperformance will be handled.', effects: { politicalCapital: 6, morale: -8, narrativeDebt: 6 } },
          { id: 'midnight', label: 'Push midnight oil', summary: 'Buy near-term output with sleep.', effects: { backlog: -8, politicalCapital: 5, morale: -6, narrativeDebt: 5 }, consequence: 'burnout_wave' },
        ],
      },
    ],
    finance: [
      {
        id: 'finance_cloud_bill',
        title: 'FinOps Escalates Cloud Repatriation Deck',
        summary: 'Apparently elasticity was only acceptable when it fit the board slide.',
        mandatory: true,
        choices: [
          { id: 'own', label: 'Own the spend', summary: 'Explain what actually happened.', effects: { budgetHealth: -4, politicalCapital: -2, narrativeDebt: -3, promotionPressure: 3 } },
          { id: 'blame', label: 'Blame vendor', summary: 'Claim the MSP burned budget on bad architecture.', effects: { budgetHealth: 4, politicalCapital: 3, narrativeDebt: 6 }, consequence: 'vendor_receipts' },
          { id: 'freeze', label: 'Freeze hiring', summary: 'Protect the budget headline with fewer people.', effects: { budgetHealth: 8, morale: -4, narrativeDebt: 4 }, consequence: 'frozen_hiring' },
        ],
      },
      {
        id: 'finance_raise_pushback',
        title: 'Finance Pushes Back on Raises',
        summary: 'They ask whether retention is measurable or just emotional.',
        mandatory: true,
        choices: [
          { id: 'fight', label: 'Fight for raises', summary: 'Protect morale and accept budget heat.', effects: { morale: 6, budgetHealth: -7, politicalCapital: -1, promotionPressure: 4 } },
          { id: 'delay', label: 'Delay raises', summary: 'Buy time by promising next cycle.', effects: { budgetHealth: 5, morale: -5, narrativeDebt: 3 } },
          { id: 'spin', label: 'Sell growth opportunities', summary: 'Replace money with a larger PDF.', effects: { politicalCapital: 4, narrativeDebt: 5, morale: -3 } },
        ],
      },
      {
        id: 'finance_zero_based',
        title: 'Zero-Based Budgeting Week',
        summary: 'The spreadsheet believes entropy is optional.',
        mandatory: true,
        choices: [
          { id: 'document', label: 'Document reality', summary: 'Show what each role is covering.', effects: { compliance: 4, budgetHealth: 2, politicalCapital: -2, promotionPressure: 3 } },
          { id: 'trim_story', label: 'Trim the story', summary: 'Inflate efficiency and hope nobody measures it.', effects: { politicalCapital: 5, narrativeDebt: 6 } },
          { id: 'freeze', label: 'Offer a hiring freeze', summary: 'Calm Finance by pre-sacrificing throughput.', effects: { budgetHealth: 8, morale: -5, narrativeDebt: 4 }, consequence: 'frozen_hiring' },
        ],
      },
    ],
    audit: [
      {
        id: 'audit_timesheets',
        title: 'Audit Wants Timesheet Evidence',
        summary: 'The auditor keeps using the phrase traceability with visible joy.',
        mandatory: true,
        choices: [
          { id: 'fix', label: 'Fix the tracking', summary: 'Eat the compliance work now.', effects: { compliance: 8, backlog: 4, politicalCapital: -1, narrativeDebt: -4 } },
          { id: 'skip', label: 'Skip time tracking', summary: 'Steal time from controls and call it delivery.', effects: { actionPoints: 1, compliance: -8, narrativeDebt: 7 }, consequence: 'skipped_tracking' },
          { id: 'soften', label: 'Offer a remediation plan', summary: 'Promise structure later.', effects: { politicalCapital: 4, compliance: -2, narrativeDebt: 4 } },
        ],
      },
      {
        id: 'audit_control_gap',
        title: 'Control Gap Found in Production Workflow',
        summary: 'Audit is fascinated by the difference between policy and survival.',
        mandatory: true,
        choices: [
          { id: 'admit', label: 'Admit the gap', summary: 'Fix it properly.', effects: { compliance: 7, politicalCapital: -3, narrativeDebt: -5, promotionPressure: 4 }, consequence: 'truth_respect' },
          { id: 'paper', label: 'Paper over it', summary: 'Write a policy fast and hope the system catches up.', effects: { politicalCapital: 4, narrativeDebt: 5, compliance: -2 } },
          { id: 'delay', label: 'Delay remediation', summary: 'Kick the can behind a committee.', effects: { politicalCapital: 2, narrativeDebt: 7 }, consequence: 'skipped_tracking' },
        ],
      },
      {
        id: 'audit_vendor_access',
        title: 'Audit Questions Vendor Access',
        summary: 'Shared credentials have become a governance topic.',
        mandatory: true,
        choices: [
          { id: 'lock', label: 'Tighten access', summary: 'Make the vendor mad and Audit briefly happy.', effects: { compliance: 8, backlog: 2, politicalCapital: -1 } },
          { id: 'blame', label: 'Blame vendor', summary: 'Pretend the partner ignored process.', effects: { politicalCapital: 4, narrativeDebt: 7 }, consequence: 'vendor_receipts' },
          { id: 'waiver', label: 'Ask for a waiver', summary: 'Trade control debt for time.', effects: { politicalCapital: 2, compliance: -4, narrativeDebt: 5 } },
        ],
      },
    ],
    vendor: [
      {
        id: 'vendor_missed_sla',
        title: 'Vendor Misses SLA and Sends a Glossy PDF',
        summary: 'The partner has replaced delivery with formatting.',
        mandatory: true,
        choices: [
          { id: 'escalate', label: 'Escalate for real', summary: 'Call the miss and document the impact.', effects: { backlog: 4, compliance: 3, politicalCapital: -1, narrativeDebt: -2 } },
          { id: 'blame', label: 'Blame vendor upward', summary: 'Tell leadership the partner is the blocker.', effects: { politicalCapital: 6, narrativeDebt: 7 }, consequence: 'vendor_receipts' },
          { id: 'absorb', label: 'Absorb the damage', summary: 'Protect the relationship, punish the team.', effects: { backlog: 6, morale: -5, narrativeDebt: 4 } },
        ],
      },
      {
        id: 'vendor_ai_pitch',
        title: 'Vendor Pitches an Agentic AI Desk',
        summary: 'They say it will eliminate toil, tickets, and maybe accountability.',
        mandatory: true,
        choices: [
          { id: 'pilot', label: 'Run a shadow pilot', summary: 'Fast optics, shaky controls.', effects: { politicalCapital: 6, narrativeDebt: 6, compliance: -3 }, consequence: 'shadow_ai_blowback' },
          { id: 'ask_questions', label: 'Ask actual questions', summary: 'Slow the hype train with due diligence.', effects: { compliance: 4, politicalCapital: -2, promotionPressure: 3 } },
          { id: 'defer', label: 'Defer politely', summary: 'Smile, thank them, bury the note.', effects: { politicalCapital: 1, narrativeDebt: -1 } },
        ],
      },
    ],
    hr: [
      {
        id: 'hr_flight_risk',
        title: 'HR Flags a Flight Risk',
        summary: 'One of your better people has discovered recruiters.',
        mandatory: true,
        choices: [
          { id: 'raise', label: 'Approve raise', summary: 'Keep them. Hurt budget.', effects: { morale: 6, budgetHealth: -6, politicalCapital: 1 } },
          { id: 'promise', label: 'Promise growth later', summary: 'Hope the future can outbid the present.', effects: { politicalCapital: 2, narrativeDebt: 4, morale: -4 } },
          { id: 'shrug', label: 'Let it ride', summary: 'Bet that the market is fake.', effects: { morale: -6, politicalCapital: -2, narrativeDebt: 2 } },
        ],
      },
      {
        id: 'hr_engagement',
        title: 'Employee Experience Survey Drops',
        summary: 'The organization has once again measured sadness instead of fixing it.',
        mandatory: true,
        choices: [
          { id: 'listen', label: 'Hold 1:1s', summary: 'Use time to repair trust.', effects: { morale: 7, politicalCapital: -1, narrativeDebt: -2 } },
          { id: 'cancel', label: 'Cancel 1:1s', summary: 'Focus on delivery and let culture self-heal.', effects: { actionPoints: 1, morale: -7, narrativeDebt: 6 }, consequence: 'canceled_one_on_ones' },
          { id: 'spin', label: 'Narrate resilience', summary: 'Turn complaints into a change journey.', effects: { politicalCapital: 5, narrativeDebt: 6, morale: -3 } },
        ],
      },
      {
        id: 'hr_return_to_office',
        title: 'Return-to-Office Talking Points Arrive',
        summary: 'No one has defined culture beyond badge scans.',
        mandatory: true,
        choices: [
          { id: 'push', label: 'Push the message', summary: 'Be the face of policy.', effects: { politicalCapital: 5, morale: -7, narrativeDebt: 4 } },
          { id: 'soften', label: 'Soften locally', summary: 'Quietly keep the team functional.', effects: { morale: 4, politicalCapital: -2, narrativeDebt: 2 } },
          { id: 'resist', label: 'Resist upward', summary: 'Protect the team publicly.', effects: { morale: 6, politicalCapital: -5, promotionPressure: 4 } },
        ],
      },
    ],
    incident: [
      {
        id: 'incident_mfa_loop',
        title: 'MFA Outage Turns Identity Into Performance Art',
        summary: 'Identity says it is not their fault. Nobody believes them.',
        mandatory: true,
        choices: [
          { id: 'work', label: 'Work tickets', summary: 'Throw labor at the problem.', effects: { backlog: -6, morale: -2, politicalCapital: 1 } },
          { id: 'vendor', label: 'Blame vendor', summary: 'Tell leadership the IAM provider is the blocker.', effects: { politicalCapital: 5, narrativeDebt: 6 }, consequence: 'vendor_receipts' },
          { id: 'spin', label: 'Narrate stabilization', summary: 'Talk before fixing.', effects: { politicalCapital: 4, backlog: 4, narrativeDebt: 5 } },
        ],
      },
      {
        id: 'incident_patch_regret',
        title: 'Weekend Patch Breaks Monday Login',
        summary: 'A change intended to reduce risk has improved chaos.',
        mandatory: true,
        choices: [
          { id: 'own', label: 'Own the rollback', summary: 'Fix it, document it, take the heat.', effects: { backlog: -4, compliance: 4, politicalCapital: -1, narrativeDebt: -2 } },
          { id: 'hide', label: 'Hide backlog', summary: 'Reclassify break-fix as modernization lag.', effects: { politicalCapital: 6, narrativeDebt: 8 }, consequence: 'hidden_backlog' },
          { id: 'midnight', label: 'Push midnight oil', summary: 'Clear it by force.', effects: { backlog: -8, morale: -6, narrativeDebt: 5 }, consequence: 'burnout_wave' },
        ],
      },
      {
        id: 'incident_shadow_it',
        title: 'Shadow IT Ships a Workflow to Production',
        summary: 'Marketing discovered low-code and now identity is sad.',
        mandatory: true,
        choices: [
          { id: 'contain', label: 'Contain it', summary: 'Do the unglamorous work.', effects: { compliance: 6, backlog: 3, politicalCapital: -1 } },
          { id: 'spin', label: 'Call it innovation', summary: 'Use the phrase citizen development.', effects: { politicalCapital: 5, narrativeDebt: 6, compliance: -4 } },
          { id: 'blame', label: 'Blame vendor tooling', summary: 'Point at the platform partner.', effects: { politicalCapital: 3, narrativeDebt: 5 }, consequence: 'vendor_receipts' },
        ],
      },
    ],
    ai: [
      {
        id: 'ai_governance_panic',
        title: 'AI Governance Memo Lands',
        summary: 'Leadership wants innovation and control simultaneously and by Friday.',
        mandatory: true,
        choices: [
          { id: 'govern', label: 'Insist on governance', summary: 'Slow, boring, correct.', effects: { compliance: 6, politicalCapital: -2, promotionPressure: 3 } },
          { id: 'pilot', label: 'Pilot fast', summary: 'Optics first, controls later.', effects: { politicalCapital: 6, narrativeDebt: 7, compliance: -4 }, consequence: 'shadow_ai_blowback' },
          { id: 'soften', label: 'Write a framework', summary: 'Produce language instead of answers.', effects: { politicalCapital: 4, narrativeDebt: 3 } },
        ],
      },
      {
        id: 'ai_vibe_code',
        title: 'Vibe Coding Reaches Production',
        summary: 'A workflow built entirely on confidence is now paging Ops.',
        mandatory: true,
        choices: [
          { id: 'rollback', label: 'Rollback hard', summary: 'Stability before vibes.', effects: { backlog: -4, compliance: 4, politicalCapital: -1 } },
          { id: 'frame', label: 'Frame it as innovation', summary: 'Keep the narrative warm.', effects: { politicalCapital: 6, narrativeDebt: 6, compliance: -3 } },
          { id: 'midnight', label: 'Quietly patch it overnight', summary: 'Fix first, document never.', effects: { backlog: -6, morale: -4, narrativeDebt: 4 }, consequence: 'burnout_wave' },
        ],
      },
    ],
    news: [
      { id: 'news_boss_wrong', title: "NEWS: Boss says 'Don't worry about it'", summary: 'Boss is wrong again. Nothing to click, nowhere to hide.', autoEffects: { morale: -2 } },
      { id: 'news_overtime', title: 'NEWS: Manager declares voluntary mandatory overtime', summary: 'HR would like you to know those words should not fit together.', autoEffects: { morale: -4, narrativeDebt: 1 } },
      { id: 'news_printer', title: 'NEWS: Printer outage escalated as strategic blocker', summary: 'The printer has more visibility than your backlog.', autoEffects: { politicalCapital: -1, morale: -2 } },
      { id: 'news_shadow_ai', title: 'NEWS: Shadow AI pilot gains executive sponsor', summary: 'Nobody knows what it does, which is why leadership loves it.', autoEffects: { narrativeDebt: 2, politicalCapital: 1 } },
      { id: 'news_reorg', title: 'NEWS: Reorg rumor now has its own rumor', summary: 'The organization is iterating on uncertainty.', autoEffects: { morale: -3 } },
      { id: 'news_finops', title: 'NEWS: FinOps says optimize nine times in one call', summary: 'Budget health suffers emotional damage.', autoEffects: { budgetHealth: -2 } },
      { id: 'news_vibe', title: 'NEWS: Vibe-coded bot posts to production channel', summary: 'It congratulates the outage for achieving scale.', autoEffects: { compliance: -2, narrativeDebt: 1 } },
      { id: 'news_steering', title: 'NEWS: Steering committee creates another steering committee', summary: 'Governance continues to scale independently of results.', autoEffects: { backlog: 2, politicalCapital: -1 } },
      { id: 'news_cloud', title: 'NEWS: Cloud repatriation thread lasts four hours, changes nothing', summary: 'The only thing moving was the meeting invite.', autoEffects: { morale: -2, budgetHealth: -1 } },
      { id: 'news_badge', title: 'NEWS: Badge scan data cited as culture metric', summary: 'Someone in leadership really committed to the bit.', autoEffects: { morale: -3 } },
    ],
  };

  return {
    CAREER,
    BOSS_ARCHETYPES,
    WEEKLY_ACTIONS,
    POLITICAL_MOVES,
    CONSEQUENCES,
    EVENT_TEMPLATES,
    STAFF_POOL,
  };
})();
