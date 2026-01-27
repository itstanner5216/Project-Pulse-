# Contributing to Project Pulse

Thank you for your interest in contributing to Project Pulse! This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and professional in all interactions.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Git
- Basic understanding of TypeScript and Bash

### Setting Up Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Project-Pulse-.git
   cd Project-Pulse-/ProjectPulse
   ```

3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/itstanner5216/Project-Pulse-.git
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Build the project:**
   ```bash
   npm run build
   ```

6. **Verify setup:**
   ```bash
   # Check build output
   ls -la dist/
   
   # Test CLI commands
   ./bin/projectpulse --version
   ```

## Development Workflow

### Creating a New Feature

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Write code following our coding standards
   - Add or update tests
   - Update documentation

3. **Test your changes:**
   ```bash
   npm run build
   npm test
   npm run lint
   ```

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** on GitHub

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(daemon): add atomic PID file locking
fix(storage): prevent ID collision in createRequest
docs(readme): update installation instructions
test(delegation): add unit tests for ID generation
```

## Coding Standards

### TypeScript Guidelines

1. **Use TypeScript strict mode:**
   - All TypeScript files should be type-safe
   - Avoid `any` type unless absolutely necessary
   - Use proper type annotations for function parameters and return values

2. **Code Style:**
   - Use 4 spaces for indentation
   - Use single quotes for strings
   - Add semicolons at end of statements
   - Follow existing code patterns

3. **Naming Conventions:**
   - Use `camelCase` for variables and functions
   - Use `PascalCase` for types, interfaces, and classes
   - Use `UPPER_SNAKE_CASE` for constants
   - Use descriptive names (avoid single-letter variables except in loops)

4. **Documentation:**
   - Add JSDoc comments for public functions and classes
   - Include parameter descriptions and return types
   - Add examples for complex functions

**Example:**
```typescript
/**
 * Validate that a working directory is safe to use for subprocess execution.
 * 
 * @param dir - The directory path to validate
 * @returns The absolute path if valid
 * @throws Error if path doesn't exist, isn't a directory, or is in a restricted location
 * 
 * @example
 * ```typescript
 * const validPath = validateWorkingDir('./src');
 * // Returns: /home/user/project/src
 * ```
 */
function validateWorkingDir(dir: string): string {
    // Implementation
}
```

### Bash Script Guidelines

1. **Use strict mode:**
   ```bash
   set -euo pipefail
   ```

2. **Code Style:**
   - Use 4 spaces for indentation
   - Quote all variables: `"$variable"`
   - Use `[[ ]]` for conditionals, not `[ ]`
   - Add comments for complex logic

3. **Error Handling:**
   - Check command exit codes
   - Provide meaningful error messages
   - Clean up resources on failure

### Security Guidelines

1. **Input Validation:**
   - Always validate user input
   - Sanitize file paths before use
   - Validate data before spawning subprocesses

2. **Path Safety:**
   - Use absolute paths when possible
   - Prevent path traversal attacks
   - Avoid executing code from user-controlled directories

3. **Resource Management:**
   - Clean up timers and handles
   - Close file descriptors
   - Prevent resource leaks

4. **Error Messages:**
   - Don't expose sensitive information in errors
   - Provide actionable error messages
   - Log security-relevant events

## Testing Guidelines

### Unit Tests

- Write tests for all new functionality
- Test edge cases and error conditions
- Use descriptive test names
- Aim for >80% code coverage

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { generateUniqueId, isValidId } from './id';

