const { PrismaClient } = require('@prisma/client');

// Use public database URL
const DATABASE_URL = 'postgresql://postgres:MKaqNktWGYUbouTQhHzMoIjTLrjpZoCF@postgres.railway.internal:5432/railway';

async function clearDbEntries() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL
      }
    }
  });
  
  try {
    // Delete TMUS, NVDA, AAPL from database
    const tickers = ['TMUS', 'NVDA', 'AAPL'];
    
    for (const ticker of tickers) {
      const result = await prisma.fundamental.delete({
        where: { ticker }
      }).catch(() => null);
      
      if (result) {
        console.log(`Deleted ${ticker} from database`);
      } else {
        console.log(`No ${ticker} entry in database`);
      }
    }
    
    await prisma.$disconnect();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  }
}

clearDbEntries().catch(console.error).finally(() => process.exit(0));
