# Plan: MVP CLI — Deterministic context pack + search + Merkle change detection

## Phase 1 — Project skeleton, CLI contract, and test harness
- [ ] Task: Initialize TypeScript/Node project skeleton for CLI
  - [ ] Add package scaffolding (tsconfig, lint/test baseline)
  - [ ] Define CLI command surface (`brief`, `search`, `changes`, `file head|show|grep`) and `--json` convention
- [ ] Task: Establish deterministic JSON envelope/schema for `--json` outputs
  - [ ] Write Tests: JSON output has stable keys and ordering rules (or canonicalization)
  - [ ] Implement Feature: JSON envelope helper and deterministic sorting utilities
- [ ] Task: Establish `.gitignore`-aware file enumeration utility
  - [ ] Write Tests: ignored paths excluded; non-ignored included
  - [ ] Implement Feature: ignore-aware walker (gitignore parser)
- [ ] Task: Conductor - User Manual Verification 'Phase 1 — Project skeleton, CLI contract, and test harness' (Protocol in workflow.md)

## Phase 2 — Briefing pack (budget-capped, deterministic)
- [ ] Task: Implement `brief` context pack generator
  - [ ] Write Tests: pack sections exist; budgets enforced; deterministic ordering
  - [ ] Implement Feature: build tree/key files/entrypoints/hotspots/recent-changes pack
- [ ] Task: Implement local caching for `brief` output
  - [ ] Write Tests: cache hit returns same result; cache invalidates on repo change signature
  - [ ] Implement Feature: filesystem cache keyed by repo signature
- [ ] Task: Conductor - User Manual Verification 'Phase 2 — Briefing pack (budget-capped, deterministic)' (Protocol in workflow.md)

## Phase 3 — Search (keyword + structural where available)
- [ ] Task: Implement deterministic keyword search command
  - [ ] Write Tests: normalized results; stable ordering; respects ignore rules
  - [ ] Implement Feature: shell out to `rg` with fallback; normalize output
- [ ] Task: Implement optional structural search integration
  - [ ] Write Tests: when ast-grep present, results are normalized and deterministic
  - [ ] Implement Feature: detect `ast-grep` and route structural queries
- [ ] Task: Conductor - User Manual Verification 'Phase 3 — Search (keyword + structural where available)' (Protocol in workflow.md)

## Phase 4 — Merkle snapshot + change detection
- [ ] Task: Implement repo hashing and Merkle snapshot
  - [ ] Write Tests: same repo state => same root; ignore rules applied
  - [ ] Implement Feature: hash leaves and compute Merkle root; persist snapshot
- [ ] Task: Implement `changes` command output (added/modified/deleted)
  - [ ] Write Tests: added/modified/deleted detection works across fixture changes
  - [ ] Implement Feature: diff current index vs last snapshot
- [ ] Task: Conductor - User Manual Verification 'Phase 4 — Merkle snapshot + change detection' (Protocol in workflow.md)

## Phase 5 — Safe drilldowns and cloud-ready interfaces
- [ ] Task: Implement safe path resolution and `file` subcommands
  - [ ] Write Tests: reject traversal/absolute; allow in-root files; optional force for ignored
  - [ ] Implement Feature: path resolver + head/show/grep outputs (json+text)
- [ ] Task: Define cloud retrieval interfaces (stubs)
  - [ ] Write Tests: interfaces accept inputs and return deterministic placeholders when unconfigured
  - [ ] Implement Feature: Vertex embeddings/retrieval adapter boundaries + config plumbing (no full production wiring)
- [ ] Task: Conductor - User Manual Verification 'Phase 5 — Safe drilldowns and cloud-ready interfaces' (Protocol in workflow.md)
