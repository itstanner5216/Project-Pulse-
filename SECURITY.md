# Security Policy

## Supported Versions

Project Pulse is currently in early development (v0.1.x). Security updates will be provided for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report security issues using one of the following methods:

### Option 1: GitHub Security Advisories (Preferred)

1. Go to the [Security tab](https://github.com/itstanner5216/Project-Pulse-/security) of the repository
2. Click "Report a vulnerability"
3. Fill out the security advisory form with details
4. Click "Submit report"

### Option 2: Private Email

Send an email to the project maintainers with:
- **Subject:** `[SECURITY] Brief description of the issue`
- **Description:** Detailed description of the vulnerability
- **Impact:** Potential impact and severity
- **Reproduction:** Steps to reproduce the issue
- **Environment:** Your system details (OS, Node.js version, etc.)

### What to Expect

- **Acknowledgment:** We will acknowledge receipt within 48 hours
- **Initial Assessment:** We will provide an initial assessment within 5 business days
- **Updates:** We will keep you informed of progress toward a fix
- **Disclosure:** We will work with you on responsible disclosure timing
- **Credit:** We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Update Process

1. **Triage:** Security reports are triaged and prioritized
2. **Investigation:** The issue is investigated and validated
3. **Fix Development:** A fix is developed and tested
4. **Security Advisory:** A security advisory is prepared
5. **Release:** A security update is released
6. **Disclosure:** The vulnerability is publicly disclosed

## Known Security Issues

The following security issues have been identified and are documented in our code review:

### Critical

1. **Path Validation in Subprocess Spawning**
   - **Status:** ✅ Fixed
   - **Issue:** `workingDir` parameter not validated before use
   - **Impact:** Potential arbitrary code execution
   - **Tracked in:** [CODE_REVIEW_FINDINGS.md](./CODE_REVIEW_FINDINGS.md#1-missing-validation-of-workingdir-path)
   - **Fix Priority:** Immediate

### High

2. **ID Collision in Delegation Requests**
   - **Status:** ✅ Fixed
   - **Issue:** Delegation IDs can collide, causing silent data corruption
   - **Impact:** Data integrity issues
   - **Tracked in:** [CODE_REVIEW_FINDINGS.md](./CODE_REVIEW_FINDINGS.md#2-id-collision-vulnerability-in-request-creation)
   - **Fix Priority:** High

3. **Daemon Race Condition**
   - **Status:** ✅ Fixed
   - **Issue:** Multiple daemon instances can start simultaneously
   - **Impact:** Resource conflicts and unpredictable behavior
   - **Tracked in:** [CODE_REVIEW_FINDINGS.md](./CODE_REVIEW_FINDINGS.md#3-race-condition-in-daemon-start)
   - **Fix Priority:** High

See [CODE_REVIEW_FINDINGS.md](./CODE_REVIEW_FINDINGS.md) for complete details and recommended fixes.

## Security Best Practices

### For Users

1. **Keep Updated:** Always use the latest version
   ```bash
   cd Project-Pulse-/ProjectPulse
   git pull
   npm install
   npm run build
   ```

2. **Review Delegations:** Be cautious about delegation sources
   - Only delegate from trusted working directories
   - Review agent prompts before use

3. **Monitor Daemon:** Check daemon logs for suspicious activity
   ```bash
   tail -f ~/.projectpulse/delegations/logs/daemon.log
   ```

4. **Limit Permissions:** Run Project Pulse with minimal required permissions
   - Don't run as root/administrator
   - Use user-level installations

5. **Validate Configuration:** Review configuration files before use
   ```bash
   projectpulse config print
   ```

### For Developers

1. **Input Validation:**
   - Validate all user input
   - Sanitize file paths
   - Check agent types before use

2. **Path Safety:**
   - Use `path.resolve()` for absolute paths
   - Prevent directory traversal
   - Validate working directories

3. **Subprocess Security:**
   - Validate commands before execution
   - Use safe environment variables
   - Limit subprocess capabilities

4. **Resource Management:**
   - Clean up timers and handles
   - Close file descriptors
   - Prevent resource exhaustion

5. **Error Handling:**
   - Don't expose sensitive information in errors
   - Log security events
   - Fail securely

## Security Checklist for Contributors

Before submitting a PR, verify:

- [ ] All user input is validated
- [ ] File paths are sanitized and validated
- [ ] No hardcoded credentials or secrets
- [ ] Subprocess spawning is secure
- [ ] Resource cleanup is proper
- [ ] Error messages don't leak sensitive info
- [ ] Dependencies are up to date
- [ ] No known vulnerable packages

## Dependency Security

### Automated Scanning

We use the following tools to scan for vulnerable dependencies:

- **npm audit:** Run automatically on `npm install`
- **Dependabot:** Automated dependency updates on GitHub
- **CodeQL:** Static code analysis

### Manual Checks

```bash
# Check for vulnerabilities
npm audit

# Fix automatically fixable issues
npm audit fix

# Review detailed report
npm audit --json
```

### Dependency Policy

- **Critical vulnerabilities:** Fixed immediately
- **High vulnerabilities:** Fixed within 7 days
- **Medium vulnerabilities:** Fixed within 30 days
- **Low vulnerabilities:** Fixed in next minor release

## Threat Model

### Attack Vectors

1. **Malicious Delegation Requests:**
   - Crafted requests with malicious paths
   - Path traversal attempts
   - Command injection attempts

2. **Daemon Compromise:**
   - Multiple daemon instances
   - Resource exhaustion
   - Process interference

3. **File System Attacks:**
   - Unauthorized file access
   - Symbolic link attacks
   - Race conditions in file operations

4. **Information Disclosure:**
   - Sensitive data in logs
   - Error messages revealing internals
   - Timing attacks

### Mitigations

1. **Input Validation:**
   - Strict path validation (see issue #1)
   - Agent type validation (see issue #6)
   - Parameter sanitization

2. **Access Control:**
   - Atomic file operations (see issue #3)
   - Exclusive file creation
   - Permission checks

3. **Resource Protection:**
   - Timeout enforcement
   - Resource cleanup (see issues #4, #5)
   - Process limits

4. **Information Protection:**
   - Sanitized error messages
   - Structured logging
   - Minimal information disclosure

## Security Roadmap

### Version 0.1.1 (In Progress)
- [x] Fix critical path validation issue
- [x] Add ID collision prevention
- [x] Fix daemon race condition
- [ ] Add security tests

### Version 0.2.0 (Planned)
- [ ] Add rate limiting
- [ ] Implement audit logging
- [ ] Add access control lists
- [ ] Security documentation improvements

### Version 1.0.0 (Future)
- [ ] Security hardening review
- [ ] Penetration testing
- [ ] Security certification
- [ ] Formal security audit

## Responsible Disclosure

We request that security researchers:

1. **Give us reasonable time** to fix issues before public disclosure
   - Critical: 7 days
   - High: 14 days
   - Medium: 30 days
   - Low: 60 days

2. **Avoid exploiting vulnerabilities** beyond what's necessary for demonstration

3. **Don't access or modify** other users' data

4. **Act in good faith** to avoid privacy violations, data destruction, or service interruption

We commit to:

1. **Respond promptly** to security reports
2. **Keep you informed** of our progress
3. **Give credit** for responsible disclosure (unless you prefer anonymity)
4. **Not pursue legal action** against good-faith security research

## Security Hall of Fame

We recognize and thank the following security researchers:

_(None yet - be the first!)_

## Contact

For security concerns, please use the reporting methods described above. Do not use public channels for security issues.

For general questions about security, you can:
- Open a GitHub Discussion (for general security topics only, not vulnerabilities)
- Comment on relevant security issues (after they're public)

---

**Last Updated:** 2025-01-27  
**Next Review:** After v0.1.1 release
