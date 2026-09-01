# A9 — Later across devices  `wayfinder:grilling`

status: **owner decision** · map 4

P21 keeps deferrals local so a shut laptop can never hide mail on every
device (fails safe). With a phone, local-only is the bug: a thread saved for
Monday on the Mac stays in the phone's inbox. Proposal: carry
`deferrals: [{threadId, until}]` inside the encrypted vault. The server
sees ciphertext; the letter of spec §1 ("no ids reach the service") moves
to "no ids the service can read". Failure mode stays safe: a deferral is a
local predicate on every device that has the vault; nothing at Google moves.
Recommendation: yes. Decision is Nick's; queued.
