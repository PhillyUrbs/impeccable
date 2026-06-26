// SPDX-License-Identifier: Apache-2.0
/**
 * VS Code diagnostics adapter for the Impeccable anti-pattern detector.
 *
 * This module is the thin editor-facing layer bundled into dist/vscode/detector.js
 * by buildVSCodeExtension(). It takes document text and metadata, calls the
 * existing detectText engine, applies project config filtering and VS Code
 * severity overrides, and returns plain diagnostic-shaped objects that the
 * extension can map to vscode.Diagnostic instances without coupling the engine
 * to any VS Code API.
 *
 * The extension's activate() function handles:
 *   - Reading the workspace .impeccable/config.json (via readDetectionConfig)
 *   - Reading vscode settings for impeccable.detector.severity overrides
 *   - Constructing the vscode.Range for each finding (snippet / line lookup)
 *   - Populating a vscode.DiagnosticCollection
 *
 * This module handles:
 *   - Routing by languageId (skip unsupported languages)
 *   - Calling detectText with the right pseudo-path / extension
 *   - Applying filterDetectionFindings (ignoreRules / ignoreFiles / ignoreValues)
 *   - Applying vsCodeSeverity overrides ('off' suppresses, others re-map severity)
 */

import { detectText } from './engine/engines/regex/detect-text.mjs';
import { filterDetectionFindings, readDetectionConfig } from './lib/impeccable-config.mjs';

export { readDetectionConfig };

/** Languages the detector understands. Everything else is silently skipped. */
export const SUPPORTED_LANGUAGE_IDS = new Set([
  'html',
  'css',
  'javascriptreact',
  'typescriptreact',
  'vue',
  'svelte',
  'astro',
]);

/** File extension used as the pseudo-path passed to detectText per languageId. */
const EXT_FOR_LANGUAGE = {
  html: '.html',
  css: '.css',
  javascriptreact: '.jsx',
  typescriptreact: '.tsx',
  vue: '.vue',
  svelte: '.svelte',
  astro: '.astro',
};

/**
 * Detect anti-patterns in a document and return diagnostic-shaped objects.
 *
 * @param {object} opts
 * @param {string}  opts.text         - Document text (full file content).
 * @param {string}  opts.languageId   - VS Code languageId (e.g. 'html', 'css').
 * @param {object}  [opts.config]     - Merged detection config (ignoreRules,
 *                                      ignoreFiles, ignoreValues). Defaults to
 *                                      the empty config (no ignores).
 * @param {object}  [opts.vsCodeSeverity] - Per-rule severity overrides from
 *                                      impeccable.detector.severity VS Code
 *                                      setting: { [ruleId]: 'error' |
 *                                      'warning' | 'information' | 'hint' |
 *                                      'off' }. 'off' suppresses the rule.
 *
 * @returns {Array<{ruleId:string, message:string, line:number, snippet:string,
 *                  description:string, severity:string}>}
 *   Plain objects — no VS Code API dependency. The `line` field is 1-based
 *   (matching the engine output); callers must subtract 1 for VS Code Ranges.
 *   A value of 0 means the finding is page-level (no precise line).
 */
export function detectForEditor(opts) {
  const { text, languageId, config = {}, vsCodeSeverity = {} } = opts;

  if (!SUPPORTED_LANGUAGE_IDS.has(languageId)) {
    return [];
  }

  const ext = EXT_FOR_LANGUAGE[languageId] || '.html';
  // Use a pseudo path that carries the right extension so detectText can
  // derive the file type from extFromFilePath(). The actual content comes
  // from the `text` parameter — detectText never reads this path from disk.
  const pseudoPath = `editor${ext}`;

  const raw = detectText(text, pseudoPath, {});

  // Apply project-level config (ignoreRules, ignoreFiles, ignoreValues).
  const projectConfig = {
    ignoreRules: Array.isArray(config.ignoreRules) ? config.ignoreRules : [],
    ignoreFiles: Array.isArray(config.ignoreFiles) ? config.ignoreFiles : [],
    ignoreValues: Array.isArray(config.ignoreValues) ? config.ignoreValues : [],
  };
  const filtered = filterDetectionFindings(raw, projectConfig);

  // Apply VS Code per-rule severity overrides. 'off' suppresses the rule;
  // other values override the diagnostic severity (default: 'warning').
  return filtered
    .filter(f => {
      const override = vsCodeSeverity[f.antipattern];
      return override === undefined || override !== 'off';
    })
    .map(f => {
      const override = vsCodeSeverity[f.antipattern];
      const severity = override && override !== 'off' ? override : 'warning';
      return {
        ruleId: f.antipattern,
        message: f.snippet
          ? `${f.name}: ${f.snippet}`
          : f.name,
        line: f.line || 0,
        snippet: f.snippet || '',
        description: f.description || '',
        severity,
      };
    });
}
