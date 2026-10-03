# Daily world: architecture proposal only

No live AI, model credentials, cloud resources, scheduling, telemetry or persistent access is provisioned by this release. Top-ten popularity is an aspiration; retention must be demonstrated by playtests and, only with later approval, privacy-conscious measurement.

## Milestone 1: reliable versioned campaign saves

Before expanding content, define a versioned campaign schema separate from existing Career saves (`sdh_save_v2`) and best-score/sound preferences. Persist actual unresolved cases and handoff ownership, causal risks, project state, morale/support, relationships/promises, character build, original home dialogue, edition identifier/content hash, and personal window times.

Refactor the seeded RNG into a serializable state rather than saving function closures. Ticket/source references must resolve to the locked edition, including evidence and stage. Use an atomic two-slot local snapshot with schema validation, migration, last-good recovery, export/import and clear user-facing recovery choices. Never erase Career data while migrating campaign state.

Acceptance: refresh during a ticket, project, pause, results or home and continue the identical state; one-shot rewards stay one-shot; corrupt/unsupported saves recover safely; resumed RNG/actions match uninterrupted play. Test desktop/mobile and unavailable/full storage.

## Milestone 2: accepted hybrid edition contract

- One shared edition rolls at 06:00 America/Chicago, respecting daylight saving time.
- A player may begin anytime. Beginning locks that edition for a personal 24-hour window; a later shared rollover cannot rewrite their active cases or choices.
- Backlog, relationships and builds persist as actual campaign state. Old work needs an explicit resolution, recovery or owned handoff, not silent replacement by a fresh random queue.
- Global incidents have a fair offline aftermath: players returning later see an understandable briefing and an opportunity to participate/recover, rather than being required to be online at publication.
- Offline consequences are capped and explained before commitment. Exact cap values, pause/offline reconciliation and global-incident aftermath rules must be taken from the accepted blueprint; they are pending clarification and are not implemented here.

Use immutable edition JSON (id, schema version, publish time, content hash, validity, authored cases/projects/global events). A deterministic rules engine remains authoritative for timers, rewards, consequences and causality. Personal variations use the locked edition plus local progress; model text cannot execute code, change rewards or retroactively alter outcomes.

## Proposed AI data flow

1. An approved publisher prepares fictional world state and an authored scenario catalog.
2. One scheduled provider request drafts a shared daily edition in a strict schema. It receives fictional organizations/regions and a bounded world summary, not account credentials, raw player input, private repositories, workplace data or real systems.
3. Validate content IDs, evidence/solution consistency, severity windows, difficulty/reward budgets, length and fictional attribution. Reject unknown fields/code/URLs and unsafe or unsupported content. Human review initially; publication uses the existing worker only after separate approval.
4. Publish immutable edition JSON. The browser downloads content and runs the existing deterministic simulation locally. It never receives a model API key or calls a model per action.
5. Player evaluation initially uses local transparent rules: diagnosis quality, learning gaps, service recovery and relationship choices. Any later transmission of aggregate play data or model-based personal evaluation needs a separate, explicit data-flow/privacy approval. Nothing is transmitted now.

Fallback: retain the last validated authored edition or a safe local practice edition. Provider outage or budget exhaustion must not block play or switch to unapproved billing.

Example: a simulated Sev 1 outage at the fictional Lumen Republic power cooperative, with an unverified malicious-change hypothesis and discoverable restoration evidence. Do not claim that a real country caused a current-world attack. All technical actions affect fictional game state only.

## Provider and cost proposal

Keep a provider adapter so content can be evaluated with Anthropic or OpenAI after credentials, model choice and spending limits are approved. The completed Claude CLI/Max reviews are not authorization to reuse subscription tokens in a game backend or to run recurring model calls.

An illustrative Anthropic API option is Opus 5.5: published standard input/output prices are $4/$20 per million tokens. At 8,000 input plus 2,000 output tokens, one edition costs approximately $0.072, or $2.16 for 30 editions, before additional thinking/output, retries, validation passes or hosting. This is a sizing example, not a quote or approved budget. Explicitly account for thinking tokens; the independent review runs showed that high-effort reasoning can substantially exceed the final narrative length.

Source: https://platform.claude.com/docs/en/models/opus-5-5/overview . Recheck prices and compare a smaller model before selecting a provider. Start with one shared edition request/day, capped output and bounded retries, with a hard approved monthly cap and alerts. Do not make one expensive generation per player/action. No paid API access or spend is enabled by this proposal.

## Decisions required before implementation

- Accepted blueprint's exact offline caps and global aftermath behavior.
- Save storage/recovery UX and whether devices ever synchronize accounts.
- Chosen provider/model, credentials ownership, retention/privacy terms, spending cap and who approves editions.
- Any backend/scheduler/telemetry/cloud access requires specific approval and timely account-access notice.

Deliver versioned saves first. Then build and test the immutable authored-edition contract without live AI. Provision the approved AI publisher only after that contract and cost/data flow are reviewed.
