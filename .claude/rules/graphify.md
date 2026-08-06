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

## Local setup (verified 2026-08-06)

Two unrelated tools share the name `graphify` and both claim `graphify-out/graph.json`:

| | Format | Status |
|---|---|---|
| **`graphifyy`** (Python, installed via `uv tool`, v0.9.23) — ships `graphify` **and** `graphify-mcp` | NetworkX node-link JSON: nodes carry `id`, edges under `links` | **This is ours.** It builds the graph; every hook and `graphify update` uses it |
| `@dreamtree-org/graphify` (npm) | graphology JSON: needs `key` per node and an `edges` array | **Incompatible** — cannot read our graph at all |

The npm package was previously registered as the MCP server, so every `mcp__graphify__*` call failed with `Graph.import: serialized node is missing its key`. The graph was never corrupt (all 3944 nodes had `id`, none had `key`); rebuilding could not have helped. `.mcp.json` now points at the Python `graphify-mcp` instead.

Its tool names differ from the npm server's: `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`. There is no `explain` / `affected` / `context` tool over MCP — use the CLI for those.

### Two optional extras this project needs

```bash
uv tool install "graphifyy[sql]==0.9.23" --with "mcp<2" --force
```

- **`[sql]`** — without it, all 20+ files under `supabase/migrations/**` contribute **zero** nodes and the graph silently omits every RLS policy, trigger and RPC. The warning is easy to miss and queries just return nothing. With it: 122 SQL nodes, and `graphify explain "public.accept_workspace_invite"` resolves to the migration and line.
- **`mcp<2`** — `graphify-mcp` targets the 1.x MCP SDK. Installing plain `[mcp]` pulls SDK 2.0, which moved `mcp.types` from a module to a package and dropped `AnyUrl`, so the server crashes on start with `ImportError: cannot import name 'AnyUrl'`.

The CLI remains the primary interface and is what the rules above mandate; MCP is a convenience on top of the same graph.
