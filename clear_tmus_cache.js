const { createClient } = require('redis');
require('dotenv').config();

async function clearCache() {
  const client = createClient({
    url: process.env.REDIS_URL
  });
  
  await client.connect();
  console.log('Connected to Redis');
  
  // Delete the fundamentals cache for TMUS
  const deleted = await client.del('fundamentals:TMUS');
  console.log(`Deleted ${deleted} key(s) for fundamentals:TMUS`);
  
  // Also check if there's a DB entry and delete it to force refetch
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  const result = await prisma.fundamental.delete({
    where: { ticker: 'TMUS' }
  }).catch(() => null);
  
  if (result) {
    console.log('Deleted TMUS from database');
  } else {
    console.log('No TMUS entry in database');
  }
  
  await client.disconnect();
  await prisma.$disconnect();
  console.log('Done!');
}

clearCache().catch(console.error).finally(() => process.exit(0));
