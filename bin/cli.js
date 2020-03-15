#!/usr/bin/env node
'use strict';

/**
 * @fileoverview CLI for covercheck – verify coverage against thresholds.
 * @author idirdev
 */

const path = require('path');
const fs   = require('fs');
const {
  parseLcov,
  parseCobertura,
  findCoverageFile,
  checkThresholds,
  getOverallCoverage,
  formatReport,
  summary,
} = require('../src/index.js');

const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1];
}

function hasFlag(name) { return args.includes(name); }

if (hasFlag('--help') || hasFlag('-h')) {
  console.log([
    'Usage: covercheck [dir] [options]',
    '',
    'Options:',
    '  --file <path>       Path to coverage file (lcov.info or cobertura.xml)',
    '  --lines <n>         Line coverage threshold % (default: 80)',
    '  --functions <n>     Function coverage threshold % (default: 80)',
    '  --branches <n>      Branch coverage threshold % (default: 80)',
    '  --json              Output results as JSON',
    '  --help              Show this help message',
  ].join('\n'));
  process.exit(0);
}

const dir        = args.find((a) => !a.startsWith('--')) || '.';
const filePath   = flag('--file', null);
const lines      = parseInt(flag('--lines',     '80'), 10);
const functions  = parseInt(flag('--functions', '80'), 10);
const branches   = parseInt(flag('--branches',  '80'), 10);
const jsonOutput = hasFlag('--json');

const resolvedFile = filePath
  ? path.resolve(filePath)
  : findCoverageFile(path.resolve(dir));

if (!resolvedFile) {
  console.error('[covercheck] No coverage file found. Use --file to specify one.');
  process.exit(1);
}

const content   = fs.readFileSync(resolvedFile, 'utf8');
const isCobertura = resolvedFile.endsWith('.xml');
const parsed    = isCobertura ? parseCobertura(content) : parseLcov(content);

if (parsed.length === 0) {
  console.error('[covercheck] No coverage data found in file.');
  process.exit(1);
}

const thresholds = { lines, functions, branches };
const results    = checkThresholds(parsed, thresholds);
const overall    = getOverallCoverage(parsed);
const sum        = summary(results);

if (jsonOutput) {
  console.log(JSON.stringify({ results, overall, summary: sum }, null, 2));
} else {
  console.log(formatReport(results));
  console.log('');
  console.log(`Overall: lines:${overall.lines}% functions:${overall.functions}% branches:${overall.branches}%`);
  console.log(`Summary: ${sum.passed}/${sum.total} files passed`);
}

process.exit(sum.pass ? 0 : 1);
