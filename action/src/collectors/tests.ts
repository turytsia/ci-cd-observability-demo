/**
 * Test Results Collector
 * 
 * Parses JUnit XML test results from various test frameworks
 */

import * as core from '@actions/core';
import * as glob from '@actions/glob';
import { promises as fs } from 'fs';
import { TestResults, TestSuite, TestCase } from '../types';

/**
 * Parse JUnit XML test results
 */
export async function collectTestResults(pattern: string): Promise<TestResults | null> {
  if (!pattern) {
    return null;
  }
  
  try {
    const globber = await glob.create(pattern);
    const files = await globber.glob();
    
    if (files.length === 0) {
      core.warning(`No test result files found matching pattern: ${pattern}`);
      return null;
    }
    
    core.info(`Found ${files.length} test result file(s)`);
    
    const results: TestResults = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      testSuites: [],
    };
    
    for (const file of files) {
      core.debug(`Parsing test results from: ${file}`);
      const content = await fs.readFile(file, 'utf-8');
      const parsed = parseJUnitXML(content);
      
      results.total += parsed.total;
      results.passed += parsed.passed;
      results.failed += parsed.failed;
      results.skipped += parsed.skipped;
      results.duration += parsed.duration;
      results.testSuites.push(...parsed.testSuites);
    }
    
    return results;
  } catch (error) {
    core.warning(`Failed to collect test results: ${error}`);
    return null;
  }
}

/**
 * Simple JUnit XML parser (no external dependencies)
 */
function parseJUnitXML(xml: string): TestResults {
  const results: TestResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    testSuites: [],
  };
  
  // Match testsuites or single testsuite
  const testsuitesMatch = xml.match(/<testsuites[^>]*>([\s\S]*)<\/testsuites>/);
  const content = testsuitesMatch ? testsuitesMatch[1] : xml;
  
  // Match all testsuite elements
  const suiteRegex = /<testsuite\s+([^>]+)>([\s\S]*?)<\/testsuite>/g;
  let suiteMatch;
  
  while ((suiteMatch = suiteRegex.exec(content)) !== null) {
    const attrs = suiteMatch[1];
    const suiteContent = suiteMatch[2];
    
    const suiteName = getAttr(attrs, 'name') || 'unknown';
    const suiteTests = parseInt(getAttr(attrs, 'tests') || '0', 10);
    const suiteFailures = parseInt(getAttr(attrs, 'failures') || '0', 10);
    const suiteErrors = parseInt(getAttr(attrs, 'errors') || '0', 10);
    const suiteSkipped = parseInt(getAttr(attrs, 'skipped') || '0', 10);
    const suiteTime = parseFloat(getAttr(attrs, 'time') || '0');
    
    const testCases: TestCase[] = [];
    
    // Parse individual test cases
    const testCaseRegex = /<testcase\s+([^>]*)\/?>([\s\S]*?)(?:<\/testcase>|(?=<testcase|<\/testsuite))/g;
    let testMatch;
    
    while ((testMatch = testCaseRegex.exec(suiteContent)) !== null) {
      const testAttrs = testMatch[1];
      const testContent = testMatch[2] || '';
      
      const testName = getAttr(testAttrs, 'name') || 'unknown';
      const testTime = parseFloat(getAttr(testAttrs, 'time') || '0');
      const className = getAttr(testAttrs, 'classname') || suiteName;
      
      const testCase: TestCase = {
        name: testName,
        classname: className,
        time: testTime,
        status: 'passed',
      };
      
      // Check for failure
      if (/<failure/.test(testContent)) {
        testCase.status = 'failed';
        const failureMatch = testContent.match(/<failure[^>]*message="([^"]*)"[^>]*>/);
        if (failureMatch) {
          testCase.message = failureMatch[1];
        }
        const stackMatch = testContent.match(/<failure[^>]*>([\s\S]*?)<\/failure>/);
        if (stackMatch) {
          testCase.stackTrace = stackMatch[1].trim();
        }
      }
      
      // Check for error
      if (/<error/.test(testContent)) {
        testCase.status = 'error';
        const errorMatch = testContent.match(/<error[^>]*message="([^"]*)"[^>]*>/);
        if (errorMatch) {
          testCase.message = errorMatch[1];
        }
      }
      
      // Check for skipped
      if (/<skipped/.test(testContent)) {
        testCase.status = 'skipped';
      }
      
      testCases.push(testCase);
      results.total++;
      
      if (testCase.status === 'passed') {
        results.passed++;
      } else if (testCase.status === 'failed' || testCase.status === 'error') {
        results.failed++;
      } else {
        results.skipped++;
      }
    }
    
    const suite: TestSuite = {
      name: suiteName,
      tests: suiteTests || testCases.length,
      failures: suiteFailures,
      errors: suiteErrors,
      skipped: suiteSkipped,
      time: suiteTime,
      testCases: testCases,
    };
    
    results.testSuites.push(suite);
    results.duration += suiteTime;
  }
  
  return results;
}

/**
 * Extract attribute value from XML element attributes string
 */
function getAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : null;
}
