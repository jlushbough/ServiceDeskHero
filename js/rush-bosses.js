import { withConversationChoices } from './rush-dialogue.js';
/** Original, fictional training encounters. Actions affect only the local game. */
export const BOSSES = Object.freeze([
  {
    id: 'PrinterThatCannotBeFound', afterNormal: 4, techSkill: 8,
    title: 'The Printer That Cannot Be Found',
    entrance: 'The curtains part. A printer has entered witness protection. Two faults. One spectacularly unhelpful display.',
    defeat: 'Address corrected. Driver matched. The beast produces one entirely ordinary sheet of paper. Thunderous applause.',
    stages: [
      {
        id: 'printer-address', category: 'BOSS · NETWORK PRINTING', title: 'The Printer That Cannot Be Found',
        quote: "Nothing changed. I merely moved desks, acquired a new address, and became unreachable. Pure coincidence.",
        brief: "The shared print queue cannot reach this office printer after a network move; the printer’s own display says Ready.",
        investigations: [
          {
            id: "printer-current-address", kind: "question",
            label: "What address is on the configuration report?",
            reply: "10.20.4.87. A distinguished address. Please stop sending correspondence to my previous residence.",
            evidence: "The printer’s configuration report lists 10.20.4.87.",
          },
          {
            id: "printer-change-scope", kind: "question",
            label: "Which part of printing stopped working?",
            reply: "Every job through the shared queue waits forever. My own configuration report printed beautifully; I kept a copy for my reviews.",
            evidence: "The local configuration report prints, but jobs through the shared queue cannot reach the printer.",
          },
          {
            id: "printer-compare-port", kind: "diagnostic",
            label: "Compare the queue port, DNS, and reservation",
            reply: "Simulated print network check complete. The queue has failed to update its address book.",
            evidence: "DHCP reserves 10.20.4.87 and DNS resolves there correctly. The queue’s TCP/IP port still targets the obsolete 10.20.4.44.",
          },
        ],
        onsite: {
          location: "Second-floor shared print area",
          reason: "Read the printer’s configuration report or panel address if remote inventory is unavailable.",
        },
        clue: 'The printer configuration report and DHCP reservation both show 10.20.4.87. DNS already resolves correctly. The shared queue still uses a TCP/IP port at the obsolete 10.20.4.44.',
        user: 'The Vanishing Printer · Technical skill 8/10', icon: '🖨️',
        actions: [
          { label: 'Point the queue port at the verified reserved IP', kind: 'fix', outcome: 'The queue reaches the correct printer. A driver error emerges from behind the curtain.' },
          { label: 'Flush DNS on every laptop', kind: 'wrong', outcome: 'DNS already had the right address. The print queue is still calling the old one.' },
          { label: 'Reinstall the same queue without changing its port', kind: 'wrong', outcome: 'A brand-new installation of the exact same wrong address. Magnificent consistency.' },
        ],
      },
      {
        id: 'printer-driver', category: 'BOSS · DRIVER DIAGNOSIS', title: 'The Printer: final paper jam',
        quote: "I am definitely out of paper. Ignore the full tray and that very specific language error; I enjoy a simple narrative.",
        brief: "The corrected queue now reaches the printer, but submitted test jobs fail with an unsupported-language error.",
        investigations: [
          {
            id: "driver-local-report", kind: "question",
            label: "Can the printer still print its own report?",
            reply: "Perfectly. A whole page, from my suspiciously full tray. My paper shortage theory is under review.",
            evidence: "The printer can feed paper and print its own configuration report.",
          },
          {
            id: "driver-language-support", kind: "question",
            label: "Which language does this model support?",
            reply: "PCL only, says my configuration report. I listed “multilingual” on the brochure for emotional reasons.",
            evidence: "This model’s report lists PCL support and no PostScript support.",
          },
          {
            id: "driver-compare-language", kind: "diagnostic",
            label: "Compare the driver with the model",
            reply: "Simulated driver check complete. Both sides of the conversation have been identified.",
            evidence: "The queue uses a PostScript driver for this PCL-only model; an approved model-specific PCL6 driver is available.",
          },
        ],
        clue: 'The corrected port reaches this PCL-only model. Its queue is configured with a PostScript driver, and test jobs produce an unsupported-language error. An approved PCL6 driver for this model is available.',
        user: 'The Vanishing Printer · Technical skill 8/10', icon: '🖨️',
        actions: [
          { label: 'Use the approved PCL6 driver and verify a test print', kind: 'fix', outcome: 'The driver speaks PCL6. The test page prints. An actual fix, with supporting paperwork.' },
          { label: 'Resend the same PostScript job', kind: 'wrong', outcome: 'The printer declines the same language for the same reason, now with artistic conviction.' },
          { label: 'Add more paper to the full tray', kind: 'wrong', outcome: 'Ample paper. Incompatible print language. The tray cannot translate.' },
        ],
      },
    ],
  },
  {
    id: 'Friday4:59ChangeRequest', afterNormal: 12, techSkill: 2,
    title: 'The Friday 4:59 Change Request',
    entrance: 'Behold: a change request wearing a tiny emergency crown. It demands production. You demand a rollback plan.',
    defeat: 'The failed canary is rolled back, service is verified healthy, and the change returns to testing. The weekend receives a stay of execution.',
    stages: [
      {
        id: 'friday-rollback', category: 'BOSS · CHANGE SAFETY', title: 'The Friday 4:59 Change Request',
        quote: "It is one tiny column. If anything breaks, we roll the app back and the data grows back overnight. Probably.",
        brief: "A late release request proposes dropping a database column. The claimed rollback only restores the previous app.",
        investigations: [
          {
            id: "rollback-column-use", kind: "question",
            label: "Does the current app still use the column?",
            reply: "Only in a few screens. Unfortunately, “a few” includes the screens customers use.",
            evidence: "The current app still reads the column marked for deletion.",
          },
          {
            id: "rollback-restores-data", kind: "question",
            label: "What would the proposed rollback restore?",
            reply: "The old app package. The column and its data are not included in the triumphant return.",
            evidence: "The proposed rollback restores app code but does not restore the dropped column or data.",
          },
          {
            id: "rollback-staging-rehearsal", kind: "diagnostic",
            label: "Inspect the staging dependency check",
            reply: "Simulated staging-only check complete. No production change is made.",
            evidence: "On the staging copy, the current app fails when the column is absent; preserving it is required for backward compatibility.",
          },
        ],
        clue: 'This fictional release drops a database column that the current app still reads. A rollback would restore that app but not the dropped data. The staging copy confirms the dependency.',
        user: 'The Deadline Duke · Technical skill 2/10', icon: '🚨',
        actions: [
          { label: 'Keep the column; test a backward-compatible migration and rollback', kind: 'fix', outcome: 'The staged migration preserves the column and the old app still works. The rollback is tested before the canary begins.' },
          { label: 'Ship the drop and promise to roll the app back', kind: 'wrong', risk:{service:'release pipeline',incidentTitle:'The rollback that could not roll back',cause:'The current app still depends on the column; the rollback does not restore it.'}, outcome: 'An app rollback cannot conjure a deleted column or its data. The emergency crown is made of cardboard.' },
          { label: 'Disable database alerts for the release', kind: 'wrong', outcome: 'Silencing the orchestra does not repair the trapdoor. The rollback remains broken.' },
        ],
      },
      {
        id: 'friday-canary', category: 'BOSS · CANARY RECOVERY', title: 'The Change Request: red canary',
        quote: "The canary is mostly green if you do not look at the red part. Surely five percent is a rounding error.",
        brief: "After the compatible migration passed, the release reached a 5% canary. New errors now appear only on that version.",
        investigations: [
          {
            id: "canary-stop-gate", kind: "question",
            label: "What does the release gate require?",
            reply: "Stop on errors. I was hoping the word “stop” had a festive Friday interpretation.",
            evidence: "The release gate requires stopping the rollout when the canary produces errors.",
          },
          {
            id: "canary-previous-health", kind: "question",
            label: "Is the previous version safe to restore?",
            reply: "Yes, it is healthy, and we tested that rollback. Fine, my emergency crown will wait.",
            evidence: "The previous app is healthy and the rollback was tested after the backward-compatible migration.",
          },
          {
            id: "canary-error-comparison", kind: "diagnostic",
            label: "Compare canary logs and baseline health",
            reply: "Simulated release check complete. Configuration values are not displayed or changed.",
            evidence: "The 5% canary returns HTTP 500 because a required environment variable is missing; the previous version remains healthy.",
          },
        ],
        clue: 'The backward-compatible migration passed. The 5% canary now returns HTTP 500 because a required environment variable is missing. The previous app is healthy, the rollback was tested, and the release gate requires stopping on errors.',
        user: 'The Deadline Duke · Technical skill 2/10', icon: '🚨',
        actions: [
          { label: 'Roll back the canary, verify health, and retest corrected config', kind: 'fix', outcome: 'Traffic returns to the healthy version; error rates recover. The missing configuration goes back through testing before any new rollout.' },
          { label: 'Roll out to 100% so every instance matches', kind: 'wrong', risk:{service:'customer portal',incidentTitle:'The red canary takes over',cause:'The failing canary was expanded despite its stop-on-error gate.'}, outcome: 'Uniform failure is still failure. The tiny emergency crown has become a very large outage.' },
          { label: 'Increase the timeout without fixing the missing variable', kind: 'wrong', outcome: 'A longer timeout cannot supply a missing configuration value. The canary remains decidedly red.' },
        ],
      },
    ],
  },
].map(boss=>({...boss,stages:boss.stages.map(withConversationChoices)})));
