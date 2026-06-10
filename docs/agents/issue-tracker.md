# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Ralph loop

How the Ralph orchestrator (`orchestrate-ralph` skill) does each of its
operations against this tracker. All operations use the `gh` CLI.

- **Discover** — `gh issue list --label ready-for-agent --state open --json number,title,body,labels`.
  A candidate is any open issue carrying the `ready-for-agent` label.
- **Read** — `gh issue view <number> --json title,body,comments`. The
  issue is its body plus its comments — prior-attempt failure notes are
  comments.
- **Dependencies** — declared as a `**Blocked by:** #N, #M` line in the issue
  body. This repo does **not** use GitHub's native issue dependencies — the
  `repos/.../issues/<n>/dependencies/blocked_by` API returns empty; the body
  line is the convention. It is reliably machine-readable, so this tracker is
  **`parallel-safe`**. An issue is *eligible* only when every issue blocking it
  carries the `done` label (closing is the user's call; the label is the
  canonical completion marker the loop writes).
- **Feature grouping** — the feature is the issue's `feature/*` label (or
  its milestone). Issues with no feature label are each their own group.
  Prefer a wave spread across distinct features.
- **Transition** — on success:
  `gh issue edit <number> --remove-label ready-for-agent --add-label done`.
  When wrong or infeasible:
  `--remove-label ready-for-agent --add-label needs-info`. Whether `done`
  also closes the issue is the user's call; only the label is set.
- **Comment** — write the note to a worktree-local tempfile first
  (e.g. `.ralph/comment-body.tmp`), then
  `gh issue comment <number> --body-file <path>`. Do not pass the note via
  `--body "<note>"`: worker `reasonText` may contain `"`, `$`, backticks,
  `*`, or `;` that either break the shell or trip the matcher's
  literal-`$` / unescaped-`*` denials.
