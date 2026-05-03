# extract.mjs spec

## User stories

- As a wovenflow maintainer, I want `extract.mjs` to be tested in CI so regressions in the load-bearing test extractor are caught before users hit them.
- As a wovenflow user, I want confidence that `--lang` flags produce the filename conventions each language's standard test runner expects.

## Behaviors

### B1: default --lang extracts typescript fences to .test.ts files

∵ **IF** a `.spec.md` contains a fenced ` ```typescript ` block
↦ **WHEN** `extract.mjs <input> <output>` runs (no `--lang` flag)
∴ **THEN** an output file `<base>.test.ts` exists with the verbatim block contents

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { execFileSync } = require('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const EXTRACTOR = path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', 'testflow', 'extract.mjs');

  test('B1: default --lang extracts typescript fences to .test.ts files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b1-'));
    const specPath = path.join(dir, 'feature.spec.md');
    writeFileSync(specPath, '### B1\n\n```typescript\nconst foo = 1;\n```\n');
    const outDir = path.join(dir, 'out');
    execFileSync('node', [EXTRACTOR, specPath, outDir]);
    const expected = path.join(outDir, 'feature.spec.test.ts');
    assert.ok(existsSync(expected), `expected ${expected} to exist`);
    assert.match(readFileSync(expected, 'utf8'), /const foo = 1;/);
  });
}
```

### B2: --lang python sanitizes dots to underscores and prefixes with test_

∵ **IF** a `.spec.md` (with dot-containing basename) contains a fenced ` ```python ` block
↦ **WHEN** `extract.mjs <input> <output> --lang python` runs
∴ **THEN** the output file is named `test_<sanitized-base>.py` (dots → underscores) with verbatim block contents

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { execFileSync } = require('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const EXTRACTOR = path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', 'testflow', 'extract.mjs');

  test('B2: --lang python sanitizes dots to underscores and prefixes with test_', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b2-'));
    const specPath = path.join(dir, 'feature.spec.md');
    writeFileSync(specPath, '### B2\n\n```python\ndef test_b2():\n    assert True\n```\n');
    const outDir = path.join(dir, 'out');
    execFileSync('node', [EXTRACTOR, specPath, outDir, '--lang', 'python']);
    const expected = path.join(outDir, 'test_feature_spec.py');
    assert.ok(existsSync(expected), `expected ${expected} to exist`);
    assert.match(readFileSync(expected, 'utf8'), /def test_b2/);
  });
}
```

### B3: --lang java produces PascalCase output filenames

∵ **IF** a `.spec.md` (with snake_case basename) contains a fenced ` ```java ` block
↦ **WHEN** `extract.mjs <input> <output> --lang java` runs
∴ **THEN** the output file is named `<PascalCase>Test.java` (basename split on `[._-]` and capitalized, suffix `Test`)

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { execFileSync } = require('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const EXTRACTOR = path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', 'testflow', 'extract.mjs');

  test('B3: --lang java produces PascalCase output filenames', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b3-'));
    const specPath = path.join(dir, 'foo_bar.spec.md');
    writeFileSync(specPath, '### B3\n\n```java\n@Test public void b3() {}\n```\n');
    const outDir = path.join(dir, 'out');
    execFileSync('node', [EXTRACTOR, specPath, outDir, '--lang', 'java']);
    const expected = path.join(outDir, 'FooBarSpecTest.java');
    assert.ok(existsSync(expected), `expected ${expected} to exist`);
    assert.match(readFileSync(expected, 'utf8'), /@Test public void b3/);
  });
}
```

### B4: unsupported --lang exits non-zero with a helpful error

∵ **IF** a user invokes the extractor with `--lang` set to an unknown language
↦ **WHEN** `extract.mjs <input> <output> --lang nimrod` runs
∴ **THEN** the process exits non-zero and stderr names the unsupported language plus the override-flag hint

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { spawnSync } = require('node:child_process');
  const { mkdtempSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const EXTRACTOR = path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', 'testflow', 'extract.mjs');

  test('B4: unsupported --lang exits non-zero with a helpful error', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b4-'));
    const specPath = path.join(dir, 'feature.spec.md');
    writeFileSync(specPath, '### B4\n\n```python\nx\n```\n');
    const outDir = path.join(dir, 'out');
    const result = spawnSync('node', [EXTRACTOR, specPath, outDir, '--lang', 'nimrod'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'should exit non-zero');
    assert.match(result.stderr, /unsupported language "nimrod"/);
    assert.match(result.stderr, /--fence/);
  });
}
```

### B5: custom --fence + --name-template extracts unsupported languages

∵ **IF** a user passes both `--fence` and `--name-template` (for an unsupported language or DSL)
↦ **WHEN** `extract.mjs <input> <output> --fence mydsl --name-template '{snake}_check.mydsl'` runs
∴ **THEN** the output file uses the template (snake-cased basename) and contains the matching fence's body

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { execFileSync } = require('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const EXTRACTOR = path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', 'testflow', 'extract.mjs');

  test('B5: custom --fence + --name-template extracts unsupported languages', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b5-'));
    const specPath = path.join(dir, 'foo.bar.spec.md');
    writeFileSync(specPath, '### B5\n\n```mydsl\nSELECT 1;\n```\n');
    const outDir = path.join(dir, 'out');
    execFileSync('node', [EXTRACTOR, specPath, outDir, '--fence', 'mydsl', '--name-template', '{snake}_check.mydsl']);
    const expected = path.join(outDir, 'foo_bar_spec_check.mydsl');
    assert.ok(existsSync(expected), `expected ${expected} to exist`);
    assert.match(readFileSync(expected, 'utf8'), /SELECT 1;/);
  });
}
```
