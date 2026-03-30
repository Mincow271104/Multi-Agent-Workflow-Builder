const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

async function main() {
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
  console.log('---TOKEN---');
  console.log(token);
  console.log('---END---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
