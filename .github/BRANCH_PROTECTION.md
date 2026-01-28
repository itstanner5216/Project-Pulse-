# Branch Protection Configuration Guide

This document provides instructions for configuring GitHub branch protection rules to ensure all CI/CD checks pass before code can be merged.

## Purpose

Branch protection rules enforce quality gates by requiring all automated checks to pass before pull requests can be merged. This prevents broken code, security vulnerabilities, and failing tests from entering the main branch.

## Prerequisites

- Repository admin access
- GitHub Actions workflows configured (already done)
- Understanding of your team's approval requirements

## Configuration Steps

### Step 1: Access Branch Protection Settings

1. Go to your GitHub repository
2. Click **Settings** (requires admin access)
3. In the left sidebar, click **Branches**
4. Under "Branch protection rules", click **Add rule** or **Edit** if a rule for `main` exists

### Step 2: Configure Basic Protection

**Branch name pattern:** `main`

Enable the following settings:

#### Require Pull Request Reviews
- ✅ **Require a pull request before merging**
  - Number of required approvals: `1` (recommended, adjust as needed)
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners (optional, if CODEOWNERS file exists)

#### Require Status Checks
- ✅ **Require status checks to pass before merging**
- ✅ **Require branches to be up to date before merging**

### Step 3: Select Required Status Checks

In the "Status checks that are required" section, search for and select all of the following:

#### From `lint-typecheck.yml` workflow:
- ✅ `ESLint Security Check` - Ensures code passes security linting rules
- ✅ `TypeScript Type Check` - Verifies type safety
- ✅ `Build Check` - Confirms the project builds successfully

#### From `test.yml` workflow:
- ✅ `Unit Tests` - Ensures all unit tests pass
- ✅ `Integration Tests` - Verifies integration test suite passes

#### From `codeql.yml` workflow:
- ✅ `CodeQL Analysis` - Security vulnerability scanning

#### From `dependency-audit.yml` workflow:
- ✅ `NPM Security Audit` - Checks for vulnerable dependencies
- ✅ `License Compliance Check` - Verifies license compliance

> **Note:** Status checks will only appear in the list after they have run at least once. Create a test PR to trigger all workflows if they don't appear yet.

### Step 4: Additional Recommended Settings

Enable these additional protections:

- ✅ **Require conversation resolution before merging**
  - Ensures all review comments are addressed

- ✅ **Require signed commits** (optional but recommended for security)
  - Ensures commit authenticity

- ✅ **Include administrators**
  - Applies rules to repository administrators as well
  - Prevents accidental bypass of quality gates

- ✅ **Restrict who can push to matching branches**
  - Only allow specific teams/people to push directly
  - Most users should only be able to merge via approved PRs

- ✅ **Allow force pushes: Disabled**
  - Prevents rewriting history on protected branch

- ✅ **Allow deletions: Disabled**
  - Prevents accidental deletion of main branch

### Step 5: Save and Verify

1. Click **Create** (or **Save changes** if editing)
2. Create a test pull request to verify:
   - All required checks run automatically
   - Merge button is blocked until checks pass
   - Status checks are clearly visible in the PR

## Verification Checklist

After configuring branch protection, verify:

- [ ] Cannot merge PR without required status checks passing
- [ ] Cannot merge PR without required approvals
- [ ] All 9 required status checks appear on PRs
- [ ] Administrators are subject to the same rules (if enabled)
- [ ] Force push is disabled on main branch
- [ ] Branch cannot be deleted

## Status Checks Matrix

| Check Name | Workflow File | Purpose | Failure Impact |
|------------|---------------|---------|----------------|
| ESLint Security Check | lint-typecheck.yml | Code quality & security linting | High - Security issues |
| TypeScript Type Check | lint-typecheck.yml | Type safety verification | High - Type errors |
| Build Check | lint-typecheck.yml | Build success verification | Critical - Code won't compile |
| Unit Tests | test.yml | Unit test validation | High - Broken functionality |
| Integration Tests | test.yml | End-to-end test validation | High - Integration issues |
| CodeQL Analysis | codeql.yml | Security vulnerability scan | Critical - Security vulnerabilities |
| NPM Security Audit | dependency-audit.yml | Dependency security | High - Vulnerable dependencies |
| License Compliance Check | dependency-audit.yml | License compliance | Medium - Legal compliance |

