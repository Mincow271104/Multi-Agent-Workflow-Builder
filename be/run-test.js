const fs = require('fs');

const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

async function runTests() {
  console.log('=== STARTING ORCHESTRATOR TESTS ===');
  
  // 1. Bypass Login
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('No user found in DB!');
    return;
  }
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1d' }
  );
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  async function createWorkflow(name, edges, isDynamic = false) {
    let baseNodes = [
      { id: 'orch', type: 'agentNode', data: { label: 'Orchestrator', role: 'Orchestrator', provider: 'ollama', model: 'deepseek-r1:70b' }},
      { id: 'res', type: 'agentNode', data: { label: 'Researcher', role: 'Researcher', provider: 'ollama', model: 'deepseek-r1:70b' }},
      { id: 'wri', type: 'agentNode', data: { label: 'Writer', role: 'Writer', provider: 'ollama', model: 'deepseek-r1:70b' }},
      { id: 'cri', type: 'agentNode', data: { label: 'Critic', role: 'Critic', provider: 'ollama', model: 'deepseek-r1:70b' }}
    ];

    if (!isDynamic && edges.length > 0) {
      // If it's waterfall/hybrid, we don't necessarily keep all nodes if we don't want to.
      // E.g., Waterfall doesn't need Orchestrator.
    }

    const workflowData = {
      name,
      description: 'Automated Test',
      config: {
        nodes: baseNodes,
        edges: edges
      }
    };

    const res = await fetch('http://localhost:5000/api/v1/workflows', {
      method: 'POST',
      headers,
      body: JSON.stringify(workflowData)
    });
    const { data } = await res.json();
    return data.id;
  }

  async function runAndPoll(workflowId, prompt) {
    const startRes = await fetch('http://localhost:5000/api/v1/executions/start', {
      method: 'POST',
      headers,
      body: JSON.stringify({ workflowId, input: prompt })
    });
    
    if (!startRes.ok) {
      console.error('Start failed', await startRes.text());
      return;
    }
    
    const { data: startData } = await startRes.json();
    const execId = startData.executionId;
    console.log(`Started execution ${execId} for ${workflowId} in background.`);

    while (true) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`http://localhost:5000/api/v1/executions/${execId}`, { headers });
      const { data: pollingData } = await pollRes.json();
      
      console.log(`Status: ${pollingData.status}`);
      if (pollingData.status === 'COMPLETED' || pollingData.status === 'FAILED') {
        const logs = typeof pollingData.logs === 'string' ? JSON.parse(pollingData.logs) : pollingData.logs;
        console.log(`------------- LOGS for ${execId} -------------`);
        if(logs) {
           logs.forEach(l => console.log(`[${l.agentName}] -> ${l.output.substring(0, 100)}...`));
        }
        console.log(`------------- FINAL RESULT -------------`);
        console.log(pollingData.result);
        console.log(`----------------------------------------`);
        break;
      }
    }
  }

  // TEST 1: PURE DYNAMIC MODE (No edges, has Orchestrator)
  console.log('\\n--- CREATING DYNAMIC WORKFLOW ---');
  const dynId = await createWorkflow('Dynamic Test', [], true);
  console.log('Dynamic Workflow ID:', dynId);
  await runAndPoll(dynId, 'Write a strict 1-sentence summary of AI in healthcare in 2026. The critic must ensure it is exactly 1 sentence and extremely professional.');

  // Note: Hybrid and Waterfall require edges. We can test them subsequently if Dynamic succeeds.
}

runTests().catch(console.error);
