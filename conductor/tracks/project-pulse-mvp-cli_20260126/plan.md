# Plan: Node wrapper CLI over Bash providers — Deterministic context pack + search + Merkle

## Phase 1 — TS/Node wrapper skeleton + provider contract tests
- [ ] Task: Initialize TypeScript/Node project skeleton for wrapper CLI
  - [ ] Add package scaffolding (tsconfig, lint/test baseline)
  - [ ] Define CLI command surface (`brief`, `search`, `changes`, `file head|show|grep`) and `--json` convention
- [ ] Task: Define provider contract (JSON schemas + error envelope)
  - [ ] Write Tests: validate provider JSON envelopes and deterministic ordering against fixtures
  - [ ] Implement Feature: schema definitions + canonicalization utilities in Node
- [ ] Task: Implement provider runner (spawn Bash providers)
  - [ ] Write Tests: runner captures stdout/stderr, handles non-zero exit, returns stable error JSON
  - [ ] Implement Feature: `runProvider()` helper with timeouts and env plumbing
- [ ] Task: Conductor - User Manual Verification 'Phase 1 — Project skeleton, CLI contract, and test harness' (Protocol in workflow.md)

## Phase 2 — Wrap existing briefing provider (budget-capped, deterministic)
- [ ] Task: Implement `brief` command by calling Bash provider(s)
  - [ ] Write Tests: pack sections exist; budgets enforced; deterministic ordering
  - [ ] Implement Feature: Node `brief` command calls provider and normalizes output
- [ ] Task: Implement local caching wrapper for `brief`
  - [ ] Write Tests: cache hit returns same result; cache invalidates on repo change signature
  - [ ] Implement Feature: filesystem cache in Node keyed by repo signature (can reuse provider index/version)
- [ ] Task: Conductor - User Manual Verification 'Phase 2 — Briefing pack (budget-capped, deterministic)' (Protocol in workflow.md)

## Phase 3 — Wrap existing search provider (keyword + structural where available)
- [ ] Task: Implement `search` command via Bash provider
  - [ ] Write Tests: normalized results; stable ordering; respects ignore rules
  - [ ] Implement Feature: Node search command calls provider and normalizes output
- [ ] Task: Implement provider/tool detection reporting
  - [ ] Write Tests: output indicates which strategy/tool was used (rg/ast/grep) deterministically
  - [ ] Implement Feature: expose `strategy` field in JSON output
- [ ] Task: Conductor - User Manual Verification 'Phase 3 — Search (keyword + structural where available)' (Protocol in workflow.md)

## Phase 4 — Wrap existing Merkle provider + change reporting
- [ ] Task: Implement `changes` command via Bash merkle provider
  - [ ] Write Tests: added/modified/deleted detection works across fixture changes
  - [ ] Implement Feature: Node changes command calls provider and normalizes output
- [ ] Task: Add snapshot lifecycle command(s)
  - [ ] Write Tests: snapshot can be created/loaded deterministically
  - [ ] Implement Feature: wrap provider snapshot operations (e.g., `snapshot`, `root`)
- [ ] Task: Conductor - User Manual Verification 'Phase 4 — Merkle snapshot + change detection' (Protocol in workflow.md)

## Phase 5 — Safe drilldowns and cloud-ready interfaces
 - [ ] Task: Implement safe path resolution and `file` subcommands via provider or Node
   - [ ] Write Tests: reject traversal/absolute; allow in-root files; optional force for ignored
   - [ ] Implement Feature: path resolver + head/show/grep (can call provider or implement natively)
 - [ ] Task: Define cloud retrieval interfaces (stubs) with CI-safe behavior
   - [ ] Write Tests: when cloud not configured, tests skip or return deterministic stubs (no metadata server calls)
   - [ ] Implement Feature: Vertex embeddings/retrieval adapter boundaries + config plumbing (no full production wiring)
- [ ] Task: Conductor - User Manual Verification 'Phase 5 — Safe drilldowns and cloud-ready interfaces' (Protocol in workflow.md)
