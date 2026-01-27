# Compiled Task Prompts

This directory contains fully-filled, copy/paste-ready prompts for all tasks in the Project Pulse queue.

## Overview

Each prompt is ready to be copied and pasted directly into GitHub Copilot Agent. All placeholders have been replaced with actual values from `agentprompts/QUEUE.yml`.

**Branch:** `copilot-queue-tasks`  
**Base Branch:** `main`  
**Total Tasks:** 14

---

## Tasks by Phase

### Critical Security Fixes

- **[SEC-001](SEC-001.md)** - Add workingDir Path Validation

### High Priority Data Integrity

- **[INT-001](INT-001.md)** - Fix ID Collision in Delegation Requests
- **[INT-002](INT-002.md)** - Fix Daemon Race Condition on Start

### Resource Management

- **[RES-001](RES-001.md)** - Clear Force-Kill Timer on Process Exit
- **[RES-002](RES-002.md)** - Close Watcher Before Polling Fallback

### Input Validation

- **[VAL-001](VAL-001.md)** - Validate Agent Type at Runtime

### Edge Cases and Quality

- **[QUA-001](QUA-001.md)** - Improve Process Existence Check

### Testing Infrastructure

- **[TEST-001](TEST-001.md)** - Add Unit Tests for Security Fixes
- **[TEST-002](TEST-002.md)** - Add Integration Tests

### Code Quality and Linting

- **[LINT-001](LINT-001.md)** - Add ESLint Security Rules

### Documentation

- **[DOC-001](DOC-001.md)** - Improve Error Messages and Logging
- **[DOC-002](DOC-002.md)** - Add API Documentation

### CI/CD and Automation

- **[CI-001](CI-001.md)** - Setup CI/CD Pipeline
- **[CI-002](CI-002.md)** - Add Performance Tests

---

## How to Use

1. Navigate to the task you want to work on
2. Click the link to open the compiled prompt
3. Copy the entire contents of the file
4. Paste into GitHub Copilot Agent
5. Review the agent's plan before proceeding
6. Monitor execution and review all changes

## Task Order

Tasks should be executed in the order listed above. Each phase should be completed before moving to the next.

---

**Generated:** 2026-01-27  
**Queue Version:** 1.0.0
