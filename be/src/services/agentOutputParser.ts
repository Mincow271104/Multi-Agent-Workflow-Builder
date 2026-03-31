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

// ══════════════════════════════════════════════════════════════
// ██ NEW: AUTONOMOUS REFLECTION PROTOCOL PARSERS
// ══════════════════════════════════════════════════════════════

export interface OrchestratorPlanStep {
  agentName: string;
  taskScoping: string;
}

export interface OrchestratorPlan {
  plan: OrchestratorPlanStep[];
}

export function parseOrchestratorPlan(output: string): OrchestratorPlanStep[] {
  try {
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
    const match = output.match(codeBlockRegex);
    let rawJson = match && match[1] ? match[1] : output;
    
    if (!match) {
       const firstBrace = output.indexOf('{');
       const lastBrace = output.lastIndexOf('}');
       if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
         rawJson = output.substring(firstBrace, lastBrace + 1);
       }
    }
    
    const parsed = JSON.parse(rawJson);
    if (parsed && Array.isArray(parsed.plan)) {
      if (typeof parsed.plan[0] === 'string') {
         return parsed.plan.map((name: string) => ({ agentName: name, taskScoping: '' }));
      }
      return parsed.plan;
    }
  } catch (err) {
    logger.error('[Parser] Failed to parse Orchestrator plan:', err);
  }
  return [];
}

export interface AgentReflectionOutput {
  status: 'APPROVED' | 'REJECTED';
  feedback: string;
  content: string;
}

export function parseAgentReflection(output: string): AgentReflectionOutput {
  const fallback: AgentReflectionOutput = {
    status: 'REJECTED',
    feedback: `[SYSTEM ERROR] Agent failed to formulate a structured JSON evaluation. Please evaluate again and strictly follow the given JSON format. Raw Text Output: ${output}`,
    content: ''
  };

  try {
    // 1. Extract all code blocks that look like JSON
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/ig;
    let match;
    const jsonBlocks = [];
    while ((match = codeBlockRegex.exec(output)) !== null) {
      jsonBlocks.push(match[1]);
    }
    
    // Parse from the LAST block backwards (since the evaluation JSON is strictly requested at the END)
    for (let i = jsonBlocks.length - 1; i >= 0; i--) {
       try {
         const parsed = JSON.parse(jsonBlocks[i]);
         if (parsed && typeof parsed.status === 'string') {
           return {
             status: parsed.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
             feedback: parsed.feedback || '',
             content: parsed.content || output
           };
         }
       } catch (e) {
         // Skip invalid JSON blocks
       }
    }

    // 2. If no valid code block, try to find a raw JSON object string
    const lastBraceIndex = output.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
       const statusMatchIndex = output.lastIndexOf('{"status"');
       const startIdx = statusMatchIndex !== -1 ? statusMatchIndex : output.indexOf('{');
       
       if (startIdx !== -1 && lastBraceIndex > startIdx) {
          const rawJson = output.substring(startIdx, lastBraceIndex + 1);
          try {
             const parsed = JSON.parse(rawJson);
             if (parsed && typeof parsed.status === 'string') {
                return {
                  status: parsed.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
                  feedback: parsed.feedback || '',
                  content: parsed.content || output
                };
             }
          } catch (e) {
             // Let it fall to fallback
          }
       }
    }
  } catch (err) {
    logger.warn('[Parser] Fatal error parsing Agent Reflection JSON. Falling back to REJECTED.', err);
  }
  
  return fallback;
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
