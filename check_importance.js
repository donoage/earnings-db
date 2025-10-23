const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkImportance() {
  try {
    // Get current week date range
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 4); // Friday
    
    const dateFrom = startOfWeek.toISOString().split('T')[0];
    const dateTo = endOfWeek.toISOString().split('T')[0];
    
    console.log(`\n=== Checking DB for ${dateFrom} to ${dateTo} ===\n`);
    
    // Count by importance
    const imp4 = await prisma.earning.count({
      where: {
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
        importance: 4,
      },
    });
    
    const imp5 = await prisma.earning.count({
      where: {
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
        importance: 5,
      },
    });
    
    const imp4Plus = await prisma.earning.count({
      where: {
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
        importance: { gte: 4 },
      },
    });
    
    console.log(`Importance 4: ${imp4}`);
    console.log(`Importance 5: ${imp5}`);
    console.log(`Importance >= 4: ${imp4Plus}`);
    
    // Sample some importance 4 earnings
    if (imp4 > 0) {
      console.log('\nSample importance 4 earnings:');
      const sample = await prisma.earning.findMany({
        where: {
          date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
          importance: 4,
        },
        take: 5,
        select: { ticker: true, date: true, importance: true, name: true },
      });
      sample.forEach(e => console.log(`  ${e.date.toISOString().split('T')[0]} ${e.ticker} (${e.importance}) - ${e.name}`));
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkImportance();
