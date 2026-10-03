/** Conversation traps never lock out useful evidence. The user is not a telemetry system. */
export function withConversationChoices(source) {
  return {...source, investigations:[...source.investigations,
    {id:`${source.id}-leading`,kind:'question',quality:'leading',label:'Nothing changed and it affects everyone, right?',
      reply:'Exactly. Everyone. Well, I have only checked my desk. And I changed something small, but I did not count that as a change.',
      evidence:'Unverified and contradictory: the caller has not checked other users and may be omitting a change. Ask a specific question or verify with diagnostics.'},
    {id:`${source.id}-irrelevant`,kind:'question',quality:'irrelevant',label:'What color should the replacement equipment be?',
      reply:'Executive midnight. Does that fix it? I have already chosen a matching mug.',
      evidence:'No diagnostic evidence gained. The equipment preference does not establish the fault; useful questions and checks remain available.'}
  ]};
}
