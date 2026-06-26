// SPDX-License-Identifier: Apache-2.0
/**
 * Tests for the VS Code diagnostics adapter (cli/engine/vscode-detector.mjs).
 *
 * These tests import the adapter module directly (pre-bundle, pure ESM) so
 * they don't require a prior build step. The bundled dist/vscode/detector.js
 * is tested implicitly by tests/vscode-extension.test.js (which builds first).
 *
 * Assertions:
 *   1. A known anti-pattern in HTML text yields a finding with the right ruleId
 *      and a non-zero line number (not a whole-file fallback).
 *   2. A rule listed in config.ignoreRules is suppressed.
 *   3. vsCodeSeverity 'off' suppresses that rule.
 *   4. vsCodeSeverity 'error' maps to severity 'error' in the result.
 *   5. An unsupported languageId (e.g. 'python') yields zero diagnostics.
 *   6. A CSS finding (side-tab border) is detected and carries a line number.
 *   7. A JSX/TSX file with overused font is detected via languageId 'javascriptreact'.
 */
import { describe, test, expect } from 'bun:test';
import { detectForEditor, SUPPORTED_LANGUAGE_IDS } from '../cli/vscode-detector.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** HTML with an Inter font inline style — triggers 'overused-font' on line 1. */
const HTML_INTER = '<p style="font-family: Inter, sans-serif;">Hello</p>';

/** CSS with a side-tab border — triggers 'side-tab'. */
const CSS_SIDE_TAB = '.card { border-left: 4px solid rgb(59,130,246); border-radius: 8px; }';

/** JSX with an overused font via CSS-in-JS styled-component template literal. */
const JSX_INTER = 'const Button = styled.button`font-family: Inter, sans-serif;`;';

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

describe('detectForEditor — HTML', () => {
  test('detects overused-font in HTML text and returns the right ruleId', () => {
    const results = detectForEditor({ text: HTML_INTER, languageId: 'html' });
    const ids = results.map(r => r.ruleId);
    expect(ids).toContain('overused-font');
  });

  test('finding has a non-zero line number (not whole-file fallback)', () => {
    const results = detectForEditor({ text: HTML_INTER, languageId: 'html' });
    const f = results.find(r => r.ruleId === 'overused-font');
    expect(f).toBeDefined();
    expect(f.line).toBeGreaterThan(0);
  });

  test('finding has a non-empty snippet that identifies the font', () => {
    const results = detectForEditor({ text: HTML_INTER, languageId: 'html' });
    const f = results.find(r => r.ruleId === 'overused-font');
    expect(f).toBeDefined();
    expect(f.snippet).toBeTruthy();
    expect(f.snippet).toContain('Inter');
  });

  test('finding has a non-empty message', () => {
    const results = detectForEditor({ text: HTML_INTER, languageId: 'html' });
    const f = results.find(r => r.ruleId === 'overused-font');
    expect(f).toBeDefined();
    expect(typeof f.message).toBe('string');
    expect(f.message.length).toBeGreaterThan(0);
  });

  test('finding has a non-empty description', () => {
    const results = detectForEditor({ text: HTML_INTER, languageId: 'html' });
    const f = results.find(r => r.ruleId === 'overused-font');
    expect(f).toBeDefined();
    expect(f.description.length).toBeGreaterThan(0);
  });
});

describe('detectForEditor — CSS', () => {
  test('detects side-tab in CSS text', () => {
    const results = detectForEditor({ text: CSS_SIDE_TAB, languageId: 'css' });
    const ids = results.map(r => r.ruleId);
    expect(ids).toContain('side-tab');
  });

  test('CSS finding carries a line number', () => {
    const results = detectForEditor({ text: CSS_SIDE_TAB, languageId: 'css' });
    const f = results.find(r => r.ruleId === 'side-tab');
    expect(f).toBeDefined();
    expect(f.line).toBeGreaterThan(0);
  });
});

describe('detectForEditor — JSX / TSX', () => {
  test('detects overused-font via languageId javascriptreact', () => {
    const results = detectForEditor({ text: JSX_INTER, languageId: 'javascriptreact' });
    const ids = results.map(r => r.ruleId);
    expect(ids).toContain('overused-font');
  });

  test('detects overused-font via languageId typescriptreact', () => {
    const results = detectForEditor({ text: JSX_INTER, languageId: 'typescriptreact' });
    const ids = results.map(r => r.ruleId);
    expect(ids).toContain('overused-font');
  });
});

