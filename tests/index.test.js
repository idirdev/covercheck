'use strict';

/**
 * @fileoverview Tests for covercheck.
 * @author idirdev
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseLcov,
  parseCobertura,
  calculatePercentage,
  checkThresholds,
  getOverallCoverage,
  formatReport,
  summary,
} = require('../src/index.js');

// ── calculatePercentage ────────────────────────────────────────────────────
describe('calculatePercentage', () => {
  it('returns 100 when found is 0', () => {
    assert.equal(calculatePercentage(0, 0), 100);
  });

  it('calculates basic percentage', () => {
    assert.equal(calculatePercentage(80, 100), 80);
  });

  it('rounds to two decimal places', () => {
    assert.equal(calculatePercentage(1, 3), 33.33);
  });
});

// ── parseLcov ──────────────────────────────────────────────────────────────
describe('parseLcov', () => {
  const lcovSample = [
    'SF:src/index.js',
    'FNF:5',
    'FNH:4',
    'LF:100',
    'LH:85',
    'BRF:20',
    'BRH:16',
    'end_of_record',
    'SF:src/utils.js',
    'FNF:3',
    'FNH:3',
    'LF:50',
    'LH:50',
    'BRF:10',
    'BRH:8',
    'end_of_record',
  ].join('\n');

  it('parses multiple files', () => {
    const res = parseLcov(lcovSample);
    assert.equal(res.length, 2);
  });

  it('extracts file name', () => {
    const res = parseLcov(lcovSample);
    assert.equal(res[0].file, 'src/index.js');
  });

  it('extracts line coverage', () => {
    const res = parseLcov(lcovSample);
    assert.equal(res[0].lines.found, 100);
    assert.equal(res[0].lines.hit,   85);
  });

  it('extracts function coverage', () => {
    const res = parseLcov(lcovSample);
    assert.equal(res[0].functions.found, 5);
    assert.equal(res[0].functions.hit,   4);
  });

  it('extracts branch coverage', () => {
    const res = parseLcov(lcovSample);
    assert.equal(res[0].branches.found, 20);
    assert.equal(res[0].branches.hit,   16);
  });
});

// ── parseCobertura ─────────────────────────────────────────────────────────
describe('parseCobertura', () => {
  const xml = `<?xml version="1.0" ?>
<coverage>
  <packages>
    <package>
      <classes>
        <class filename="src/app.js" line-rate="0.9" branch-rate="0.75">
        </class>
        <class filename="src/lib.js" line-rate="0.6" branch-rate="0.5">
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;

  it('parses class entries', () => {
    const res = parseCobertura(xml);
    assert.equal(res.length, 2);
  });

  it('extracts filename', () => {
    const res = parseCobertura(xml);
    assert.equal(res[0].file, 'src/app.js');
  });

  it('converts line-rate to hit/found', () => {
    const res = parseCobertura(xml);
    assert.equal(res[0].lines.hit, 90);
  });
});

// ── checkThresholds ────────────────────────────────────────────────────────
describe('checkThresholds', () => {
  const passingFile = {
    file:      'ok.js',
    lines:     { found: 100, hit: 90 },
    functions: { found: 10,  hit: 9  },
    branches:  { found: 20,  hit: 18 },
  };

  const failingFile = {
    file:      'bad.js',
    lines:     { found: 100, hit: 70 },
    functions: { found: 10,  hit: 6  },
    branches:  { found: 20,  hit: 14 },
  };

  it('marks a well-covered file as passing', () => {
    const [r] = checkThresholds([passingFile], { lines: 80, functions: 80, branches: 80 });
    assert.equal(r.pass, true);
  });

  it('marks a poorly-covered file as failing', () => {
    const [r] = checkThresholds([failingFile], { lines: 80, functions: 80, branches: 80 });
    assert.equal(r.pass, false);
  });

  it('includes failure descriptions', () => {
    const [r] = checkThresholds([failingFile], { lines: 80, functions: 80, branches: 80 });
    assert.ok(r.failures.length > 0);
  });

  it('passes with a lower threshold', () => {
    const [r] = checkThresholds([failingFile], { lines: 60, functions: 60, branches: 60 });
    assert.equal(r.pass, true);
  });
});

// ── getOverallCoverage ─────────────────────────────────────────────────────
describe('getOverallCoverage', () => {
  it('aggregates multiple files', () => {
    const files = [
      { lines: { found: 100, hit: 80 }, functions: { found: 10, hit: 8  }, branches: { found: 20, hit: 16 } },
      { lines: { found: 100, hit: 80 }, functions: { found: 10, hit: 8  }, branches: { found: 20, hit: 16 } },
    ];
    const ov = getOverallCoverage(files);
    assert.equal(ov.lines, 80);
    assert.equal(ov.functions, 80);
    assert.equal(ov.branches, 80);
  });
});

// ── summary ────────────────────────────────────────────────────────────────
describe('summary', () => {
  it('counts passed and failed correctly', () => {
    const results = [
      { pass: true,  failures: [] },
      { pass: false, failures: ['lines 50% < 80%'] },
      { pass: true,  failures: [] },
    ];
    const s = summary(results);
    assert.equal(s.passed, 2);
    assert.equal(s.failed, 1);
    assert.equal(s.pass,   false);
  });

  it('passes when all files pass', () => {
    const results = [{ pass: true, failures: [] }];
    const s = summary(results);
    assert.equal(s.pass, true);
  });
});
