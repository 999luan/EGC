/**
 * Tests for scripts/lib/warp-agents-merge.js and its wiring into
 * install/apply.js (real file writes) -- covers the scenarios required by
 * issue #739: creating AGENTS.md from scratch, merging into an existing one
 * without touching unrelated content, and never deleting the file on
 * uninstall even if the EGC block becomes empty.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MERGE_MARKDOWN_INDEX_KIND,
  MERGE_MARKDOWN_MEMORY_RULE_KIND,
  mergeMemoryRule,
  mergeSkillIndexEntry,
  removeMemoryRule,
  removeSkillIndexEntry,
} = require('../../scripts/lib/warp-agents-merge');
const { applyInstallPlan } = require('../../scripts/lib/install-executor');

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing warp-agents-merge ===\n');
  let passed = 0;
  let failed = 0;

  const tddEntry = {
    name: 'tdd-workflow',
    description: 'TDD workflow guidance',
    relativePath: '.warp/skills/tdd-workflow.md',
  };

  // --- Pure function: mergeSkillIndexEntry ---

  if (test('creates a fresh block with a single entry when no existing content', () => {
    const result = mergeSkillIndexEntry(null, tddEntry);
    assert.ok(result.includes('<!-- egc-skills-index:start -->'));
    assert.ok(result.includes('<!-- egc-skills-index:end -->'));
    assert.ok(result.includes('- **tdd-workflow**: TDD workflow guidance (`.warp/skills/tdd-workflow.md`)'));
  })) passed++; else failed++;

  if (test('preserves unrelated existing content and appends the block', () => {
    const existing = '# My Project\n\nSome custom rules the user wrote.\n';
    const result = mergeSkillIndexEntry(existing, tddEntry);
    assert.ok(result.startsWith('# My Project\n\nSome custom rules the user wrote.'));
    assert.ok(result.includes('<!-- egc-skills-index:start -->'));
  })) passed++; else failed++;

  if (test('appends a second entry into the existing block without duplicating the first', () => {
    const once = mergeSkillIndexEntry(null, tddEntry);
    const twice = mergeSkillIndexEntry(once, {
      name: 'kotlin-patterns',
      description: 'Idiomatic Kotlin patterns',
      relativePath: '.warp/skills/kotlin-patterns.md',
    });
    assert.ok(twice.includes('- **tdd-workflow**:'));
    assert.ok(twice.includes('- **kotlin-patterns**:'));
    assert.strictEqual((twice.match(/<!-- egc-skills-index:start -->/g) || []).length, 1);
  })) passed++; else failed++;

  if (test('is idempotent: re-adding the same entry does not duplicate it', () => {
    const once = mergeSkillIndexEntry(null, tddEntry);
    const twice = mergeSkillIndexEntry(once, tddEntry);
    assert.strictEqual((twice.match(/^- \*\*tdd-workflow\*\*:/gm) || []).length, 1);
  })) passed++; else failed++;

  if (test('upserts an entry when the description changes on reinstall', () => {
    const once = mergeSkillIndexEntry(null, tddEntry);
    const updated = mergeSkillIndexEntry(once, { ...tddEntry, description: 'Updated description' });
    assert.ok(updated.includes('- **tdd-workflow**: Updated description'));
    assert.ok(!updated.includes('TDD workflow guidance'));
  })) passed++; else failed++;

  // --- Pure function: removeSkillIndexEntry ---

  if (test('removes only the given entry, keeping other entries and the block', () => {
    const withTwo = mergeSkillIndexEntry(
      mergeSkillIndexEntry(null, tddEntry),
      { name: 'kotlin-patterns', description: 'Idiomatic Kotlin patterns', relativePath: '.warp/skills/kotlin-patterns.md' }
    );
    const result = removeSkillIndexEntry(withTwo, 'tdd-workflow');
    assert.ok(!result.includes('tdd-workflow'));
    assert.ok(result.includes('kotlin-patterns'));
    assert.ok(result.includes('<!-- egc-skills-index:start -->'));
  })) passed++; else failed++;

  if (test('drops the block but keeps the rest of the file when the last entry is removed', () => {
    const existing = mergeSkillIndexEntry('# My Project\n\nCustom rules.\n', tddEntry);
    const result = removeSkillIndexEntry(existing, 'tdd-workflow');
    assert.ok(!result.includes('egc-skills-index'));
    assert.ok(result.includes('# My Project'));
    assert.ok(result.includes('Custom rules.'));
  })) passed++; else failed++;

  if (test('never deletes the file even when EGC was the only content', () => {
    const existing = mergeSkillIndexEntry(null, tddEntry);
    const result = removeSkillIndexEntry(existing, 'tdd-workflow');
    assert.strictEqual(typeof result, 'string');
    assert.ok(!result.includes('egc-skills-index'));
  })) passed++; else failed++;

  if (test('returns existing content unchanged when there is no block to remove from', () => {
    const existing = '# My Project\n';
    const result = removeSkillIndexEntry(existing, 'tdd-workflow');
    assert.strictEqual(result, existing);
  })) passed++; else failed++;

  // --- Real install application via applyInstallPlan ---

  function buildMinimalPlan(destinationPath, entry, installStatePath) {
    return {
      operations: [
        {
          kind: MERGE_MARKDOWN_INDEX_KIND,
          moduleId: 'workflow',
          destinationPath,
          strategy: MERGE_MARKDOWN_INDEX_KIND,
          ownership: 'managed',
          scaffoldOnly: false,
          skillName: entry.name,
          skillDescription: entry.description,
          relativePath: entry.relativePath,
        },
      ],
      installStatePath,
      statePreview: {
        schemaVersion: 'egc.install.v1',
        installedAt: new Date().toISOString(),
        target: { id: 'warp-project', target: 'warp', kind: 'project', root: path.dirname(destinationPath), installStatePath },
        request: { profile: null, modules: [], includeComponents: [], excludeComponents: [], legacyLanguages: [], legacyMode: false },
        resolution: { selectedModules: ['workflow'], skippedModules: [] },
        source: { repoVersion: null, repoCommit: null, manifestVersion: 1 },
        operations: [],
      },
    };
  }

  if (test('applyInstallPlan creates AGENTS.md from scratch with the correct index entry', () => {
    const projectRoot = createTempDir('warp-apply-fresh-');
    try {
      const destinationPath = path.join(projectRoot, 'AGENTS.md');
      const installStatePath = path.join(projectRoot, '.warp', 'egc-install-state.json');
      const plan = buildMinimalPlan(destinationPath, tddEntry, installStatePath);

      applyInstallPlan(plan);

      assert.ok(fs.existsSync(destinationPath));
      const content = fs.readFileSync(destinationPath, 'utf8');
      assert.ok(content.includes('- **tdd-workflow**: TDD workflow guidance (`.warp/skills/tdd-workflow.md`)'));
    } finally {
      cleanup(projectRoot);
    }
  })) passed++; else failed++;

  if (test('applyInstallPlan merges into an existing AGENTS.md without touching unrelated content', () => {
    const projectRoot = createTempDir('warp-apply-existing-');
    try {
      const destinationPath = path.join(projectRoot, 'AGENTS.md');
      fs.writeFileSync(destinationPath, '# My Project\n\nCustom rules the user wrote.\n');
      const installStatePath = path.join(projectRoot, '.warp', 'egc-install-state.json');
      const plan = buildMinimalPlan(destinationPath, tddEntry, installStatePath);

      applyInstallPlan(plan);

      const content = fs.readFileSync(destinationPath, 'utf8');
      assert.ok(content.includes('# My Project'));
      assert.ok(content.includes('Custom rules the user wrote.'));
      assert.ok(content.includes('- **tdd-workflow**:'));
    } finally {
      cleanup(projectRoot);
    }
  })) passed++; else failed++;

  // --- Pure functions: mergeMemoryRule & removeMemoryRule (#1841) ---

  const memoryRuleText = '# Session Memory\n\nCall get_state at start, update_state at end.';

  if (test('mergeMemoryRule creates a fresh memory block when no existing content', () => {
    const result = mergeMemoryRule(null, memoryRuleText);
    assert.ok(result.includes('<!-- egc-memory:start -->'));
    assert.ok(result.includes('<!-- egc-memory:end -->'));
    assert.ok(result.includes('# Session Memory'));
    assert.ok(result.includes('Call get_state at start, update_state at end.'));
  })) passed++; else failed++;

  if (test('mergeMemoryRule appends to existing user content without altering it', () => {
    const existing = '# My Project\n\nCustom user rules.\n';
    const result = mergeMemoryRule(existing, memoryRuleText);
    assert.ok(result.startsWith('# My Project\n\nCustom user rules.'));
    assert.ok(result.includes('<!-- egc-memory:start -->'));
  })) passed++; else failed++;

  if (test('mergeMemoryRule coexists with skills index block in AGENTS.md', () => {
    const withSkills = mergeSkillIndexEntry('# My Project\n', tddEntry);
    const withBoth = mergeMemoryRule(withSkills, memoryRuleText);
    assert.ok(withBoth.includes('<!-- egc-skills-index:start -->'));
    assert.ok(withBoth.includes('<!-- egc-memory:start -->'));
    assert.ok(withBoth.includes('- **tdd-workflow**:'));
    assert.ok(withBoth.includes('# Session Memory'));
  })) passed++; else failed++;

  if (test('mergeMemoryRule updates existing memory block in place', () => {
    const once = mergeMemoryRule(null, memoryRuleText);
    const updated = mergeMemoryRule(once, '# Session Memory v2\nNew content');
    assert.ok(updated.includes('# Session Memory v2'));
    assert.ok(!updated.includes('Call get_state at start'));
    assert.strictEqual((updated.match(/<!-- egc-memory:start -->/g) || []).length, 1);
  })) passed++; else failed++;

  if (test('removeMemoryRule drops the block and keeps the rest of the file', () => {
    const existing = mergeMemoryRule('# My Project\n\nCustom rules.\n', memoryRuleText);
    const result = removeMemoryRule(existing);
    assert.ok(!result.includes('egc-memory'));
    assert.ok(!result.includes('Session Memory'));
    assert.ok(result.includes('# My Project'));
    assert.ok(result.includes('Custom rules.'));
  })) passed++; else failed++;

  if (test('removeMemoryRule leaves skills index intact', () => {
    const withBoth = mergeMemoryRule(mergeSkillIndexEntry(null, tddEntry), memoryRuleText);
    const result = removeMemoryRule(withBoth);
    assert.ok(!result.includes('egc-memory'));
    assert.ok(result.includes('<!-- egc-skills-index:start -->'));
    assert.ok(result.includes('- **tdd-workflow**:'));
  })) passed++; else failed++;

  if (test('applyInstallPlan merges memory rule into AGENTS.md (#1841)', () => {
    const projectRoot = createTempDir('warp-apply-memory-');
    try {
      const destinationPath = path.join(projectRoot, 'AGENTS.md');
      const installStatePath = path.join(projectRoot, '.warp', 'egc-install-state.json');
      const plan = {
        operations: [
          {
            kind: MERGE_MARKDOWN_MEMORY_RULE_KIND,
            moduleId: 'rules-core',
            sourceRelativePath: 'rules/common/memory.md',
            destinationPath,
            strategy: MERGE_MARKDOWN_MEMORY_RULE_KIND,
            ownership: 'managed',
            scaffoldOnly: false,
            ruleContent: memoryRuleText,
          },
        ],
        installStatePath,
        statePreview: {
          schemaVersion: 'egc.install.v1',
          installedAt: new Date().toISOString(),
          target: { id: 'warp-project', target: 'warp', kind: 'project', root: path.dirname(destinationPath), installStatePath },
          request: { profile: null, modules: [], includeComponents: [], excludeComponents: [], legacyLanguages: [], legacyMode: false },
          resolution: { selectedModules: ['rules-core'], skippedModules: [] },
          source: { repoVersion: null, repoCommit: null, manifestVersion: 1 },
          operations: [],
        },
      };

      applyInstallPlan(plan);

      assert.ok(fs.existsSync(destinationPath));
      const content = fs.readFileSync(destinationPath, 'utf8');
      assert.ok(content.includes('<!-- egc-memory:start -->'));
      assert.ok(content.includes('# Session Memory'));
      assert.ok(content.includes('Call get_state at start'));
    } finally {
      cleanup(projectRoot);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
