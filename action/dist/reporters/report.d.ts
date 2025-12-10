/**
 * Report Generator
 *
 * Generates HTML and JSON reports, and GitHub Job Summary
 */
import { ObservabilityData } from '../types';
/**
 * Generate all reports
 */
export declare function generateReports(data: ObservabilityData, format: string): Promise<{
    htmlPath?: string;
    jsonPath?: string;
}>;
//# sourceMappingURL=report.d.ts.map