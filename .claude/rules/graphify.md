---
description: graphify knowledge graph context — mirrors .cursor/rules/graphify.mdc (alwaysApply)
---

This project has a graphify knowledge graph at graphify-out/.

**MANDATORY: Before using Read, Grep, Glob, or Bash to explore the codebase, you MUST run graphify first:**
- `graphify query "<question>"` — scoped subgraph for any codebase or architecture question
- `graphify path "<A>" "<B>"` — dependency path between two symbols
- `graphify explain "<concept>"` — all nodes related to a concept

Query saves tokens (~200–2000 vs thousands from grep/read). **No exceptions** for "simple" tasks.

This applies to YOU and to every subagent you spawn. Include this rule explicitly in every subagent prompt that involves code exploration.

Only use Read/Grep/Glob directly when:
1. graphify has already oriented you and you need to modify or debug specific lines
2. `graphify-out/graph.json` does not exist yet

- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review when query/path/explain do not surface enough context
- After modifying code files, run `graphify update .` to keep the graph current (AST-only, no API cost)

**Claude Code enforcement:** `.claude/settings.json` PreToolUse hooks call `graphify hook-guard` (soft reminder). Prefer running query before explore regardless.

## Use the CLI, not the MCP tools

Run graphify as a **shell command** (`graphify query "…"`). Do **not** reach for `mcp__graphify__*` tools — they fail on every call with `Graph.import: serialized node is missing its key`, and rebuilding does not help.

Two unrelated tools share the name and both claim `graphify-out/graph.json`:

| | Writes/reads | Status |
|---|---|---|
| `graphify` CLI (Python, `~/.local/bin`, v0.9.23) | NetworkX node-link JSON — nodes carry `id`, edges live under `links` | **Working.** Builds the graph; every hook and `graphify update` uses it |
| `@dreamtree-org/graphify` (npm, was registered in `.mcp.json` as an MCP server) | graphology JSON — expects `key` per node and an `edges` array | **Incompatible.** Cannot read the CLI's output at all |

Verified 2026-08-06: all 3944 nodes in `graph.json` have `id` and none have `key`, so the MCP server throws before doing any work. The graph itself is healthy — the CLI queries it fine. The MCP entry has been removed from `.mcp.json` (which is gitignored, so this is per-machine: if `mcp__graphify__*` tools reappear in a session, that machine still has the npm server registered).

The Python CLI has no `--mcp` mode, so there is no MCP path to graphify here. AGENTS.md's auto-generated graphify block claims otherwise — that text ships with the tool and does not match v0.9.23.
