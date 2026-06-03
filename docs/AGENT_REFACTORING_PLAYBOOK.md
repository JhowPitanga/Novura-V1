# Agent Refactoring Playbook — Novura

> **Operating procedure for AI sub-agents (Cursor / Claude Code) that refactor this
> codebase.** It tells an agent *how to behave* during a refactor so the result is small,
> reviewable, behavior-preserving, and safe to merge.
>
> This document is the **process**. The **rules** of good code are in
> [CONVENTIONS.md](./CONVENTIONS.md) (esp. §14 Refactoring) and the **size limits** are in
> [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) (esp. §1). The list of targets and
> phases is in [`REFACTORING_PLAN.md`](../REFACTORING_PLAN.md).

---

## 0. Read this first (context-loading rule)

A sub-agent does **not** inherit the main conversation, and exploration/planning agents
often do **not** even load `CLAUDE.md`. Therefore, whoever delegates a refactor task
**must restate the critical invariants in the delegation prompt**, and the sub-agent must
load these three files before touching code:

1. `docs/CONVENTIONS.md §14` — how to refactor.
2. `docs/ENGINEERING_STANDARDS.md §1` — size limits and the "when NOT to split" rule.
3. The feature's current code (use the Explore phase below).

If any invariant in this playbook conflicts with a delegation prompt, **stop and ask** —
do not guess.

---

## 1. The non-negotiable invariants

These hold for every refactor in this repo. Breaking any one is a failed task.

| # | Invariant |
|---|---|
| I1 | **Behavior-preserving.** No feature, bug fix, or visual/CSS change in a refactor commit. `refactor` ≠ `feat`/`fix`. |
| I2 | **No public-contract change** unless explicitly authorized: URL routes, exported function signatures, component props consumed by other features, DB schema, RPC signatures. |
| I3 | **UI strings stay Portuguese; identifiers become/stay English** (`CONVENTIONS.md §9`). |
| I4 | **No `supabase.from(...)` outside `services/`** after the refactor (`ENGINEERING_STANDARDS §7`). |
| I5 | **No `useState`+`useEffect` for server data** — TanStack Query (`CONVENTIONS.md §6`). |
| I6 | **No `any`, no silent `catch(e) {}`, no magic strings** (`ENGINEERING_STANDARDS §7`). |
| I7 | **`npm run build` and `npm run lint` pass** before declaring done. Tests, if present, pass. |
| I8 | **Diff stays small and reversible.** One responsibility per commit; `git revert <sha>` must undo it cleanly. |

---

## 2. The workflow: Explore → Plan → Approve → Execute → Self-check → Hand off

Adapted from the agent-rails pattern (intent → boundaries → invariants → approval →
implementation → self-check → review). Each phase has a distinct tool profile.

```
Explore (read-only) ─► Plan (read-only) ─► [HUMAN APPROVAL] ─► Execute (write) ─► Self-check ─► Hand off
```

### Phase 1 — Explore (read-only)

**Tools:** Read, Grep, Glob, SemanticSearch only. **No Write, no destructive Bash.**

Goal: understand the unit before changing it. Produce a short map, not a code change.

- Find every consumer of the file/symbols (Grep for imports, usages).
- List every `supabase.from`/`.rpc` call, every `useState`/`useEffect`, every inline
  helper, every prop the component receives.
- Identify the **distinct responsibilities** currently tangled in the file.
- Note existing tests (or their absence).

Output of this phase = a "context snapshot": ≤ 1 page describing what the file does,
who depends on it, and the seams where it can be split.

### Phase 2 — Plan (read-only)

**Tools:** read-only (same as Explore).

Write a **Change Intent** before any edit. It must contain:

