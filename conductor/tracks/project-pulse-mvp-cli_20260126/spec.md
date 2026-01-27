# Spec: MVP CLI — Deterministic context pack + search + Merkle change detection

## Summary
Build the first usable Project Pulse MVP centered on a CLI that provides **IDE-like capabilities** to agents and developers with **maximum information, minimal context injection**. The MVP must be **offline-first**, deterministic, budget-capped, and safe-by-default, while laying hooks/interfaces for **cloud retrieval (Vertex embeddings + retrieval)** and **local caching**.

## Goals
- Provide a usable CLI that can:
  - Generate a **budget-capped deterministic context pack** (“briefing”).
  - Perform deterministic **repo search** (keyword; structural where possible).
  - Compute and report **change deltas** (added/modified/deleted) without requiring git.
- Output format: **human-readable text by default**, with a **`--json`** mode for deterministic machine output.
- Enforce **safety guardrails**:
  - Respect `.gitignore` (avoid scanning ignored heavy directories like `node_modules`).
  - Prevent unsafe path access (no absolute paths, no traversal outside root).
  - Secrets-aware defaults (avoid printing/uploading obvious secret files unless explicitly requested).
- Maintain **context hygiene**: do not emit huge dumps; prefer capped packs and explicit drilldown commands.

## Non-Goals (for this track)
- Building a full TUI, web UI, or IDE plugin UI.
- Full production hardening of cloud ingestion pipelines (implemented later), beyond minimal interfaces/hooks.
- Full language-accurate symbol indexing for every language (start with a pragmatic subset and deterministic behavior).

## Users
- AI agents and coding assistants operating in CLI workflows.
- Developers (including "vibe coders") who want fast repo awareness.
- Tech leads/DevEx who want deterministic, scriptable project intelligence.

## Functional Requirements

### FR1 — CLI entrypoint and command structure
- Provide a `project-pulse` CLI (exact binary name may be finalized later) with subcommands:
  - `brief` (generate context pack)
  - `search` (keyword search and optionally structural search)
  - `changes` (Merkle-based change detection)
  - `file head|show|grep` (safe drilldowns)
- Each command supports:
  - `--json` to output deterministic machine JSON.
  - sensible defaults for human-readable output.

### FR2 — Deterministic context pack (“brief”)
- Generate a structured pack including (all budget-capped):
  - directory tree (bounded depth/lines)
  - key files (manifests/config/readme/entrypoints)
  - entrypoints heuristics
  - hotspots (e.g., TODO/FIXME counts)
  - recent changes (mtime-based as git-independent fallback)
- Pack must be deterministic for the same repository state.

### FR3 — Deterministic search
- Keyword search using local tools where available (e.g., `rg`).
- Optional structural search where available (e.g., `ast-grep`).
- Output normalized to stable structures (file, line, snippet/match), deterministically ordered.

### FR4 — Merkle-based change detection (git independent)
- Compute a Merkle snapshot of the repo state (respecting ignore rules).
- Provide `changes` output: added/modified/deleted since last snapshot.
- Deterministic hashing behavior for identical inputs.

### FR5 — Safe file drilldowns
- `file head|show|grep` must:
  - only operate on paths within the repo root
  - reject absolute paths and traversal
  - respect ignore rules (or require explicit `--force` to view ignored content)

### FR6 — Caching hooks
- Local caching hooks for expensive operations (e.g., computed pack, merkle snapshot).
- Interfaces/hooks for future cloud retrieval:
  - stubs/interfaces for embedding generation and retrieval queries
  - no requirement to fully wire production cloud ops in this track

## Non-Functional Requirements
- Deterministic JSON structures with stable ordering in `--json` mode.
- Budget caps for “brief” (e.g., max bytes/lines) with clear truncation semantics.
- Security by default: avoid secret leakage; safe path handling.
- Offline-first: core commands operate without internet.

## Acceptance Criteria
- A user can run:
  - `project-pulse brief` and get a capped, high-signal output.
  - `project-pulse brief --json` and parse deterministic JSON.
  - `project-pulse search "<query>"` with deterministic results.
  - `project-pulse changes` to see deltas since last snapshot.
  - `project-pulse file head <path>` safely.
- `.gitignore` is respected in scanning/searching to avoid token-heavy irrelevant directories.
- Outputs do not “dump the world”; they remain bounded and drilldown-driven.

## Open Questions
- Final CLI name (`ProjectPulse` vs `project-pulse`) and package name.
- Exact budget defaults (max bytes/lines per command) and how users override them.
- Which local cache backend to start with (filesystem cache vs sqlite vs embedded kv).
- Which Vertex AI auth approach to standardize for optional cloud mode.
