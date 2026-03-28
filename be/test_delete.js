const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const workflows = await prisma.workflow.findMany({ include: { agents: true, executions: true } });
  if (workflows.length === 0) {
    console.log("No workflows to delete.");
    return;
  }
  
  const wf = workflows[0];
  console.log(`Attempting to delete workflow ${wf.id} with ${wf.agents.length} agents and ${wf.executions.length} executions...`);
  
  try {
    await prisma.workflow.delete({ where: { id: wf.id } });
    console.log("Delete successful!");
  } catch (e) {
    console.error("Delete failed:", e);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
