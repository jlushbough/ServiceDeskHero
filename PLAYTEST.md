# Office Dungeon playtest checklist

This release is a development playtest, not a marketing launch. No advertising, analytics, payment flow, new backend, or account/security changes are included.

## Publishing is explicit

GitHub validates pull requests and main automatically. Code merges do not publish. The S3/CloudFront workflow is manual-only; an authenticated AWS connection can publish an explicitly approved tested build instead. Keep deployment credentials and authentication separate from code changes.

## Before release

- Pass `npm run check` and `npm test`
- Pass the draft PR's **Game playtest** workflow
- Inspect desktop and mobile screenshots in `game-playtest-evidence`
- Check acknowledgement-before-SLA, 900-second Sev 3, causal report-time 180-second Sev 2 and 60-second Sev 1 clocks, technical fixes, two-stage bosses, Faker success/failure, pause/replay, and storage isolation
- Retain the existing career entry point and `sdh_save_v2`

## After release

- Confirm `version.json` reports the merged commit
- Open the actual HTTPS site and play a round
- Confirm the root shows DEV PLAYTEST and Career mode loads
- Do not submit production feedback during QA
- Confirm no unexpected console errors or missing assets

## Rollback

The pre-Rush main baseline is `f01fdfa90a0d1fb10e740b6f9a96d0aa985b905b` (tree `728ed675516c52b37b0a6a4efdaddc5e4dfd8e24`). Revert the gameplay merge with a new reviewed commit and explicitly publish the tested revert. Do not force-push main. The old version already uses `sdh_save_v2`, so the same saved careers remain compatible. Rush uses a separate key and can safely remain in storage.

## Known playtest boundaries

- No online leaderboard or anti-cheat; scores are local and shareable as text
- A round is not saved across a page refresh; best scores are saved when storage is available
- Three work floors, twelve normal tickets, two projects, optional causal incidents, two two-stage bosses, two class trees, equipment caches, and authored home/inbox choices form the playable slice
- Career mode is preserved rather than rebalanced in this pass

## Contact and prevention acceptance

- Questions and diagnostics reveal enough information to solve every case; misleading questions never lock out useful ones
- Straightforward informed fixes need no mandatory questioning; first-try zero-inquiry fixes earn an efficiency bonus
- Reproducible 30–120s arrivals can overlap tickets; no issue is silently discarded
- Safe tested projects and direct correct fixes can finish with zero Sev 1/2 incidents
- Unsafe change → visible cause and prevention window → first 180s Sev 2 → explicit recovery reward
- Projects compete for the same worker; interruption, pause, duplicate clicks and replay remain safe
- No onsite/dispatch UI yet: authored location hooks are reserved for a future pass

## Dungeon and life-loop acceptance

- Starting allocation allows 0–2 spent points; unspent points remain usable in Character
- Floor 2/3 rewards occur once per run; all branches and all stat specialists can finish by asking questions or using known answers
- Class branches/evolutions and one gear choice per cache enforce mutual exclusion, and each real effect matches its description
- Character modal pauses arrivals, SLAs, risk clocks, and unfinished work; Close/Escape resumes once with focus restored
- Inbox retains running clocks, blocks gameplay shortcuts, and P opens Pause safely
- Boss reactions and project decisions appear in the final recap; build and history carry into later days
- Every activity and conversational response can reach the next morning, including repair and imperfect choices
- Seeded unknown audits reveal once the following morning and name their earlier cause; starts remain bounded and recoverable
- Leaving early records a handoff cost; completely cleared days have no handoff penalty
- Desktop, 320px phone, and short-landscape game/dialog layouts fit the viewport with contained scrolling
- Career saves and earlier score records remain intact; no live AI, external workplace messaging, or paid service is involved
