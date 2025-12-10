/**
 * Coverage Collector
 * 
 * Parses coverage data from various formats (Cobertura, LCOV, etc.)
 */

import * as core from '@actions/core';
import * as glob from '@actions/glob';
import { promises as fs } from 'fs';
import { CoverageData, FileCoverage } from '../types';

/**
 * Collect coverage data from coverage report files
 */
export async function collectCoverage(pattern: string): Promise<CoverageData | null> {
  if (!pattern) {
    return null;
  }
  
  try {
    const globber = await glob.create(pattern);
    const files = await globber.glob();
    
    if (files.length === 0) {
      core.warning(`No coverage files found matching pattern: ${pattern}`);
      return null;
    }
    
    core.info(`Found ${files.length} coverage file(s)`);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      
      // Try to detect format and parse
      if (file.endsWith('.xml') || content.includes('<coverage')) {
        return parseCoberturaXML(content);
      } else if (file.endsWith('.info') || content.startsWith('TN:')) {
        return parseLCOV(content);
      } else if (file.endsWith('.json')) {
        return parseJSONCoverage(content);
      }
    }
    
    core.warning('Could not determine coverage format');
    return null;
  } catch (error) {
    core.warning(`Failed to collect coverage: ${error}`);
    return null;
  }
}

/**
 * Parse Cobertura XML coverage format
 */
function parseCoberturaXML(xml: string): CoverageData {
  const coverage: CoverageData = {
    percentage: 0,
    coveredLines: 0,
    totalLines: 0,
    coveredBranches: 0,
    totalBranches: 0,
    files: [],
  };
  
  // Parse coverage element attributes
  const coverageMatch = xml.match(/<coverage[^>]+>/);
  if (coverageMatch) {
    const attrs = coverageMatch[0];
    const lineRate = parseFloat(getAttr(attrs, 'line-rate') || '0');
    coverage.percentage = lineRate * 100;
    coverage.coveredLines = parseInt(getAttr(attrs, 'lines-covered') || '0', 10);
    coverage.totalLines = parseInt(getAttr(attrs, 'lines-valid') || '0', 10);
    coverage.coveredBranches = parseInt(getAttr(attrs, 'branches-covered') || '0', 10);
    coverage.totalBranches = parseInt(getAttr(attrs, 'branches-valid') || '0', 10);
  }
  
  // Parse individual class/file coverage
  const classRegex = /<class[^>]+name="([^"]*)"[^>]*filename="([^"]*)"[^>]*line-rate="([^"]*)"/g;
  let classMatch;
  
  while ((classMatch = classRegex.exec(xml)) !== null) {
    const lineRate = parseFloat(classMatch[3]);
    coverage.files.push({
      path: classMatch[2],
      percentage: lineRate * 100,
      coveredLines: 0, // Not available in class element
      totalLines: 0,
    });
  }
  
  return coverage;
}

/**
 * Parse LCOV format
 */
function parseLCOV(content: string): CoverageData {
  const coverage: CoverageData = {
    percentage: 0,
    coveredLines: 0,
    totalLines: 0,
    coveredBranches: 0,
    totalBranches: 0,
    files: [],
  };
  
  const lines = content.split('\n');
  let currentFile: FileCoverage | null = null;
  let fileLinesHit = 0;
  let fileLinesTotal = 0;
  
  for (const line of lines) {
    const [tag, value] = line.split(':');
    
    switch (tag) {
      case 'SF': // Source file
        if (currentFile) {
          currentFile.percentage = fileLinesTotal > 0 ? (fileLinesHit / fileLinesTotal) * 100 : 0;
          currentFile.coveredLines = fileLinesHit;
          currentFile.totalLines = fileLinesTotal;
          coverage.files.push(currentFile);
        }
        currentFile = {
          path: value,
          percentage: 0,
          coveredLines: 0,
          totalLines: 0,
        };
        fileLinesHit = 0;
        fileLinesTotal = 0;
        break;
        
      case 'LH': // Lines hit
        fileLinesHit = parseInt(value, 10);
        coverage.coveredLines += fileLinesHit;
        break;
        
      case 'LF': // Lines found
        fileLinesTotal = parseInt(value, 10);
        coverage.totalLines += fileLinesTotal;
        break;
        
      case 'BRH': // Branches hit
        coverage.coveredBranches = (coverage.coveredBranches || 0) + parseInt(value, 10);
        break;
        
      case 'BRF': // Branches found
        coverage.totalBranches = (coverage.totalBranches || 0) + parseInt(value, 10);
        break;
        
      case 'end_of_record':
        if (currentFile) {
          currentFile.percentage = fileLinesTotal > 0 ? (fileLinesHit / fileLinesTotal) * 100 : 0;
          currentFile.coveredLines = fileLinesHit;
          currentFile.totalLines = fileLinesTotal;
          coverage.files.push(currentFile);
          currentFile = null;
        }
        break;
    }
  }
  
  // Calculate overall percentage
  coverage.percentage = coverage.totalLines > 0 
    ? (coverage.coveredLines / coverage.totalLines) * 100 
    : 0;
  
  return coverage;
}

/**
 * Parse JSON coverage format (e.g., istanbul/nyc)
 */
function parseJSONCoverage(content: string): CoverageData {
  const coverage: CoverageData = {
    percentage: 0,
    coveredLines: 0,
    totalLines: 0,
    coveredBranches: 0,
    totalBranches: 0,
    files: [],
  };
  
  try {
    const data = JSON.parse(content);
    
    // Handle istanbul/nyc format
    if (data.total) {
      coverage.coveredLines = data.total.lines?.covered || 0;
      coverage.totalLines = data.total.lines?.total || 0;
      coverage.coveredBranches = data.total.branches?.covered || 0;
      coverage.totalBranches = data.total.branches?.total || 0;
      coverage.percentage = data.total.lines?.pct || 0;
    }
    
    // Parse individual files
    for (const [filePath, fileData] of Object.entries(data)) {
      if (filePath === 'total') continue;
      
      const fd = fileData as { lines?: { pct?: number; covered?: number; total?: number } };
      coverage.files.push({
        path: filePath,
        percentage: fd.lines?.pct || 0,
        coveredLines: fd.lines?.covered || 0,
        totalLines: fd.lines?.total || 0,
      });
    }
  } catch {
    // Invalid JSON, return empty coverage
  }
  
  return coverage;
}

/**
 * Extract attribute value from XML element
 */
function getAttr(element: string, name: string): string | null {
  const match = element.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : null;
}
