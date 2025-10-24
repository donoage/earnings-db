const { PrismaClient } = require('@prisma/client');

async function checkDb() {
  const prisma = new PrismaClient();
  
  try {
    const tmus = await prisma.fundamental.findUnique({
      where: { ticker: 'TMUS' }
    });
    
    if (tmus) {
      console.log('TMUS found in database:');
      console.log(JSON.stringify({
        ticker: tmus.ticker,
        companyName: tmus.companyName,
        exchange: tmus.exchange,
        sector: tmus.sector,
        industry: tmus.industry,
        marketCap: tmus.marketCap?.toString(),
        updatedAt: tmus.updatedAt
      }, null, 2));
    } else {
      console.log('TMUS not found in database');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkDb().catch(console.error).finally(() => process.exit(0));