```
INTENT:      what structural change, in one sentence (no "and").
TARGET:      file(s) to be refactored.
BOUNDARY:    the exact set of files allowed to change. Nothing outside it.
INVARIANTS:  which of I1–I8 are most at risk here, and how they'll be preserved.
NON-GOALS:   what this refactor explicitly will NOT do (e.g. "no bug fixes").
DECOMPOSITION: the new files/hooks/services and the ONE responsibility of each.
TESTS:       characterization tests to add before moving code.
ROLLBACK:    how to revert (commit boundary).
```

Decompose **by responsibility, not visual structure** (`CONVENTIONS.md §14.2`). If a
planned sub-component would need >5 handler props, the split axis is wrong — re-plan.

### Phase 3 — Human approval gate

For any **non-trivial** refactor (god page/hook, cross-cutting rename, anything touching
>3 files), the Change Intent is presented for human approval before execution. The human
may approve, narrow the boundary, or reject. Trivial, single-file extractions inside an
already-approved phase of `REFACTORING_PLAN.md` may skip this gate.

### Phase 4 — Execute (write, inside the boundary only)

**Tools:** Read, Write/Edit, Bash (build/lint/test). Edits **only** to files in BOUNDARY.

Follow the data-flow-first order (`CONVENTIONS.md §14.3`):

1. Write the characterization test(s) → run, confirm they pass against current code.
2. Extract services (`supabase` calls) → run build.
3. Migrate to TanStack Query → run build.
4. Extract pure utils → run build.
5. Split the god hook into domain hooks → run build.
6. Extract presentational sub-components → run build.

**Commit after each step**, not at the end. Small commits = reversible.

If you discover you must touch a file outside BOUNDARY, **stop**: either it belongs in
the boundary (update the Change Intent) or it is a separate task. Do not silently expand
scope.

### Phase 5 — Self-check (before hand off)

