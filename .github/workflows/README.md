# GitHub Actions CI/CD Workflows

This directory contains all GitHub Actions workflows for Project Pulse automated testing and quality checks.

## Workflows Overview

### 1. CI/CD Pipeline (`ci.yml`)
**Purpose:** Main CI/CD status check workflow  
**Triggers:** Push to main/copilot branches, Pull Requests  
**Description:** Provides a summary of all CI/CD checks. This workflow ensures all required checks are visible.

### 2. Lint and Type Check (`lint-typecheck.yml`)
**Purpose:** Code quality and type safety verification  
**Triggers:** Push to main/copilot branches, Pull Requests  
**Jobs:**
- **ESLint Security Check:** Runs ESLint with security rules
- **TypeScript Type Check:** Validates TypeScript types without emitting files
- **Build Check:** Verifies the project builds successfully

### 3. Test Suite (`test.yml`)
**Purpose:** Automated testing with coverage reporting  
**Triggers:** Push to main/copilot branches, Pull Requests  
**Jobs:**
- **Unit Tests:** Runs Vitest unit tests with verbose output
- **Coverage Report:** Generates and uploads code coverage reports
- **Integration Tests:** Runs smoke tests and integration test scripts
- **PR Comments:** Posts coverage summary to pull requests

### 4. CodeQL Security Analysis (`codeql.yml`)
**Purpose:** Advanced security vulnerability detection  
**Triggers:** Push to main/copilot branches, Pull Requests, Weekly schedule, Manual  
**Jobs:**
- **CodeQL Analysis:** Scans JavaScript/TypeScript code for security vulnerabilities
- **SARIF Upload:** Uploads results to GitHub Security tab
- **Schedule:** Runs weekly on Mondays at 00:00 UTC

### 5. Dependency Audit (`dependency-audit.yml`)
**Purpose:** Dependency security and license compliance  
**Triggers:** Push to main/copilot branches, Pull Requests, Daily schedule, Manual  
**Jobs:**
- **NPM Security Audit:** Checks for vulnerable dependencies
- **License Check:** Verifies license compliance
- **PR Comments:** Posts audit summary to pull requests
- **Schedule:** Runs daily at 02:00 UTC

### 6. Queue Validation (`queue-validate.yml`)
**Purpose:** Validates task queue YAML structure  
**Triggers:** Pull Requests modifying QUEUE.yml, Manual  
**Jobs:**
- **Validate Queue:** Checks YAML syntax and structure
- **Summary Report:** Posts queue status to pull requests
- **Blocked Tasks Check:** Identifies and reports blocked tasks

## Required Status Checks

To enforce quality gates and prevent merging of broken code, configure the following branch protection rules for `main`:

### Branch Protection Settings

1. **Navigate to:** Repository Settings → Branches → Branch protection rules → Add rule

2. **Branch name pattern:** `main`

3. **Enable these settings:**
   - ✅ Require a pull request before merging
   - ✅ Require approvals (minimum 1)
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging

4. **Required status checks (select all):**
   ```
   - ESLint Security Check
   - TypeScript Type Check
   - Build Check
   - Unit Tests
   - Integration Tests
   - CodeQL Analysis
   - NPM Security Audit
   - License Compliance Check
   - CI Pipeline Status Check
   ```

5. **Additional recommended settings:**
   - ✅ Require conversation resolution before merging
   - ✅ Do not allow bypassing the above settings
   - ✅ Restrict who can push to matching branches

## Coverage Reporting

Test coverage is automatically:
- Generated during test runs
- Uploaded as workflow artifacts (retained for 30 days)
- Posted as comments on pull requests
- Available in the Actions tab under each test run

### Coverage Thresholds

While not enforced automatically, aim for:
- **Critical changes:** ≥90% coverage
- **High priority:** ≥80% coverage
- **Medium priority:** ≥70% coverage

## Workflow Artifacts

Each workflow uploads relevant artifacts:

| Workflow | Artifact | Retention |
|----------|----------|-----------|
| Test Suite | `coverage-report/` | 30 days |
| Dependency Audit | `npm-audit-results.json` | 30 days |

Access artifacts from the Actions tab → Select workflow run → Artifacts section

## Manual Workflow Triggers

All workflows support manual triggering via `workflow_dispatch`:

1. Go to Actions tab
2. Select the workflow
3. Click "Run workflow"
4. Choose the branch
5. Click "Run workflow" button

## Troubleshooting

### Tests Failing Locally but Passing in CI
- Ensure you have the same Node.js version (18)
- Run `npm ci` instead of `npm install` to match CI exactly
- Check for environment-specific issues

### CodeQL Warnings
- Review the Security tab for details
- CodeQL may flag potential issues that need manual review
- Not all warnings indicate actual vulnerabilities

### Audit Failures
- **Critical/High vulnerabilities:** Must be fixed before merging
- **Moderate/Low vulnerabilities:** Should be reviewed and addressed if feasible
- Use `npm audit fix` to automatically fix issues

### Coverage Not Reporting
- Ensure tests are running successfully first
- Check that Vitest coverage is configured in package.json
- Verify coverage files are being generated in `coverage/` directory

## Adding New Workflows

When adding new workflows:

1. Create `.github/workflows/your-workflow.yml`
2. Follow the existing patterns for consistency
3. Add appropriate permissions
4. Include PR commenting if applicable
5. Update this README
6. Add to branch protection required checks

## Workflow Best Practices

- **Use caching:** All workflows cache `node_modules` for faster runs
- **Fail fast:** Jobs fail quickly to provide rapid feedback
- **Parallel execution:** Independent jobs run in parallel
- **Clear reporting:** Use groups and summaries for readable output
- **Upload artifacts:** Save important results for later review

## Security Considerations

- Workflows use minimal required permissions (principle of least privilege)
- Secrets are never logged or exposed
- CodeQL scans run on a schedule to catch new vulnerabilities
- Dependency audits run daily to catch newly disclosed CVEs
- All uploads use official GitHub Actions with pinned versions

## Support

For issues with workflows:
1. Check the workflow run logs in the Actions tab
2. Review this documentation
3. Consult GitHub Actions documentation
4. Open an issue with workflow run link and error details

---

**Last Updated:** 2026-01-28  
**Maintained By:** Project Pulse Team
