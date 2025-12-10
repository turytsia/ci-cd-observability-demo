/**
 * Type definitions for CI/CD Observability Action
 */
export interface Metadata {
    timestamp: string;
    repository: string;
    workflow: string;
    job: string;
    runId: number;
    runNumber: number;
    actor: string;
    ref: string;
    sha: string;
    eventName: string;
}
export interface JobMetrics {
    actionDuration?: number;
    workflowDuration?: number;
    queueTime?: number;
    [key: string]: number | string | undefined;
}
export interface TestResults {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    testSuites: TestSuite[];
}
export interface TestSuite {
    name: string;
    tests: number;
    failures: number;
    errors: number;
    skipped: number;
    time: number;
    testCases: TestCase[];
}
export interface TestCase {
    name: string;
    classname: string;
    time: number;
    status: 'passed' | 'failed' | 'skipped' | 'error';
    message?: string;
    stackTrace?: string;
}
export interface CoverageData {
    percentage: number;
    coveredLines: number;
    totalLines: number;
    coveredBranches?: number;
    totalBranches?: number;
    files: FileCoverage[];
}
export interface FileCoverage {
    path: string;
    percentage: number;
    coveredLines: number;
    totalLines: number;
}
export interface ObservabilityData {
    metadata: Metadata;
    metrics: JobMetrics;
    testResults: TestResults | null;
    coverage: CoverageData | null;
    customMetrics: Record<string, unknown>;
}
export interface WebhookPayload {
    event: string;
    timestamp: string;
    data: ObservabilityData;
    signature?: string;
}
