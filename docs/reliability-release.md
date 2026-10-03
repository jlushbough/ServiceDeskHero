# Dungeon reliability and investigation release

Starting deployed revision: f9fdfee144cf8fda91033e96cfb0f5a649d4d990.

## Player-facing changes

- Correct and incorrect repair attempts share build-adjusted durations. Timing no longer reveals an answer.
- Correct direct diagnosis remains valid and earns a +25 first-try bonus. One useful question or diagnostic earns the same evidence-backed bonus; extra inquiries and leading/irrelevant questions cannot farm it. Boss stages evaluate their own first try and retain both stages' evidence in closed history.
- Self-created risks can be corrected before impact, but earn no prevention points. Manufactured boss incidents also grant no recovery points. Verified project releases still earn +450; unsafe project incident recovery remains worth less than tested delivery.
- A/1-3 cannot operate on a hidden case from an empty active tab. Keyboard activation ignores stale pointer targets.
- Mira supplies the promised diagnostic note and does not describe today's reply as yesterday's action.
- Home dialogue preserves the original question, options and exactly chosen response after keeping or rescheduling a promise.
- Wrong incident actions show morale loss alone. Successful recovery reports the actual morale gained, including caps.
- A missed incident SLA records a pending recovery handoff, not service restoration. History, project cards, home and morning briefing explain who owns recovery and the bounded handoff cost.
- Mobile queues reserve room for Windows scrollbars; the 320px lobby no longer overflows by scrollbar width.

Sev 3 remains untimed before ACK and has 900 seconds afterward. Sev 2/1 remain 180/60 seconds from report. Pause/background freeze, forgiving onboarding, compact desk and Career save keys are preserved.

## Validation

Regression coverage includes repair timing across stat/skill/gear effects, both pre-impact and escalated boss reward loops, useful vs leading/repeated investigation, per-stage evidence, missed-incident ownership, exact morale metadata, inbox time references, home dialogue stability, invisible-case shortcuts, and desktop/mobile public-UI play.

Verified on Windows: 92 unit tests and 46 headed Chromium browser tests passed; screenshots inspected at 1440px desktop and 390px mobile.

Run `npm run check`, `npm test`, and `npm run test:browser`. The browser server chooses Python appropriately on Windows and always starts a fresh local fixture. Tests block non-local requests.

## Publication handoff

This is a feature branch/draft PR for the existing deployment worker. No AWS access, deployment, paid model calls or Claude review was performed during development. Publishing must use the tested feature commit after review/merge through the existing worker.

## Next milestone

Reliable versioned campaign saves precede the daily-world layer. Save active backlog, RNG state, build, relationships, exact home dialogue and current edition identity atomically, with validation, recovery and migrations. See daily-world-proposal.md for the proposed architecture and approvals still needed.
