/** Fictional project work. No external services or real configuration changes. */
export const PROJECT_ACTIONS = Object.freeze({test:18, release:6, unsafeRelease:2, remediate:18});
export const PROJECTS = Object.freeze([
  {id:'portal-rollout', title:'Staff portal rollout', unlockAfter:0,
    description:'A portal update is ready for a pilot. Test compatibility before release; an untested release can break the shared portal.',
    finding:'The pilot detects an old-client compatibility fault. The corrected build passes the pilot and rollback check.',
    incidentTitle:'The portal has left the building', service:'staff portal'},
  {id:'print-refresh', title:'Printer fleet refresh', unlockAfter:4,
    description:'A new queue package promises fewer calls. Test it against the mixed printer fleet before release.',
    finding:'The pilot catches a driver mismatch on older printers. A model-specific package passes test prints and rollback.',
    incidentTitle:'Every printer joins the strike', service:'shared print service'},
]);
export function incidentSource(risk, severity) {
  return {id:`incident-${risk.id}`, title:risk.incidentTitle, category:`CAUSAL SEV ${severity} · RECOVERY`, icon:'🔥',
    user:'Service monitor · Verified impact',
    quote:'It was only one tiny change. The entire department has submitted a rebuttal.',
    brief:`The ${risk.service} is failing. Cause: ${risk.cause} Successful recovery reward: +${risk.sourceTicketId?0:severity===2?200:300} points and +10 morale.`,
    clue:'The previous version was healthy. Stop the rollout, restore the known-good version, and verify recovery before retesting.',
    investigations:[{id:'incident-scope',kind:'question',label:'Confirm the affected users',reply:'Everyone on the new version is affected. For once, “everyone” has supporting evidence.',evidence:'Affected users share the new release; the previous version remains healthy.'},
      {id:'incident-logs',kind:'diagnostic',label:'Compare release logs with the baseline',reply:'The failure starts at the unsafe release. The timeline would like a word.',evidence:'The new release fails; the verified previous version is healthy and available for recovery.'}],
    actions:[{kind:'fix',label:'Stop rollout, restore known-good version, and verify',outcome:'Service recovered. The unsafe change returns to testing. The timeline has receipts.'},
      {kind:'wrong',label:'Expand the failing release to everybody',outcome:'More users experience the same fault. Consistency is not availability.'},
      {kind:'wrong',label:'Silence the service alarm',outcome:'The alarm is quiet. The users have become significantly louder.'}]};
}
