# Native Windows CI: robustness golden diagnosis

## Scope and source identity

The tests below were investigated against the pristine SolidCraft source pinned by Forge at
`75261cd79733fe47cf898b54f865e6bfaffa1129`. The original checkout remains clean. Local diagnostic
build products were placed under a temporary `.diagnostics/` directory in the Forge worktree; no
installed Forge files or user projects were touched.

The focused Windows differential run on Forge commit `d41bff9950264cd8d1b79d3ee1fa9d304ce21d63`
is [run 40022934674](https://github.com/pricklyguy/DemonX-Forge/actions/runs/40022934674). It
compares each named test against pristine pinned source and then after the Forge overlay:

| Test | Pristine | Overlay | Diagnosis |
| --- | --- | --- | --- |
| `recovery::tests::recovery_dirs_and_their_legacy_names` | Pass | Pass | The Forge recovery path replacement is correct. |
| `tests::robustness_goldens::seed_13` | Fail | Fail | Pinned upstream geometry baseline mismatch; no overlay regression. |
| `tests::robustness_goldens::seed_23` | Fail | Fail | Small area drift beyond the current strict tolerance; no overlay regression. |
| `tests::robustness_goldens::seed_36` | Fail | Fail | Pinned upstream boolean/topology failure; no overlay regression. |
| `tests::robustness_goldens::seed_67` | Fail | Fail | Platform-sensitive generated operation record; no overlay regression. |

The comparison itself passed. The four golden tests remain visible failures in the pristine and
overlaid Windows source; the workflow does not bless, skip, or hide them.

## Seed 13 — valid solid, material result drift

On the local Windows build of pristine pinned source, `fuzz-one 13` generated this accepted
sequence (with one rejected smooth-edge fillet attempt): revolved section, cut cylinder, join
box, rectangular pattern, cut cylinder, cut box, fillet, hole. Replaying accepted operations
individually left a body with empty `validity()` diagnostics after each step.

The final hole produced area `2101.521015 mm²`, volume `2396.939549 mm³`, 41 faces and 103 edges.
The recorded expectation is area `2112.846954 mm²`, volume `2410.783741 mm³`, 39 faces and 99
edges. The differences are roughly 0.54% in area and 0.57% in volume, plus exact topology-count
changes. This is not floating-point noise. The model remains a valid closed solid, but the
randomized operation sequence creates measurably different geometry. The final hole is the last
operation that changes the measured result; runner traces are needed to compare its face/pick
selection and generated parameters across platforms before proposing a kernel correction.

## Seed 36 — minimized contact-sensitive Boolean failure

The pristine seed minimizes to three operations: a full revolve, a join box and a join cylinder.
The revolve has one valid shell. The box join adds a disconnected solid and leaves a valid body
with two shells. The cylinder then intersects the revolved shell and is rejected with:

> `lumps: shell boundaries intersect or touch; cavity ownership is ambiguous`

The attempted operation leaves the preceding valid two-shell body intact. The original seed has
additional cut-cylinder and fillet operations before the same final join-cylinder command. The
fuzz runner classifies this as a genuine Boolean failure, not as an assertion about an invalid
body. Focused replays isolate the interaction with the disconnected shell: the same revolved
body and cylinder join successfully when the box step is omitted, producing one valid shell
(volume `54333.055750 mm³`, area `9087.951003 mm²`, 13 faces, 33 edges, empty validity report).
With the box included, changes of `0.1 mm` and `1 mm` in the cylinder's Y or Z placement still
fail. This points to the kernel's Boolean handling of a valid multi-shell target, rather than a
generally malformed cylinder or an isolated rounding threshold.

This is a robustness gap when adding geometry to one solid in a valid multi-shell body. It does
not corrupt the model, but a user who joins a disconnected solid and later edits another shell
can hit a safe operation refusal. Regression work should first add a direct case for a
multi-shell target, verify the same cylinder join on the single-shell control, and check that a
failed join preserves the original bodies and measurements.

## Seeds 23 and 67 — platform record instability

Seed 23's final body is valid and has the same one-body, one-shell topology on the local Windows
machine: 7 faces and 15 edges. Its volume differs from the expected value by about `0.000508
mm³` (within the existing `1e-6` relative tolerance). Its area differs by `0.003531 mm²`, about
`1.97e-6` relative, narrowly exceeding that tolerance. This is a small numeric area drift, not a
topology or practical-shape failure. Do not widen the tolerance or replace the expected value
without a runner-level comparison.

Seed 67 finishes locally as one valid body with two shells, area `7940.064000 mm²`, volume
`27606.450862 mm³`, 35 faces and 84 edges. One generated fillet is rejected as unsupported and a
later shell attempt is rejected because its picked face is unusable. The checked-in Windows
record expects two bodies, area `7943.462220 mm²`, volume `27607.962186 mm³`, 36 faces and 86
edges, with different rejected/unsupported counters. The local result matches the shared
record instead. That makes the existing OS-only `windows` golden insufficient to describe all
Windows environments; the discrepancy is operation-generation/kernel-path variation, not a
safe basis for blessing new values.

Keep all recorded topology and operation-count assertions. Before changing records, capture
seed 23 and seed 67 generated command traces and final measurements on the exact Windows and
Linux CI runners, then determine whether stable input generation or a kernel determinism fix is
feasible.

## CI runtime and coverage plan

The current native matrix runs `cargo test --workspace --profile ci --locked` once on each OS.
It preserves coverage but gives no shard-level failure feedback, and earlier Windows CI took
nearly two hours in the source/UI test step. The repository's pinned upstream CI already uses
`cargo-nextest` and test sharding.

## Implemented Windows CI strategy

After the packaged GUI interaction checkpoint passed, the native Windows preview workflow was
changed to use a pinned `cargo-nextest` 0.9.145 archive-and-shard pipeline. It builds all workspace
test binaries once from the overlaid pinned source, verifies the partition union, uploads the
archive, and runs four parallel `slice` shards with `--no-fail-fast`. The package, GUI, native
command, and MCP acceptance job depends on all four shards. No tests are filtered out by the shard
matrix, and the workflow still uses the default ignored-test policy from `cargo test`.

A focused baseline step runs against the pristine pinned source before overlay application. It
records the recovery test and all four known golden outcomes in the Actions log and job summary.
The step is allowed to report these known upstream failures without blocking the overlay build;
the full overlaid shards still run every test and expose every failure, so a baseline failure cannot
be silently counted as a passing Forge suite.

The exact Windows archive was checked locally with the same pinned Nextest release. It lists 6,253
tests total, of which 6,196 are runnable and 57 are ignored under the existing default policy. The
four partitions selected 1,549 tests each, with zero overlap and zero omissions. A test from the
archive was also executed successfully after workspace path remapping. The complete hosted GitHub
Actions run has not yet been started; the four known golden failures remain expected to appear in
the overlay shards until their upstream causes are fixed or an explicit baseline exception policy
is approved.

The legacy `Native DemonX Forge prototype` workflow now retains manual dispatch only. Its Linux
full-suite lane and legacy three-body GUI acceptance remain available for diagnostics; the Windows
preview workflow owns current Windows packaging and GUI/MCP acceptance. This prevents expensive
Rust suites from starting on every branch push while preserving the unique Linux and legacy checks.

Nextest documents test archiving and reuse at
https://nexte.st/docs/ci-features/archiving/ and test partitioning at
https://nexte.st/docs/ci-features/partitioning/. GitHub Actions documents matrix concurrency and
failure behavior at https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax.

## Native Windows/Linux matrix result

Run [40022934701](https://github.com/pricklyguy/DemonX-Forge/actions/runs/40022934701) used the
`windows-latest` and `ubuntu-24.04` runners with software GPU required. Both jobs checked out the
same pinned source, passed the Forge MCP protocol tests, type-check, source pin/overlay anchors,
and overlay application before entering the full Rust engine/UI suite.

On Ubuntu, the long-running 1,962-test engine binary completed: **1,956 passed, 0 failed, 6
ignored** in 4,304.49 seconds (71m 44s). Seeds 13, 23, 36 and 67 all passed in that binary. The
workspace test command then entered another binary with three UI tests. The test log still showed
all three running at job cancellation, so this is not a completed full workspace suite.

Both jobs hit the 120-minute job limit. On Windows, the full test step was cancelled before a
final cargo result was logged. Its native build, branding check, GUI scenario, and screenshot
packaging did not run. GitHub did not expose a downloadable Windows job log after cancellation,
so this run does not provide a Windows test total or a complete list of Windows failures. The
focused Windows differential run remains the reliable evidence for the five named tests: the
recovery test passes pristine and overlaid, and the four golden tests fail identically pristine
and overlaid.

The four goldens are not uniformly failing upstream assertions: they pass in the Ubuntu engine
test binary, while the local Windows build and focused Windows CI baseline reproduce the geometry
differences. Seeds 23 and 67 are Windows environment or platform expectation sensitivity pending
deterministic input capture, rather than generalized upstream failures. Seed 13 is a material
geometry drift on Windows, with a valid final body and changed face/edge topology counts. Seed 36
is a safe Boolean refusal on Windows for a valid multi-shell target; it preserves the preceding
valid body. Both pass on Ubuntu, so these are platform-path robustness concerns in the pinned
engine, and no Forge overlay regression was found.

### Runtime and coverage decision

The previous full Windows and Linux jobs both hit their 120-minute limits. The Windows native
preview workflow now uses a 4-shard archive design, with complete test identity union verification
and a pristine baseline comparison for the five focused regressions. Linux full-suite coverage
remains available by manually dispatching the legacy prototype workflow; its automatic push trigger
was removed. No test was skipped, tolerance changed, or golden regenerated.

The focused and local shard checks do not substitute for the hosted Windows Actions run. That run
must execute every test, report its shard totals and baseline comparison, and show the expected
upstream failures clearly. Package, GUI/MCP, signing, publishing, and release installation remain
downstream of those outcomes; no release workflow is enabled by this strategy.
