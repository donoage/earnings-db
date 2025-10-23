const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDBStatus() {
  try {
    // Check if tables exist and have data
    const [earningsCount, logosCount, fundamentalsCount] = await Promise.all([
      prisma.earning.count(),
      prisma.logo.count(),
      prisma.fundamental.count(),
    ]);

    console.log('\n=== Database Status ===');
    console.log(`Earnings: ${earningsCount}`);
    console.log(`Logos: ${logosCount}`);
    console.log(`Fundamentals: ${fundamentalsCount}`);

    if (earningsCount === 0) {
      console.log('\n⚠️  Database is empty - no earnings cached yet');
      console.log('This is normal if:');
      console.log('  1. The earnings-db service was recently deployed');
      console.log('  2. No requests have been made to the API yet');
      console.log('  3. The database was recently reset');
    }

    // Check recent earnings from Polygon API directly
    console.log('\n=== Testing Polygon API ===');
    const axios = require('axios');
    const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
    
    if (POLYGON_API_KEY) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const response = await axios.get(
          `https://api.polygon.io/benzinga/v1/earnings?date.gte=${today}&importance.gte=4&limit=5&apiKey=${POLYGON_API_KEY}`
        );
        
        if (response.data.results && response.data.results.length > 0) {
          console.log(`✅ Polygon API working - found ${response.data.results.length} earnings with importance 4+`);
          console.log('\nSample earnings:');
          response.data.results.slice(0, 3).forEach(e => {
            console.log(`  ${e.ticker} - ${e.company_name} (importance: ${e.importance})`);
          });
        } else {
          console.log('⚠️  No earnings found with importance 4+ for today');
        }
      } catch (apiError) {
        console.log('❌ Error testing Polygon API:', apiError.message);
      }
    } else {
      console.log('⚠️  POLYGON_API_KEY not set');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDBStatus();
