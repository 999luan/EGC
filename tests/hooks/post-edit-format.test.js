/**
 * Tests for scripts/hooks/post-edit-format.js (#1704)
 *
 * Verifies that paths containing spaces are not rejected as unsafe shell characters,
 * and that real command-injection metacharacters are still guarded.
 */

const assert = require('assert');
const hook = require('../../scripts/hooks/post-edit-format');

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
  console.log('\n=== Testing post-edit-format.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('UNSAFE_PATH_CHARS allows spaces and parentheses in file paths (#1704)', () => {
    assert.ok(hook.UNSAFE_PATH_CHARS, 'UNSAFE_PATH_CHARS should be exported');
    const pathWithSpaces = 'C:\\Users\\John Doe\\project (copy)\\file.ts';
    assert.strictEqual(
      hook.UNSAFE_PATH_CHARS.test(pathWithSpaces),
      false,
      'Paths with spaces and parentheses should not be marked unsafe'
    );
  })) passed++; else failed++;

  if (test('UNSAFE_PATH_CHARS still blocks shell injection operators', () => {
    assert.strictEqual(hook.UNSAFE_PATH_CHARS.test('file & calc.exe'), true);
    assert.strictEqual(hook.UNSAFE_PATH_CHARS.test('file | whoami'), true);
    assert.strictEqual(hook.UNSAFE_PATH_CHARS.test('file > out.txt'), true);
    assert.strictEqual(hook.UNSAFE_PATH_CHARS.test('file < in.txt'), true);
    assert.strictEqual(hook.UNSAFE_PATH_CHARS.test('file ^ escape'), true);
    assert.strictEqual(hook.UNSAFE_PATH_CHARS.test('file %VAR%'), true);
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