describe('ID Generation', () => {
    it('should generate unique IDs with timestamp', () => {
        const id1 = generateUniqueId();
        const id2 = generateUniqueId();
        
        expect(id1).not.toBe(id2);
        expect(id1).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d+$/);
    });
    
    it('should validate ID format correctly', () => {
        expect(isValidId('swift-amber-falcon')).toBe(true);
        expect(isValidId('invalid-id')).toBe(false);
        expect(isValidId('')).toBe(false);
    });
});
```

### Integration Tests

- Test complete workflows
- Test daemon lifecycle
- Test multi-component interactions
- Clean up after tests

### Test Organization

```
tests/
├── unit/
│   ├── delegation/
│   │   ├── id.test.ts
│   │   ├── storage.test.ts
│   │   └── agent-loader.test.ts
│   └── daemon/
│       ├── spawner.test.ts
│       └── watcher.test.ts
└── integration/
    ├── delegation-workflow.test.ts
    └── daemon-lifecycle.test.ts
```

## Pull Request Process

### Before Submitting

- [ ] Code builds successfully (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Documentation is updated
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with main

### PR Description Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Fixes #123

## Testing
Describe the testing performed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] No new warnings
```

### Review Process

1. **Automated Checks:**
   - Build verification
   - Test execution
   - Linting
   - Security scan (CodeQL)

2. **Code Review:**
   - At least one approval required
   - Address all review comments
   - Update PR based on feedback

3. **Merge:**
   - Squash commits when merging
   - Update PR description if needed
   - Delete branch after merge

## Issue Reporting

### Bug Reports

Use the bug report template and include:

- **Description:** Clear description of the bug
- **Steps to Reproduce:** Numbered list of steps
- **Expected Behavior:** What should happen
- **Actual Behavior:** What actually happens
- **Environment:**
  - OS and version
  - Node.js version
  - Project Pulse version
- **Logs:** Relevant error messages or logs
- **Screenshots:** If applicable

### Feature Requests

Use the feature request template and include:

- **Problem:** What problem does this solve?
- **Proposed Solution:** How should it work?
- **Alternatives:** Other solutions considered
- **Use Cases:** When would this be used?

### Security Issues

**Do not open public issues for security vulnerabilities.**

Instead, email security concerns to the maintainers or use GitHub's private security advisory feature.

## Development Tips

### Useful Commands

```bash
# Watch mode for development
npm run dev

# Run linter
npm run lint

# Clean build artifacts
npm run clean

# Check TypeScript types
npx tsc --noEmit

# Run specific test file
npm test -- src/lib/delegation/id.test.ts
```

### Debugging

1. **Daemon Debugging:**
   ```bash
   # Run daemon in foreground
   pulse-agents foreground
   
   # Check daemon logs
   tail -f ~/.projectpulse/delegations/logs/daemon.log
   ```

2. **TypeScript Debugging:**
   - Use VS Code debugger with launch.json
   - Add breakpoints in source files
   - Inspect variables and call stack

3. **CLI Debugging:**
   ```bash
   # Add debug output
   export DEBUG=projectpulse:*
   
   # Run with bash debugging
   bash -x bin/projectpulse inject
   ```

### Common Issues

1. **Build Errors:**
   ```bash
   # Clean and rebuild
   npm run clean
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

2. **Test Failures:**
   - Check if daemon is running (`pulse-agents status`)
   - Clean up test artifacts in `/tmp`
   - Verify Node.js version

3. **Type Errors:**
   - Run `npx tsc --noEmit` for detailed errors
   - Check for missing type definitions
   - Verify TypeScript version compatibility

## Resources

- **Documentation:**
  - [README.md](./README.md) - Project overview
  - [CODE_REVIEW_FINDINGS.md](./CODE_REVIEW_FINDINGS.md) - Security review
  - [FOLLOWUP_TASKS.md](./FOLLOWUP_TASKS.md) - Planned improvements

- **External Resources:**
  - [TypeScript Documentation](https://www.typescriptlang.org/docs/)
  - [Node.js Documentation](https://nodejs.org/docs/)
  - [Vitest Documentation](https://vitest.dev/)

## Getting Help

- **GitHub Discussions:** Ask questions and discuss ideas
- **GitHub Issues:** Report bugs and request features
- **Code Comments:** Add comments to your PR for specific questions

## License

By contributing to Project Pulse, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Project Pulse! 🚀