// ---------------------------------------------------------------------------
// Config: project-level ignoreRules
// ---------------------------------------------------------------------------

describe('detectForEditor — config.ignoreRules', () => {
  test('ignoreRules suppresses the matching rule', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      config: { ignoreRules: ['overused-font'] },
    });
    const ids = results.map(r => r.ruleId);
    expect(ids).not.toContain('overused-font');
  });

  test('ignoreRules for an unrelated rule does not suppress the finding', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      config: { ignoreRules: ['side-tab'] },
    });
    const ids = results.map(r => r.ruleId);
    expect(ids).toContain('overused-font');
  });

  test('empty ignoreRules array does not suppress anything', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      config: { ignoreRules: [] },
    });
    const ids = results.map(r => r.ruleId);
    expect(ids).toContain('overused-font');
  });
});

// ---------------------------------------------------------------------------
// VS Code severity overrides
// ---------------------------------------------------------------------------

describe('detectForEditor — vsCodeSeverity overrides', () => {
  test('"off" suppresses the rule entirely', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      vsCodeSeverity: { 'overused-font': 'off' },
    });
    const ids = results.map(r => r.ruleId);
    expect(ids).not.toContain('overused-font');
  });

  test('"error" maps to severity "error" in the result', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      vsCodeSeverity: { 'overused-font': 'error' },
    });
    const f = results.find(r => r.ruleId === 'overused-font');
    expect(f).toBeDefined();
    expect(f.severity).toBe('error');
  });

  test('"information" maps to severity "information"', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      vsCodeSeverity: { 'overused-font': 'information' },
    });
    const f = results.find(r => r.ruleId === 'overused-font');
    expect(f).toBeDefined();
    expect(f.severity).toBe('information');
  });

  test('"hint" maps to severity "hint"', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      vsCodeSeverity: { 'overused-font': 'hint' },
    });
    const f = results.find(r => r.ruleId === 'overused-font');
    expect(f).toBeDefined();
    expect(f.severity).toBe('hint');
  });

  test('no override: default severity is "warning"', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
    });
    const f = results.find(r => r.ruleId === 'overused-font');
    expect(f).toBeDefined();
    expect(f.severity).toBe('warning');
  });

  test('"off" for unrelated rule does not suppress the finding', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      vsCodeSeverity: { 'side-tab': 'off' },
    });
    const ids = results.map(r => r.ruleId);
    expect(ids).toContain('overused-font');
  });
});

// ---------------------------------------------------------------------------
// Unsupported / skipped language IDs
// ---------------------------------------------------------------------------

describe('detectForEditor — languageId routing', () => {
  test('unsupported languageId (python) yields zero diagnostics', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'python',
    });
    expect(results).toEqual([]);
  });

  test('unsupported languageId (markdown) yields zero diagnostics', () => {
    const results = detectForEditor({
      text: CSS_SIDE_TAB,
      languageId: 'markdown',
    });
    expect(results).toEqual([]);
  });

  test('unsupported languageId (typescript, not TSX) yields zero diagnostics', () => {
    // Plain TypeScript is not in scope — only TSX (React) is.
    const results = detectForEditor({
      text: CSS_SIDE_TAB,
      languageId: 'typescript',
    });
    expect(results).toEqual([]);
  });

  test('SUPPORTED_LANGUAGE_IDS exports the expected set', () => {
    for (const id of ['html', 'css', 'javascriptreact', 'typescriptreact', 'vue', 'svelte', 'astro']) {
      expect(SUPPORTED_LANGUAGE_IDS.has(id)).toBe(true);
    }
    expect(SUPPORTED_LANGUAGE_IDS.has('python')).toBe(false);
    expect(SUPPORTED_LANGUAGE_IDS.has('typescript')).toBe(false);
  });

  test('all supported languageIds run without throwing', () => {
    for (const langId of SUPPORTED_LANGUAGE_IDS) {
      expect(() => detectForEditor({ text: '/* empty */', languageId: langId })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Combined: ignoreRules + vsCodeSeverity
// ---------------------------------------------------------------------------

describe('detectForEditor — combined config and severity', () => {
  test('ignoreRules takes precedence: rule ignored by project config is gone even with severity override', () => {
    const results = detectForEditor({
      text: HTML_INTER,
      languageId: 'html',
      config: { ignoreRules: ['overused-font'] },
      vsCodeSeverity: { 'overused-font': 'error' },
    });
    const ids = results.map(r => r.ruleId);
    expect(ids).not.toContain('overused-font');
  });
});