Run the [Definition of Done](#3-definition-of-done) checklist. Then diff your work
against the **INTENT**: every change must trace to the intent; anything that does not is
scope creep and must be removed or justified.

### Phase 6 — Hand off

Produce a compact summary for the human reviewer / parent agent:

- What changed and why (link to Change Intent).
- Before/after: file count, largest file LOC, `dpdm` cycle count.
- Build/lint/test status.
- Any deliberate size-limit exceptions (`ENGINEERING_STANDARDS §1.2`) and why.
- Anything found-but-not-fixed (bugs, debt) as follow-up items.

Return a **summary**, not the full diff — the reviewer reads the diff in git.

---

## 3. Definition of Done

A refactor task is done only when **all** are true:

- [ ] No function body > 50 lines; no service/hook/util file > 150 lines; no page > 200
      lines — or each exception is documented (`ENGINEERING_STANDARDS §1`).
- [ ] Decomposition is by responsibility; no sub-component needs > 5 handler props.
- [ ] No `supabase.from(...)` in components or hook bodies (only in `services/`).
- [ ] No `useState`+`useEffect` server fetching; uses TanStack Query with co-located keys.
- [ ] No `any`, no silent `catch(e) {}`, no magic strings.
- [ ] Identifiers English; UI strings unchanged (still Portuguese).
- [ ] URL routes, public signatures, DB/RPC contracts unchanged (unless authorized).
- [ ] `npm run build` passes. `npm run lint` passes. Tests pass.
- [ ] `npx dpdm src/` circular-dependency count did **not** increase.
- [ ] Each commit is `refactor(<scope>): ...`, single-responsibility, revertible.
- [ ] Self-check done: every change traces to the approved Change Intent.

---

## 4. Tool & permission profiles (least privilege)

Grant each agent only what its phase needs. This is enforceable via Cursor subagent
config or Claude Code `.claude/agents/*.md` frontmatter (`tools:` allowlist).

| Agent role | Allowed tools | Forbidden |
|---|---|---|
| **refactor-explorer** | Read, Grep, Glob, SemanticSearch | Write, Edit, destructive Bash |
| **refactor-planner** | Read, Grep, Glob, SemanticSearch | Write, Edit |
| **refactor-executor** | Read, Write/Edit, Bash (build/lint/test) | Edits outside BOUNDARY; `git push --force`; schema/migration changes |
| **refactor-reviewer** | Read, Grep, Glob, Bash (build/lint/test) | Write, Edit |

A research/exploration agent that does not need Write **must not have Write**.

---

## 5. Parallel refactors — isolation

When several independent modules are refactored at once (fan-out), each executor must run
in its **own git worktree** so concurrent edits do not collide:

- Cursor: use the `best-of-n-runner` / isolated worktree mechanism.
- Claude Code: set `isolation: worktree` in the subagent frontmatter.

Rules for fan-out:

- Partition by feature folder; **boundaries must not overlap**. Two agents must never be
  authorized to edit the same file.
- Each agent returns only a **summary** to the orchestrator (not full file contents).
- The orchestrator integrates, runs the full build/lint, and resolves the (rare) shared
  edits (e.g. `App.tsx` lazy imports) itself, serially.

---

## 6. Delegation prompt template

Copy-paste this when spawning a refactor sub-agent. Fill every field.

```
You are a refactoring sub-agent for the Novura ERP (React 18 + TS + Vite + Supabase).

REQUIRED READING (load before editing):
- docs/CONVENTIONS.md §14 (how to refactor)
- docs/ENGINEERING_STANDARDS.md §1 (size limits, when NOT to split)
- docs/AGENT_REFACTORING_PLAYBOOK.md (this process)

TASK: <one-sentence structural change, no "and">
TARGET FILE(S): <paths>
BOUNDARY (only files you may edit): <explicit list>
NON-GOALS: no behavior/feature/bug-fix/visual change; do not touch files outside BOUNDARY.

INVARIANTS (restated because you do not inherit CLAUDE.md):
- Behavior-preserving refactor only.
- UI text stays Portuguese; code identifiers English.
- No supabase.from outside services/; no useState+useEffect for server data; no `any`.
- URL routes and public/exported signatures must not change.
- npm run build AND npm run lint must pass before you finish.

PROCESS:
1. Explore (read-only) → 2. Write a Change Intent → 3. Execute data-flow-first,
   committing after each step → 4. Run the Definition of Done checklist
   (docs/AGENT_REFACTORING_PLAYBOOK.md §3) → 5. Return a SUMMARY, not the full diff.

If you must edit outside BOUNDARY or change any public contract: STOP and report instead.
```

---

## 7. Anti-patterns specific to agent refactors

| Anti-pattern | Why it fails | Do instead |
|---|---|---|
| Starting to edit before understanding | Touches the wrong seams; large redo | Always Explore + Change Intent first |
| Visual split (header/footer) | Children need 15 props; debt moved, not removed | Split by responsibility into hooks |
| "While I'm here" fixes | Refactor + behavior change = unreviewable diff | Note it; separate commit/PR |
| Touching unrelated files | Scope creep; hard to revert | Stay inside BOUNDARY; stop and ask |
| Mechanical cut at line 50/150 | Smaller file, same tangled responsibility | Name the distinct jobs, split those |
| One giant final commit | Not reversible; reviewer drowns | Commit per responsibility/step |
| Returning the full diff to the parent | Floods orchestrator context | Return a compact summary |
| Silently dropping a test or `// @ts-ignore` to make build pass | Hides regressions | Fix properly or stop and report |

---

## 8. Quick reference — where things live

| You need… | File |
|---|---|
| How much is too big (limits) | `ENGINEERING_STANDARDS.md §1` |
| How to decompose (rules) | `CONVENTIONS.md §14` |
| TanStack Query / service-layer patterns | `CONVENTIONS.md §6`, `ENGINEERING_STANDARDS.md §5` |
| What to refactor and in what order | `REFACTORING_PLAN.md` |
| Current state of a feature | `ARCHITECTURE.md §7` |
| How to test the refactor | `TESTING.md` |
| This process | `AGENT_REFACTORING_PLAYBOOK.md` (here) |
