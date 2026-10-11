/**
 * Tests for scripts/hooks/check-console-log.js
 *
 * Verifies that exclusion patterns match both forward slash (POSIX) and
 * backslash (Windows) path formats for scripts/, __tests__/, and __mocks__/.
 * (#1704)
 */

const assert = require('assert');

const hook = require('../../scripts/hooks/check-console-log');

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
  console.log('\n=== Testing check-console-log.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('excludes scripts directory with forward slashes (POSIX)', () => {
    assert.strictEqual(typeof hook.isExcluded, 'function', 'hook should export isExcluded');
    assert.strictEqual(hook.isExcluded('scripts/foo.js'), true);
    assert.strictEqual(hook.isExcluded('sub/scripts/bar.ts'), true);
  })) passed++; else failed++;

  if (test('excludes scripts directory with Windows backslashes (#1704)', () => {
    assert.strictEqual(typeof hook.isExcluded, 'function', 'hook should export isExcluded');
    assert.strictEqual(hook.isExcluded('scripts\\foo.js'), true);
    assert.strictEqual(hook.isExcluded('sub\\scripts\\bar.ts'), true);
    assert.strictEqual(hook.isExcluded('C:\\project\\scripts\\tool.js'), true);
  })) passed++; else failed++;

  if (test('excludes tests and mocks with Windows backslashes (#1704)', () => {
    assert.strictEqual(hook.isExcluded('src\\__tests__\\app.test.js'), true);
    assert.strictEqual(hook.isExcluded('src\\__mocks__\\api.js'), true);
    assert.strictEqual(hook.isExcluded('src\\components\\app.tsx'), false);
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
