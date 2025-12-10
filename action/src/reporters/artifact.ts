/**
 * Artifact Uploader
 * 
 * Uploads observability reports as GitHub Action artifacts
 */

import * as core from '@actions/core';
import { DefaultArtifactClient } from '@actions/artifact';

/**
 * Upload reports as artifacts
 */
export async function uploadArtifacts(
  artifactName: string,
  files: string[]
): Promise<void> {
  if (files.length === 0) {
    core.info('No files to upload as artifacts');
    return;
  }
  
  try {
    const client = new DefaultArtifactClient();
    
    // Get root directory from first file
    const rootDirectory = process.cwd();
    
    const { id, size } = await client.uploadArtifact(
      artifactName,
      files,
      rootDirectory
    );
    
    if (id !== undefined) {
      core.info(`Uploaded artifact "${artifactName}" (ID: ${id}, Size: ${formatBytes(size ?? 0)})`);
      core.setOutput('artifact-id', id.toString());
    } else {
      core.info(`Uploaded artifact "${artifactName}"`);
    }
  } catch (error) {
    core.warning(`Failed to upload artifacts: ${error}`);
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
