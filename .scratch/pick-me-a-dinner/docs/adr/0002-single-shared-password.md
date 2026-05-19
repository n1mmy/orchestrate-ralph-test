# Single shared password, no user accounts

This is a single-Household app. Access control needs only to keep anonymous
people on the internet out — there is no per-person data, no sharing model,
and no reason to know *who* is using it. So there is no user table and no
accounts: the app is gated by one shared password in the `APP_PASSWORD` env
var, and a correct submission establishes a sealed `iron-session` cookie.

The password is stored and compared in plaintext (constant-time
`crypto.timingSafeEqual`) — no hashing, no lockout, no rate limiting. This is
deliberate, not an oversight. The threat model is "trusted infrastructure,
low-value target": the secret lives only in a k8s Secret, the app is not
internet-notable, and anyone who can read the `APP_PASSWORD` env var is
already inside the infrastructure. Hashing would protect a credential
*database* that does not exist here.

## Consequences

A future reader should not "fix" this by adding hashed credentials or a users
table without first revisiting the threat model — real multi-user accounts are
an explicit non-goal (plan §10). If the app ever needs per-person identity,
that is a new decision that supersedes this ADR, not a patch.
