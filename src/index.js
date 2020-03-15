'use strict';

/**
 * @fileoverview Code coverage checker with LCOV and Cobertura support.
 * @module covercheck
 * @author idirdev
 */

const fs   = require('fs');
const path = require('path');

/**
 * @typedef {Object} FileCoverage
 * @property {string} file
 * @property {{found:number, hit:number}} lines
 * @property {{found:number, hit:number}} functions
 * @property {{found:number, hit:number}} branches
 */

/**
 * @typedef {Object} ThresholdResult
 * @property {string}  file
 * @property {boolean} pass
 * @property {Object}  coverage  - {lines, functions, branches} percentages.
 * @property {string[]} failures - Descriptions of failed thresholds.
 */

/**
 * Calculate a coverage percentage, returning 100 when found is 0.
 * @param {number} hit
 * @param {number} found
 * @returns {number} Percentage rounded to two decimal places.
 */
function calculatePercentage(hit, found) {
  if (found === 0) return 100;
  return Math.round((hit / found) * 10000) / 100;
}

/**
 * Parse LCOV formatted content into an array of FileCoverage objects.
 * @param {string} content - Raw LCOV file contents.
 * @returns {FileCoverage[]}
 */
function parseLcov(content) {
  const files   = [];
  let   current = null;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === 'SF:' || line.startsWith('SF:')) {
      current = {
        file:      line.slice(3),
        lines:     { found: 0, hit: 0 },
        functions: { found: 0, hit: 0 },
        branches:  { found: 0, hit: 0 },
      };
    } else if (line.startsWith('LF:') && current) {
      current.lines.found = parseInt(line.slice(3), 10) || 0;
    } else if (line.startsWith('LH:') && current) {
      current.lines.hit = parseInt(line.slice(3), 10) || 0;
    } else if (line.startsWith('FNF:') && current) {
      current.functions.found = parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('FNH:') && current) {
      current.functions.hit = parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('BRF:') && current) {
      current.branches.found = parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('BRH:') && current) {
      current.branches.hit = parseInt(line.slice(4), 10) || 0;
    } else if (line === 'end_of_record' && current) {
      files.push(current);
      current = null;
    }
  }

  return files;
}

/**
 * Parse Cobertura XML content into an array of FileCoverage objects.
 * Uses basic regex parsing without an XML parser.
 * @param {string} content - Raw Cobertura XML.
 * @returns {FileCoverage[]}
 */
function parseCobertura(content) {
  const files  = [];
  const classRe = /<class[^>]+filename="([^"]+)"[^>]*line-rate="([^"]+)"[^>]*>/g;
  let m;

  while ((m = classRe.exec(content)) !== null) {
    const filename  = m[1];
    const lineRate  = parseFloat(m[2]) || 0;

    // Extract branch-rate for this class block
    const branchRateMatch = m[0].match(/branch-rate="([^"]+)"/);
    const branchRate      = branchRateMatch ? parseFloat(branchRateMatch[1]) : 0;

    // Approximate: treat line-rate as a proxy for functions too
    files.push({
      file:      filename,
      lines:     { found: 100, hit: Math.round(lineRate  * 100) },
      functions: { found: 100, hit: Math.round(lineRate  * 100) },
      branches:  { found: 100, hit: Math.round(branchRate * 100) },
    });
  }

  return files;
}

/**
 * Search common locations for a coverage file in the given directory.
 * @param {string} dir
 * @returns {string|null} Absolute path to the coverage file, or null.
 */
function findCoverageFile(dir) {
  const candidates = [
    'lcov.info',
    path.join('coverage', 'lcov.info'),
    'cobertura.xml',
    path.join('coverage', 'cobertura.xml'),
  ];
  for (const rel of candidates) {
    const full = path.resolve(dir, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * Check a set of FileCoverage entries against thresholds.
 * @param {FileCoverage[]} coverageFiles
 * @param {{lines?:number, functions?:number, branches?:number}} [thresholds={}]
 * @returns {ThresholdResult[]}
 */
function checkThresholds(coverageFiles, thresholds = {}) {
  const tLines     = thresholds.lines     !== undefined ? thresholds.lines     : 80;
  const tFunctions = thresholds.functions !== undefined ? thresholds.functions : 80;
  const tBranches  = thresholds.branches  !== undefined ? thresholds.branches  : 80;

  return coverageFiles.map((fc) => {
    const lines     = calculatePercentage(fc.lines.hit,     fc.lines.found);
    const functions = calculatePercentage(fc.functions.hit, fc.functions.found);
    const branches  = calculatePercentage(fc.branches.hit,  fc.branches.found);
    const failures  = [];

    if (lines     < tLines)     failures.push(`lines ${lines}% < ${tLines}%`);
    if (functions < tFunctions) failures.push(`functions ${functions}% < ${tFunctions}%`);
    if (branches  < tBranches)  failures.push(`branches ${branches}% < ${tBranches}%`);

    return {
      file:     fc.file,
      pass:     failures.length === 0,
      coverage: { lines, functions, branches },
      failures,
    };
  });
}

/**
 * Compute aggregate coverage percentages across all files.
 * @param {FileCoverage[]} files
 * @returns {{lines:number, functions:number, branches:number}}
 */
function getOverallCoverage(files) {
  const totals = files.reduce((acc, fc) => {
    acc.linesFound     += fc.lines.found;
    acc.linesHit       += fc.lines.hit;
    acc.functionsFound += fc.functions.found;
    acc.functionsHit   += fc.functions.hit;
    acc.branchesFound  += fc.branches.found;
    acc.branchesHit    += fc.branches.hit;
    return acc;
  }, { linesFound: 0, linesHit: 0, functionsFound: 0, functionsHit: 0, branchesFound: 0, branchesHit: 0 });

  return {
    lines:     calculatePercentage(totals.linesHit,     totals.linesFound),
    functions: calculatePercentage(totals.functionsHit, totals.functionsFound),
    branches:  calculatePercentage(totals.branchesHit,  totals.branchesFound),
  };
}

/**
 * Format threshold results into a human-readable report string.
 * @param {ThresholdResult[]} results
 * @returns {string}
 */
function formatReport(results) {
  const lines = results.map((r) => {
    const status = r.pass ? 'PASS' : 'FAIL';
    const pct    = r.coverage;
    let line = `[${status}] ${r.file} | lines:${pct.lines}% functions:${pct.functions}% branches:${pct.branches}%`;
    if (r.failures.length) line += `\n       ${r.failures.join(', ')}`;
    return line;
  });
  return lines.join('\n');
}

/**
 * Return a summary object with overall pass/fail and aggregate numbers.
 * @param {ThresholdResult[]} results
 * @returns {{pass:boolean, total:number, passed:number, failed:number, overall:Object}}
 */
function summary(results) {
  const passed  = results.filter((r) => r.pass).length;
  const failed  = results.length - passed;
  return {
    pass:    failed === 0,
    total:   results.length,
    passed,
    failed,
  };
}

module.exports = {
  parseLcov,
  parseCobertura,
  findCoverageFile,
  calculatePercentage,
  checkThresholds,
  getOverallCoverage,
  formatReport,
  summary,
};
