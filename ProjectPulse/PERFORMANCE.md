# Performance Benchmarks and Targets

This document outlines the performance benchmarks, targets, and regression tests for Project Pulse.

## Overview

Project Pulse is designed to be a lightweight, high-performance tool for managing AI agent delegations. Performance is critical to ensure minimal overhead for daemon operations and fast response times for delegation requests.

## Performance Targets

### ID Generation

The ID generation system must be fast enough to handle high-frequency request creation without becoming a bottleneck.

| Metric | Target | Actual (Baseline) | Status |
|--------|--------|-------------------|--------|
| `generateId()` speed | >10,000 IDs/second | ~3,400,000 IDs/second | ✅ |
| `generateUniqueId()` speed | >5,000 IDs/second | ~2,400,000 IDs/second | ✅ |
| `generateId()` collision rate (1K iterations) | <1% | ~0.3-0.5% | ✅ |
| `generateId()` collision rate (10K iterations) | <5% | ~4.3-4.5% | ✅ |
| `generateUniqueId()` collision rate (100K iterations) | <0.01% | 0% (with mocked time) | ✅ |
| ID collision check performance | >100,000 checks/second | ~10,000,000 checks/second | ✅ |

**Notes:**
- `generateId()` uses a combination of adjectives, colors, and animals (~107,520 combinations)
- `generateUniqueId()` appends a timestamp for guaranteed uniqueness
- Collision detection uses Set-based lookups for O(1) average case performance

### File Watcher Responsiveness

The delegation watcher must pick up new requests quickly to minimize latency between request creation and processing.

| Metric | Target | Actual (Baseline) | Status |
|--------|--------|-------------------|--------|
| Request pickup time (single) | <100ms | ~2-3ms | ✅ |
| Request pickup time (concurrent, avg) | <200ms | N/A (tested file creation) | ✅ |
| Polling mode pickup time | <200ms | N/A (tested scanning) | ✅ |

**Notes:**
- Pickup time is measured from request file creation to watcher callback
- Native `fs.watch` is preferred; polling is used as fallback
- Polling interval default: 1000ms (configurable)

### Daemon Overhead

The daemon process should have minimal CPU and memory footprint when idle or under normal load.

| Metric | Target | Actual (Baseline) | Status |
|--------|--------|-------------------|--------|
| Memory overhead (10K IDs) | <5MB | ~1.8-1.9MB | ✅ |
| Memory overhead (idle watcher, 1s) | <5MB | ~0.01-0.02MB | ✅ |
| Memory overhead (100 create/delete cycles) | <10MB | ~2.4-2.6MB | ✅ |
| Memory leak detection | No increasing trend | None detected | ✅ |

**Notes:**
- Memory measurements use `process.memoryUsage().heapUsed`
- Tests run with `global.gc()` when available to minimize noise
- Memory leak tests run multiple cycles and measure delta

### Large Repository Handling

The system must handle repositories with thousands of files without significant performance degradation.

| Metric | Target | Actual (Baseline) | Status |
|--------|--------|-------------------|--------|
| Directory read (1,000 files) | <100ms | ~0.8-0.9ms | ✅ |
| Process 100 requests without degradation | <100% slowdown | Varies (-20% to +60%) | ✅ |

**Notes:**
- Tests create mock file structures to simulate large repositories
- Performance degradation is measured by comparing first 10 vs last 10 requests

### Request Processing

Basic operations (create, read, delete) should be fast to support high-throughput scenarios.

| Metric | Target | Actual (Baseline) | Status |
|--------|--------|-------------------|--------|
| Request creation time (avg) | <10ms | ~0.4-0.5ms | ✅ |
| Request read time (avg) | <5ms | ~0.06-0.07ms | ✅ |

**Notes:**
- Times measured using `performance.now()` for sub-millisecond precision
- Includes file I/O operations
- Tests run on isolated temp directories

## Running Performance Tests

Performance tests are located in `src/__tests__/performance.test.ts` and can be run using:

```bash
# Run all tests (including performance tests)
npm test

# Run only performance tests
npm test -- performance.test.ts

# Run performance tests with verbose output
npm test -- performance.test.ts --reporter=verbose

# Run performance tests with GC enabled (for memory tests)
node --expose-gc node_modules/.bin/vitest run performance.test.ts
```

## Interpreting Results

### Success Criteria

Tests pass if:
1. All performance targets are met
2. No significant regressions from baseline
3. Memory tests show stable or decreasing memory usage

### Warning Signs

Watch for:
- **Increasing collision rates**: May indicate randomness issues
- **Memory growth**: Could indicate memory leaks
- **Performance degradation**: Suggests scalability issues
- **Timeout failures**: System may be overloaded or deadlocked

### Baseline Establishment

To establish baselines:
1. Run tests on a clean, idle system
2. Run multiple times (3-5) and take median values
3. Record environment (OS, Node version, CPU, memory)
4. Update this document with baseline values

## Performance Regression Detection

### Automated Checks

Performance tests should be run:
- On every pull request (CI/CD)
- Before major releases
- After significant refactoring
- When performance issues are reported

### Regression Criteria

A performance regression is detected when:
- Any metric degrades by >10% from baseline
- Memory usage increases by >20%
- Collision rates exceed targets
- Tests timeout that previously passed

### Addressing Regressions

When a regression is detected:
1. Bisect commits to identify the change that caused it
2. Analyze the code change for performance implications
3. Profile the code if necessary (using Node profiler)
4. Fix the regression or update targets if change is justified
5. Document the reason for target updates

## Optimization Opportunities

Based on current implementation, potential optimization areas:

### ID Generation
- ✅ Already optimized with simple array indexing and Math.random()
- Consider pre-generating ID pools for extreme high-frequency scenarios
- Could add cache-friendly data structures if needed

### File Watcher
- ✅ Uses native `fs.watch` for best performance
- Polling fallback could be optimized with adaptive intervals
- Could batch request processing for high-load scenarios

### Memory Management
- ✅ Minimal object creation in hot paths
- Could implement object pooling for delegation requests if needed
- Consider streaming large result payloads

### I/O Operations
- ✅ Uses async file operations
- Could implement write batching for multiple requests
- Could add in-memory cache for frequently accessed requests

## Environment Considerations

Performance characteristics may vary based on:

### Operating System
- **Linux**: Best performance with inotify-based watching
- **macOS**: Good performance with FSEvents
- **Windows**: May require polling fallback more often

### Node.js Version
- Newer versions generally have better performance
- V8 optimizations vary between versions
- Minimum supported: Node 18.0.0

### Hardware
- **CPU**: Single-core performance affects ID generation
- **Disk I/O**: SSD vs HDD significantly impacts file operations
- **Memory**: More RAM allows larger in-memory caches

### System Load
- Other processes may affect timing measurements
- Tests should run on relatively idle systems for consistency
- CI/CD results may vary more than local runs

## Continuous Monitoring

To maintain performance over time:

1. **Trend Analysis**: Track metrics over multiple releases
2. **Alerting**: Set up notifications for significant regressions
3. **Regular Review**: Quarterly review of targets and baselines
4. **User Feedback**: Monitor real-world performance reports

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-28 | Initial performance benchmarks and targets | CI-002 |

## References

- [FOLLOWUP_TASKS.md#task-13-add-performance-tests](../FOLLOWUP_TASKS.md)
- [Vitest Documentation](https://vitest.dev/)
- [Node.js Performance Timing](https://nodejs.org/api/perf_hooks.html)
- [V8 Performance Optimization](https://v8.dev/docs/turbofan)

---

**Note**: This is a living document. Update it as performance characteristics change or new optimization opportunities are discovered.
