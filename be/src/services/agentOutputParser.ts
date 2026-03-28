// ===================================================================
// agentOutputParser.ts — Structured Output Parser for Agent Responses
// ===================================================================
//
// Parses agent output specifically geared toward extracting the new 
// JSON template format containing "next_agent" and "needs_revision".
// ===================================================================

import { logger } from '../utils';

export interface ParsedAgentOutput {
  quality_score: number;
  has_issue: boolean;
  needs_revision: boolean;
  issue_details: string;
  final_output: string;
  decision: 'APPROVED' | 'NEEDS_REVISION' | 'REDO' | null;
  raw: string;
  next_agent: string | null;
  revision_to: string | null;
}

export function parseAgentOutput(output: string): ParsedAgentOutput {
  const result: ParsedAgentOutput = {
    quality_score: -1,
    has_issue: false,
    needs_revision: false,
    issue_details: '',

    final_output: output,
    decision: null,
    raw: output,
    next_agent: null,
    revision_to: null,
  };

  if (!output || output.trim().length === 0) {
    result.has_issue = true;
    result.issue_details = 'Agent produced empty output';
    return result;
  }

  let parsedMetadata: any = null;
  
  // 1. Try to extract from markdown json block
  const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
  const matchCodeBlock = output.match(codeBlockRegex);
  
  let rawJsonString = '';

  if (matchCodeBlock && matchCodeBlock[1]) {
    rawJsonString = matchCodeBlock[1];
  } else {
    // 2. Fallback: Find the first { and the last } strictly
    const firstBrace = output.indexOf('{');
    const lastBrace = output.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      rawJsonString = output.substring(firstBrace, lastBrace + 1);
    }
  }

  if (rawJsonString) {
    try {
      parsedMetadata = JSON.parse(rawJsonString);
    } catch (err) {
      logger.warn('[Parser] Failed to parse extracted JSON block:', err);
      // Attempt aggressive cleanup if it failed (e.g., trailing commas)
      try {
        const cleanedJson = rawJsonString.replace(/,\s*([}\]])/g, '$1');
        parsedMetadata = JSON.parse(cleanedJson);
      } catch (e2) {
        logger.error('[Parser] Second attempt to parse JSON failed. Giving up.');
      }
    }
  }

  if (parsedMetadata) {
    result.quality_score = Number(parsedMetadata.quality_score ?? -1);
    result.final_output = parsedMetadata.content || output;
    
    // Evaluate target nodes
    result.next_agent = parsedMetadata.next_agent ?? null;
    result.revision_to = parsedMetadata.revision_to ?? null;
    result.needs_revision = parsedMetadata.needs_revision === true;

    if (parsedMetadata.needs_revision === true || (result.quality_score > 0 && result.quality_score <= 7)) {
      result.has_issue = true;
      result.decision = 'NEEDS_REVISION';
    } else {
      result.decision = 'APPROVED';
    }
  } else {
    // If no JSON is found, fallback strictly to assuming it's just raw content string and flag an error
    logger.warn('[Parser] No JSON detected in the output payload. Output might be invalid.');
    result.has_issue = true;
    result.issue_details = "Output format was invalid (No valid JSON found).";
  }

  return result;
}

export function extractOrchestratorContent(outputText: string): { status: string; forwardContent: string } {
  // Splitting Orchestrator Status from the actual payload content to forward
  const parts = outputText.split('=== END STATUS ===');
  return {
    status: parts[0] ? parts[0] + '=== END STATUS ===\\n' : '',
    forwardContent: parts[1] ? parts[1].trim() : outputText
  };
}

export function shouldTriggerFeedback(output: string): boolean {
  return parseAgentOutput(output).has_issue;
}
