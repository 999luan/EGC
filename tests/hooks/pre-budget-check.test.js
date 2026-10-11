/**
 * Tests for scripts/hooks/pre-budget-check.js (#1704)
 *
 * Verifies that budget warnings are returned through the hook stderr channel
 * rather than written directly with console.error.
 */

const assert = require('assert');

const budgetTrackerPath = require.resolve('../../scripts/lib/budget-tracker');
let mockCheckBudgetResult = { warn: false, block: false };

require.cache[budgetTrackerPath] = {
  id: budgetTrackerPath,
  filename: budgetTrackerPath,
  loaded: true,
  exports: {
    checkBudget: () => mockCheckBudgetResult,
    recordToolCall: () => {},
  },
};

const hook = require('../../scripts/hooks/pre-budget-check');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing pre-budget-check.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('returns budget warning through stderr channel instead of console.error (#1704)', () => {
    mockCheckBudgetResult = {
      warn: true,
      block: false,
      reason: 'Budget warning: 850/1000 tokens used (85%)',
    };
    let consoleErrorCalled = false;
    const origConsoleError = console.error;
    console.error = () => { consoleErrorCalled = true; };

    try {
      const res = hook.run(JSON.stringify({ tool_input: { command: 'ls' } }));
      assert.strictEqual(res.exitCode, 0);
      assert.ok(res.stderr, 'Warning should be returned in stderr channel');
      assert.ok(res.stderr.includes('Budget warning: 850/1000 tokens used'));
      assert.strictEqual(consoleErrorCalled, false, 'console.error should not be called');
    } finally {
      console.error = origConsoleError;
    }
  })) passed++; else failed++;

  if (test('returns block exitCode 2 and stderr when budget is blocked', () => {
    mockCheckBudgetResult = {
      warn: false,
      block: true,
      reason: 'Budget exceeded: 1000/1000 tokens used',
    };
    const res = hook.run(JSON.stringify({ tool_input: { command: 'ls' } }));
    assert.strictEqual(res.exitCode, 2);
    assert.ok(res.stderr.includes('BLOCKED: Budget exceeded'));
  })) passed++; else failed++;

  if (test('returns exitCode 0 and no stderr when within budget', () => {
    mockCheckBudgetResult = {
      warn: false,
      block: false,
    };
    const res = hook.run(JSON.stringify({ tool_input: { command: 'ls' } }));
    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.stderr, undefined);
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
