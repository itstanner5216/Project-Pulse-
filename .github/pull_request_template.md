## Description

<!-- Provide a clear and concise description of your changes -->

This PR implements tasks from the sequential task queue defined in `agentprompts/QUEUE.yml`.

### Tasks Completed

<!-- List the task IDs and titles from QUEUE.yml that are included in this PR -->

- [ ] **[TASK_ID]**: [Task Title]
- [ ] **[TASK_ID]**: [Task Title]
- [ ] **[TASK_ID]**: [Task Title]

### Changes Summary

<!-- Summarize the key changes made across all tasks -->

- 
- 
- 

---

## Queue Workflow Checklist

<!-- Verify that the queue workflow was followed correctly -->

### Branch and PR Management

- [ ] All work is on a single long-lived branch (not multiple feature branches)
- [ ] This PR is updating an existing branch, not creating a new one
- [ ] Branch name follows convention: `copilot-queue-tasks` or similar
- [ ] PR has been kept as draft during task execution
- [ ] PR description is updated with current progress

### Task Execution

- [ ] Tasks were executed in the order specified in QUEUE.yml
- [ ] Each task has a separate, focused commit
- [ ] Commit messages follow the suggested format from QUEUE.yml
- [ ] No unrelated changes or "improvements" were included
- [ ] Each task's acceptance criteria were met before moving to the next

### Queue File Updates

- [ ] QUEUE.yml has been updated with task statuses
- [ ] Completed tasks are marked as `status: "done"`
- [ ] Summary statistics (todo/done counts) are updated
- [ ] Any blocked tasks are documented with `blocked_reason`

### Code Quality

- [ ] All changes follow existing code style and patterns
- [ ] No TypeScript errors: `npm run type-check` passes
- [ ] No linting errors: `npm run lint` passes
- [ ] Code includes appropriate error handling
- [ ] Public functions have JSDoc/TSDoc comments

### Testing

- [ ] Unit tests added/updated for all changes
- [ ] All tests pass: `npm test` passes
- [ ] Integration tests added if applicable
- [ ] Test coverage meets task requirements (see QUEUE.yml)
- [ ] Edge cases identified in source docs are tested

### Security

- [ ] No secrets or sensitive data in commits
- [ ] Input validation added where required
- [ ] Security fixes have been verified manually
- [ ] No new security vulnerabilities introduced
- [ ] Security best practices from SECURITY.md followed

### Documentation

- [ ] README.md updated if user-facing changes
- [ ] CONTRIBUTING.md updated if workflow changes
- [ ] SECURITY.md updated if security-related changes
- [ ] Inline code comments added for complex logic
- [ ] API documentation updated if signatures changed

---

## Testing Instructions

<!-- Describe how reviewers can test your changes -->

### Prerequisites

```bash
# Install dependencies if needed
npm install
```

### Run Tests

```bash
# Run all tests
npm test

# Run linting
npm run lint

# Run type checking
npm run type-check
```

### Manual Testing

<!-- Describe any manual testing steps if applicable -->

1. 
2. 
3. 

---

## Screenshots / Outputs

<!-- If applicable, add screenshots or command outputs showing the changes work -->

<details>
<summary>Test Output</summary>

```
[Paste test run output here]
```

</details>

---

## Source Documentation

<!-- Link to the source documents that informed these tasks -->

- Reviewed: `SECURITY.md`
- Task Details: `agentprompts/QUEUE.yml`

---

## Dependency Information

<!-- If you added, updated, or removed dependencies -->

### Added Dependencies

- None / List any new dependencies

### Updated Dependencies

- None / List any updated dependencies

### Security Audit

```bash
# Run dependency audit
npm audit
```

- [ ] No high or critical vulnerabilities
- [ ] All vulnerabilities documented and justified

---

## Breaking Changes

<!-- List any breaking changes -->

- [ ] No breaking changes

OR

- Breaking change 1: [Description and migration guide]
- Breaking change 2: [Description and migration guide]

---

## Rollback Plan

<!-- Describe how to rollback these changes if needed -->

To rollback this PR:

```bash
git revert [commit-range]
# Or
git checkout [previous-commit]
```

Specific considerations:
- 
- 

---

## Additional Context

<!-- Add any other context about the PR here -->

### Blockers Encountered

- None / List any tasks that were blocked and why

### Follow-up Tasks

<!-- Any new tasks that should be added to QUEUE.yml based on this work -->

- None / List any new tasks discovered

### Questions for Reviewers

<!-- Specific things you want reviewers to focus on -->

- 
- 

---

## Review Checklist for Reviewers

### Code Review

- [ ] Code changes are minimal and focused on the specified tasks
- [ ] Implementation matches acceptance criteria from QUEUE.yml
- [ ] No obvious bugs or logic errors
- [ ] Error handling is appropriate
- [ ] Code follows repository conventions

### Security Review

- [ ] Input validation is present where needed
- [ ] No security vulnerabilities introduced
- [ ] Security fixes are implemented correctly
- [ ] No sensitive data exposed

### Testing Review

- [ ] Tests are comprehensive and cover edge cases
- [ ] Tests pass locally
- [ ] Test quality is high (not just coverage)
- [ ] Integration tests verify end-to-end behavior

### Documentation Review

- [ ] Code is well-commented where needed
- [ ] Public APIs are documented
- [ ] User-facing changes are documented
- [ ] QUEUE.yml updates are accurate

---

## Related Issues

<!-- Link to related issues if any -->

Fixes #
Relates to #
Blocks #

---

## Deployment Notes

<!-- Any special considerations for deployment -->

- [ ] No special deployment steps needed

OR

Deployment considerations:
- 
- 

---

## Post-Merge Actions

<!-- Things to do after this PR is merged -->

- [ ] Update QUEUE.yml in main branch if not already included
- [ ] Move to next task in queue
- [ ] Create follow-up tasks for any discovered issues
- [ ] Update project documentation if needed

---

<!-- 
Thank you for following the queue workflow! 
For questions, see: agentprompts/RUNBOOK.md
-->
