# ProjectPulse Examples

This document provides practical examples for common use cases of ProjectPulse.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Programmatic API Usage](#programmatic-api-usage)
- [Advanced Scenarios](#advanced-scenarios)
- [Integration Examples](#integration-examples)
- [Error Handling](#error-handling)

---

## Basic Usage

### Example 1: Explore Codebase Structure

**Goal**: Understand the structure of a new codebase.

**CLI Command**:
```bash
# Start daemon if not running
projectpulse daemon start

# Create delegation
projectpulse delegate \
  "Analyze the overall structure of this codebase. Identify main modules, dependencies, and architecture patterns." \
  --agent explorer \
  --cli auto

# Output: Delegation created: swift-amber-falcon

# Wait and read result
projectpulse delegation read swift-amber-falcon --wait
```

---

### Example 2: Security Code Review

**Goal**: Review code for security vulnerabilities.

**CLI Command**:
```bash
projectpulse delegate \
  "Review the authentication and authorization code for security issues. Check for SQL injection, XSS, CSRF vulnerabilities." \
  --agent reviewer \
  --cli auto \
  --timeout 600

# Output: Delegation created: clever-blue-tiger

# Poll for result
projectpulse delegation read clever-blue-tiger --wait
```

---

### Example 3: Performance Analysis

**Goal**: Identify performance bottlenecks.

**CLI Command**:
```bash
projectpulse delegate \
  "Analyze the API endpoint handlers for performance issues. Look for N+1 queries, inefficient algorithms, and missing caching." \
  --agent performance \
  --cli auto

# Output: Delegation created: brave-crimson-dragon
```

---

### Example 4: Architecture Review

**Goal**: Review system architecture for scalability.

**CLI Command**:
```bash
projectpulse delegate \
  "Review the current architecture for scalability issues. Identify coupling, monolithic components, and suggest improvements." \
  --agent architect \
  --cli auto \
  --timeout 900
```

---

### Example 5: Task Planning

**Goal**: Break down a large task into smaller steps.

**CLI Command**:
```bash
projectpulse delegate \
  "Break down the task of migrating from MongoDB to PostgreSQL into actionable steps with estimates." \
  --agent planner \
  --cli auto
```

---

## Programmatic API Usage

### Example 6: Node.js Integration

**Goal**: Integrate ProjectPulse into a Node.js application.

```typescript
import { createRequest, readResult, checkStatus } from 'projectpulse/lib/delegation';

async function analyzeCodebase(prompt: string): Promise<string> {
  // Create delegation
  const createResult = await createRequest({
    parentSession: process.env.SESSION_ID || 'my-app',
    sourceCli: 'opencode',
    targetCli: 'auto',
    agent: 'explorer',
    prompt,
    workingDir: process.cwd(),
    timeout: 600
  });

  if (!createResult.ok) {
    throw new Error(`Failed to create delegation: ${createResult.error}`);
  }

  const delegationId = createResult.data.id;
  console.log(`Delegation created: ${delegationId}`);

  // Poll for result
  while (true) {
    const status = await checkStatus(delegationId);
    
    if (!status.ok) {
      throw new Error(`Failed to check status: ${status.error}`);
    }

    if (status.data.status === 'complete') {
      const result = await readResult(delegationId);
      if (result.ok) {
        return result.data.result;
      }
      throw new Error(`Failed to read result: ${result.error}`);
    }

    if (status.data.status === 'error') {
      const result = await readResult(delegationId);
      if (result.ok) {
        throw new Error(`Delegation failed: ${result.data.error}`);
      }
      throw new Error('Delegation failed with unknown error');
    }

    // Wait 2 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Usage
analyzeCodebase('Analyze authentication flow in this codebase')
  .then(result => console.log('Result:', result))
  .catch(err => console.error('Error:', err));
```

---

### Example 7: Batch Delegations

**Goal**: Create multiple delegations and wait for all to complete.

```typescript
import { createRequest, checkStatus, readResult } from 'projectpulse/lib/delegation';

interface BatchResult {
  id: string;
  prompt: string;
  result?: string;
  error?: string;
}

async function batchAnalysis(prompts: string[]): Promise<BatchResult[]> {
  // Create all delegations
  const delegationIds: string[] = [];
  
  for (const prompt of prompts) {
    const createResult = await createRequest({
      parentSession: 'batch-analysis',
      sourceCli: 'opencode',
      targetCli: 'auto',
      agent: 'explorer',
      prompt,
      workingDir: process.cwd(),
      timeout: 300
    });

    if (createResult.ok) {
      delegationIds.push(createResult.data.id);
      console.log(`Created delegation ${createResult.data.id} for: ${prompt}`);
    } else {
      console.error(`Failed to create delegation for "${prompt}": ${createResult.error}`);
    }
  }

  // Wait for all to complete
  const results: BatchResult[] = [];
  const pending = new Set(delegationIds);

  while (pending.size > 0) {
    for (const id of pending) {
      const status = await checkStatus(id);
      
      if (!status.ok) {
        console.error(`Failed to check status for ${id}`);
        continue;
      }

      if (status.data.status === 'complete' || status.data.status === 'error') {
        const result = await readResult(id);
        const index = delegationIds.indexOf(id);
        
        results.push({
          id,
          prompt: prompts[index],
          result: result.ok ? result.data.result : undefined,
          error: result.ok && result.data.status === 'error' ? result.data.error : undefined
        });

        pending.delete(id);
        console.log(`Completed ${id} (${pending.size} remaining)`);
      }
    }

    if (pending.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  return results;
}

// Usage
const prompts = [
  'List all API endpoints',
  'List all database models',
  'Find all authentication code'
];

batchAnalysis(prompts)
  .then(results => {
    results.forEach(r => {
      console.log(`\n=== ${r.prompt} ===`);
      console.log(r.result || `Error: ${r.error}`);
    });
  })
  .catch(err => console.error('Batch analysis failed:', err));
```

---

### Example 8: TypeScript Integration with Strict Types

**Goal**: Use ProjectPulse with full TypeScript type safety.

```typescript
import {
  createRequest,
  readResult,
  checkStatus,
  DelegationRequest,
  DelegationResult,
  DelegationStatus,
  AgentType,
  SupportedCli
} from 'projectpulse/lib/delegation';

interface DelegationConfig {
  agent: AgentType;
  cli: SupportedCli;
  timeout?: number;
}

class DelegationClient {
  private sessionId: string;
  private workingDir: string;
  private defaultConfig: DelegationConfig;

  constructor(
    sessionId: string,
    workingDir: string,
    defaultConfig?: DelegationConfig
  ) {
    this.sessionId = sessionId;
    this.workingDir = workingDir;
    this.defaultConfig = defaultConfig || {
      agent: 'explorer',
      cli: 'auto',
      timeout: 600
    };
  }

  async delegate(
    prompt: string,
    config?: Partial<DelegationConfig>
  ): Promise<DelegationResult> {
    const finalConfig = { ...this.defaultConfig, ...config };

    const createResult = await createRequest({
      parentSession: this.sessionId,
      sourceCli: 'opencode',
      targetCli: finalConfig.cli,
      agent: finalConfig.agent,
      prompt,
      workingDir: this.workingDir,
      timeout: finalConfig.timeout
    });

    if (!createResult.ok) {
      throw new Error(`Failed to create delegation: ${createResult.error}`);
    }

    return this.waitForResult(createResult.data.id);
  }

  private async waitForResult(id: string): Promise<DelegationResult> {
    while (true) {
      const status = await checkStatus(id);
      
      if (!status.ok) {
        throw new Error(`Failed to check status: ${status.error}`);
      }

      if (status.data.status !== 'pending') {
        const result = await readResult(id);
        if (!result.ok) {
          throw new Error(`Failed to read result: ${result.error}`);
        }
        return result.data;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Usage
const client = new DelegationClient('my-session', process.cwd(), {
  agent: 'explorer',
  cli: 'auto',
  timeout: 600
});

async function main() {
  // Use default config
  const result1 = await client.delegate('Analyze codebase structure');
  console.log('Result 1:', result1);

  // Override config
  const result2 = await client.delegate(
    'Review security issues',
    { agent: 'reviewer', timeout: 900 }
  );
  console.log('Result 2:', result2);
}

main().catch(console.error);
```

---

## Advanced Scenarios

### Example 9: Custom Agent Prompts

**Goal**: Use custom agent prompts for specialized analysis.

**Setup**:
```bash
# Create custom agent prompt
mkdir -p ./agentprompts
cat > ./agentprompts/ExplorationAgent.md << 'EOF'
# Custom Explorer Agent

You are a specialized code analysis agent focused on [your domain].

## Your Task
Analyze the codebase with focus on:
- [Custom requirement 1]
- [Custom requirement 2]
- [Custom requirement 3]

## Guidelines
- [Custom guideline 1]
- [Custom guideline 2]

## Output Format
Provide structured analysis with:
1. Summary
2. Detailed findings
3. Recommendations
EOF
```

**Usage**:
```bash
# Agent will use custom prompt from ./agentprompts/
projectpulse delegate "Analyze with custom criteria" --agent explorer
```

---

### Example 10: Multi-CLI Setup

**Goal**: Use different CLIs for different agent types.

```typescript
import { createRequest } from 'projectpulse/lib/delegation';

async function multiCliDelegation() {
  // Use OpenCode for exploration (fast)
  const explore = await createRequest({
    parentSession: 'multi-cli',
    sourceCli: 'opencode',
    targetCli: 'opencode',
    agent: 'explorer',
    prompt: 'Quick codebase overview',
    workingDir: process.cwd(),
    timeout: 120
  });

  // Use Claude for in-depth review (high quality)
  const review = await createRequest({
    parentSession: 'multi-cli',
    sourceCli: 'opencode',
    targetCli: 'claude',
    agent: 'reviewer',
    prompt: 'Comprehensive security review',
    workingDir: process.cwd(),
    timeout: 1800
  });

  console.log('Explorer delegation:', explore.data?.id);
  console.log('Reviewer delegation:', review.data?.id);
}
```

---

### Example 11: Daemon Management

**Goal**: Programmatically manage daemon lifecycle.

```typescript
import { startDaemon, stopDaemon, isRunning, getDaemonStatus } from 'projectpulse/daemon';

async function manageDaemon() {
  // Check if daemon is running
  const running = await isRunning();
  console.log('Daemon running:', running);

  if (!running) {
    // Start daemon
    console.log('Starting daemon...');
    await startDaemon();
    console.log('Daemon started');
  }

  // Get daemon status
  const status = getDaemonStatus();
  console.log('Daemon PID:', status.pid);
  console.log('Log path:', status.logPath);

  // Perform work...
  
  // Stop daemon when done
  console.log('Stopping daemon...');
  await stopDaemon();
  console.log('Daemon stopped');
}
```

---

## Integration Examples

### Example 12: Express.js API Integration

**Goal**: Create API endpoint for code analysis.

```typescript
import express from 'express';
import { createRequest, checkStatus, readResult } from 'projectpulse/lib/delegation';

const app = express();
app.use(express.json());

// Create delegation endpoint
app.post('/api/analyze', async (req, res) => {
  const { prompt, agent = 'explorer', timeout = 600 } = req.body;

  const result = await createRequest({
    parentSession: req.headers['x-session-id'] as string || 'api',
    sourceCli: 'opencode',
    targetCli: 'auto',
    agent,
    prompt,
    workingDir: process.cwd(),
    timeout
  });

  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  res.json({ delegationId: result.data.id });
});

// Check status endpoint
app.get('/api/analyze/:id', async (req, res) => {
  const status = await checkStatus(req.params.id);
  
  if (!status.ok) {
    return res.status(500).json({ error: status.error });
  }

  if (status.data.status === 'pending') {
    return res.json({ status: 'pending' });
  }

  const result = await readResult(req.params.id);
  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  res.json({
    status: result.data.status,
    result: result.data.result,
    error: result.data.error
  });
});

app.listen(3000, () => console.log('API running on port 3000'));
```

---

### Example 13: GitHub Actions Integration

**Goal**: Use ProjectPulse in CI/CD for automated code review.

```yaml
name: Code Review on PR

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install ProjectPulse
        run: npm install -g projectpulse opencode
      
      - name: Start Daemon
        run: projectpulse daemon start
      
      - name: Create Review Delegation
        id: review
        run: |
          DELEGATION_ID=$(projectpulse delegate \
            "Review this PR for security issues, code quality, and best practices." \
            --agent reviewer \
            --timeout 600 \
            --cli opencode | grep -oP 'Delegation created: \K.*')
          echo "delegation_id=$DELEGATION_ID" >> $GITHUB_OUTPUT
      
      - name: Wait for Result
        run: |
          projectpulse delegation read ${{ steps.review.outputs.delegation_id }} --wait > review.txt
      
      - name: Post Review Comment
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('review.txt', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## 🤖 Automated Code Review\n\n${review}`
            });
      
      - name: Stop Daemon
        if: always()
        run: projectpulse daemon stop
```

---

## Error Handling

### Example 14: Comprehensive Error Handling

**Goal**: Handle all possible error scenarios.

```typescript
import { createRequest, checkStatus, readResult } from 'projectpulse/lib/delegation';

async function robustDelegation(prompt: string): Promise<string> {
  try {
    // Step 1: Create delegation
    const createResult = await createRequest({
      parentSession: 'robust-session',
      sourceCli: 'opencode',
      targetCli: 'auto',
      agent: 'explorer',
      prompt,
      workingDir: process.cwd(),
      timeout: 600
    });

    if (!createResult.ok) {
      // Handle creation errors
      if (createResult.error?.includes('Working directory does not exist')) {
        throw new Error('Invalid working directory. Please check the path.');
      }
      if (createResult.error?.includes('Invalid agent type')) {
        throw new Error('Agent type must be: explorer, reviewer, performance, architect, or planner');
      }
      throw new Error(`Failed to create delegation: ${createResult.error}`);
    }

    const delegationId = createResult.data.id;
    console.log(`Delegation created: ${delegationId}`);

    // Step 2: Poll for result with timeout
    const maxPolls = 60; // 2 minutes with 2-second intervals
    let polls = 0;

    while (polls < maxPolls) {
      const status = await checkStatus(delegationId);
      
      if (!status.ok) {
        console.warn(`Failed to check status (attempt ${polls + 1}): ${status.error}`);
        polls++;
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      // Check if completed
      if (status.data.status !== 'pending') {
        const result = await readResult(delegationId);
        
        if (!result.ok) {
          throw new Error(`Failed to read result: ${result.error}`);
        }

        // Handle different completion statuses
        switch (result.data.status) {
          case 'complete':
            return result.data.result;
          
          case 'error':
            throw new Error(`Delegation failed: ${result.data.error}\nOutput: ${result.data.result}`);
          
          case 'timeout':
            throw new Error(`Delegation timed out after ${result.data.durationMs}ms`);
          
          default:
            throw new Error(`Unknown delegation status: ${result.data.status}`);
        }
      }

      polls++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Timed out waiting for delegation to complete');

  } catch (error) {
    // Log detailed error information
    console.error('Delegation failed:', error);
    
    // Re-throw with context
    if (error instanceof Error) {
      throw new Error(`Delegation error: ${error.message}`);
    }
    throw error;
  }
}

// Usage with error handling
robustDelegation('Analyze authentication code')
  .then(result => {
    console.log('✓ Success:', result);
  })
  .catch(error => {
    console.error('✗ Failed:', error.message);
    process.exit(1);
  });
```

---

### Example 15: Retry Logic

**Goal**: Automatically retry failed delegations.

```typescript
import { createRequest, checkStatus, readResult } from 'projectpulse/lib/delegation';

async function delegateWithRetry(
  prompt: string,
  maxRetries: number = 3
): Promise<string> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`Attempt ${attempt}/${maxRetries}`);

      const createResult = await createRequest({
        parentSession: 'retry-session',
        sourceCli: 'opencode',
        targetCli: 'auto',
        agent: 'explorer',
        prompt,
        workingDir: process.cwd(),
        timeout: 600
      });

      if (!createResult.ok) {
        throw new Error(createResult.error);
      }

      // Wait for result
      const delegationId = createResult.data.id;
      
      while (true) {
        const status = await checkStatus(delegationId);
        
        if (!status.ok) {
          throw new Error(status.error);
        }

        if (status.data.status !== 'pending') {
          const result = await readResult(delegationId);
          
          if (!result.ok) {
            throw new Error(result.error);
          }

          if (result.data.status === 'complete') {
            return result.data.result;
          }
          
          // Error or timeout - will retry
          throw new Error(result.data.error || 'Delegation failed');
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      
      if (attempt >= maxRetries) {
        throw new Error(`All ${maxRetries} attempts failed. Last error: ${error}`);
      }
      
      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Retry logic failed unexpectedly');
}

// Usage
delegateWithRetry('Analyze codebase', 3)
  .then(result => console.log('Success:', result))
  .catch(error => console.error('All retries failed:', error));
```

---

## See Also

- [API Reference](README.md) - Full API documentation
- [Configuration Guide](CONFIGURATION.md) - All configuration options
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
- [Delegation Lifecycle](DELEGATION_LIFECYCLE.md) - Understanding delegation states