## Troubleshooting

### Status Checks Don't Appear

**Problem:** Required status checks are not visible in the dropdown.

**Solution:**
1. Create a test PR to trigger all workflows
2. Wait for workflows to complete
3. Return to branch protection settings
4. Refresh the page
5. Status checks should now appear in the searchable list

### Can't Merge Even Though Checks Pass

**Problem:** Merge button is disabled despite all checks passing.

**Possible causes:**
1. **Not up to date:** PR branch is behind the base branch
   - Solution: Click "Update branch" button
2. **Pending reviews:** Required approvals not met
   - Solution: Request and receive required reviews
3. **Unresolved conversations:** Review comments not resolved
   - Solution: Resolve all conversations
4. **Administrator bypass disabled:** Even admins can't bypass
   - Solution: Wait for checks or temporarily disable rule

### Checks Failing in CI but Pass Locally

**Problem:** Tests/linting pass locally but fail in CI.

**Common causes:**
1. Different Node.js versions
   - Solution: Use Node.js 18 (specified in workflows)
2. Different dependencies
   - Solution: Use `npm ci` instead of `npm install`
3. Environment differences
   - Solution: Check environment variables
4. Uncommitted changes
   - Solution: Ensure all changes are committed

### Want to Bypass for Emergency Fix

**Problem:** Need to merge urgent fix but checks are failing.

**Options:**
1. **Fix the checks** (strongly recommended)
   - Identify and fix the failing check
   - Wait for checks to pass
2. **Temporary disable** (admin only, use with caution)
   - Go to Settings → Branches
   - Edit the branch protection rule
   - Temporarily uncheck "Require status checks"
   - Merge the PR
   - **Immediately re-enable the rule**
3. **Use a hotfix branch** (if `main` allows force push from specific users)
   - Only if critical production issue
   - Must be reviewed after the fact

> ⚠️ **Warning:** Bypassing checks should be extremely rare and only for critical production issues.

## Enforcement Best Practices

1. **Train the team:** Ensure everyone understands the CI/CD workflow
2. **Monitor failures:** Review why checks fail to improve code quality
3. **Keep checks fast:** Slow checks frustrate developers
4. **Be consistent:** Don't bypass rules except in true emergencies
5. **Update regularly:** Review and update rules as project evolves

## Adding New Required Checks

When adding new workflows that should block merges:

1. Create and test the new workflow
2. Ensure it runs on `pull_request` events
3. Verify the workflow completes successfully at least once
4. Go to branch protection settings
5. Add the new check to the required status checks list
6. Save the updated rule
7. Update this documentation

## Modifying Branch Protection via API

For automation or managing multiple repositories, use the GitHub API:

```bash
# Example: Update branch protection via GitHub CLI
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]=ESLint Security Check \
  --field required_status_checks[contexts][]=TypeScript Type Check \
  # ... add all required checks
```

See [GitHub API documentation](https://docs.github.com/en/rest/branches/branch-protection) for complete API reference.

## Security Considerations

Branch protection is a critical security control:

- Prevents unauthorized code changes
- Ensures all security checks pass before merge
- Maintains audit trail through PR reviews
- Enforces code review requirements
- Protects against accidental or malicious commits

**Do not disable branch protection** except in true emergencies, and only with proper authorization and documentation.

## Support

If you encounter issues with branch protection:

1. Check this documentation
2. Review GitHub's [branch protection documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
3. Check workflow run logs for specific failures
4. Contact repository administrators
5. Open an issue with details of the problem

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-28  
**Maintained By:** Project Pulse Team
