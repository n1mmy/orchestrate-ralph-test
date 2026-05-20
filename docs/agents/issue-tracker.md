# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Ralph loop

The Ralph orchestrator (`orchestrate-ralph` skill) drives the issues in this
tracker. This section tells it how.

- **Discover** — issues are files at `<feature-dir>/<NN>-<slug>.md`. A wave
  candidate is any file whose `Status:` line reads `ready-for-agent`. Find
  them with the `Glob` / `Grep` tools, or — if your harness lacks them —
  `rg` / `find` as single bare `Bash` commands. Not a `cat`/`find` loop.
- **Read** — the issue is the whole file, including any notes under a
  `## Comments` heading from prior attempts.
- **Dependencies** — an optional `Blocked by:` line near the top of the file
  names the issues this one depends on. An issue is *eligible* for a wave only
  when every issue it is blocked by has `Status: done`. This is a readable
  dependency relation, so this tracker is **`parallel-safe`**.
- **Feature grouping** — the parent directory `<feature-dir>` is the feature.
  When more issues are eligible than a wave can hold, the orchestrator prefers
  a spread across distinct features.
- **Transition** — edit the `Status:` line in place: `ready-for-agent` →
  `done` on success, → `needs-info` when the issue is wrong or infeasible.
- **Comment** — append a one-to-three-line note under a `## Comments` heading
  at the end of the file.
