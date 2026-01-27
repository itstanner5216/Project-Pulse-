# Tech Stack — Project Pulse

## Primary Implementation Language (v1)
- **TypeScript (Node.js)**

### Rationale
- Best fit for delivering multiple interaction surfaces over time (CLI/TUI, MCP/server mode, web UI, IDE integrations).
- Strong ecosystem for:
  - CLI tooling and distribution via npm
  - structured JSON I/O and schema validation
  - terminal UIs
  - HTTP servers (for MCP/web)
- Still allows use of best-in-class local tools by shelling out to them (e.g., **ripgrep**, **ast-grep**) while preserving deterministic output.

## Supporting/External Tooling (Local)
- **ripgrep (rg)**: fast keyword search
- **ast-grep**: structural/syntax-aware search where available
- **git (optional)**: repository presence only; Project Pulse should not require Git for core change detection

## Output & Interop
- **Deterministic JSON** output as the primary interface contract across CLI/TUI/MCP.

## Cloud (Optional for Users, Required to Build)
- **Google Vertex AI** (context caching / embeddings / enrichment) — implemented but user-configurable.

## Notes
- Project Pulse should be able to analyze projects written in many languages (e.g., Bash, JS/TS, Go, Python, Rust, Java), but the **Project Pulse implementation** will be primarily TypeScript/Node.js in v1.
