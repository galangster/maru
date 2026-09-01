# I4 — Push on the phone  `wayfinder:task`

status: **blocked by A4** · map 5

APNs registration through a Tauri plugin; `POST /v1/push/register`; the
client calls `users.watch` per account and reports it with
`POST /v1/push/watch`; renewal on open, on background refresh and on every
silent push (watch lasts seven days); silent push → history fetch → local
notification with sender and subject composed on the phone.
