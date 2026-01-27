# Product Guidelines — Project Pulse

## Voice & Tone
- **Direct & technical** by default.
  - Prioritize clarity over personality.
  - Use precise terms (e.g., “deterministic”, “budget-capped”, “offline-first”).
  - Avoid ambiguous language when reporting actions, results, or errors.

## Writing Style
- Short sentences; avoid fluff.
- Prefer active voice (“Project Pulse generated…”, “Run `...` to…`).
- Use consistent terminology across CLI/TUI/WUI/IDE integrations.
- When presenting structured output, name fields explicitly and keep ordering stable.

## UX Copy Principles
- **Big information, small context**: present summaries first; provide drilldowns via explicit commands.
- Every user-visible operation should communicate:
  - what happened,
  - what was skipped (and why),
  - how to get more detail.

## Error & Warning Guidelines
- Errors must be actionable:
  - include the failing command/action,
  - include a stable error code where possible,
  - suggest next steps.
- Prefer safe defaults:
  - do not read or transmit sensitive files by default,
  - honor ignore rules,
  - validate paths and prevent traversal.

## Product Consistency Across Interfaces
- Ensure CLI/TUI/MCP outputs share a common schema and naming.
- JSON output should remain machine-friendly; human-friendly formatting should be opt-in.

## Documentation Guidelines
- Provide “Why” before “How” for major features (determinism, budgets, ignore rules).
- Include minimal examples for common workflows:
  - generate briefing pack,
  - search,
  - drill down into a file,
  - view changes.
