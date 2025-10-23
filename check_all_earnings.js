const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAll() {
  try {
    const total = await prisma.earning.count();
    console.log(`\nTotal earnings in DB: ${total}`);
    
    if (total > 0) {
      // Check importance distribution
      for (let imp = 0; imp <= 5; imp++) {
        const count = await prisma.earning.count({ where: { importance: imp } });
        if (count > 0) console.log(`  Importance ${imp}: ${count}`);
      }
      
      // Check date range
      const earliest = await prisma.earning.findFirst({ orderBy: { date: 'asc' }, select: { date: true } });
      const latest = await prisma.earning.findFirst({ orderBy: { date: 'desc' }, select: { date: true } });
      console.log(`\nDate range: ${earliest?.date.toISOString().split('T')[0]} to ${latest?.date.toISOString().split('T')[0]}`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAll();
