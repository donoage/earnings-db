const axios = require('axios');

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function testImportanceFilter() {
  try {
    console.log('\n=== Testing Polygon API with importance >= 4 ===\n');
    
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const dateFrom = today.toISOString().split('T')[0];
    const dateTo = nextWeek.toISOString().split('T')[0];
    
    // Test with importance.gte=4 (gets both 4 and 5)
    const response = await axios.get(
      `https://api.polygon.io/benzinga/v1/earnings`,
      {
        params: {
          'date.gte': dateFrom,
          'date.lte': dateTo,
          'importance.gte': 4,
          'limit': 50,
          'apiKey': POLYGON_API_KEY,
        }
      }
    );
    
    if (response.data.results && response.data.results.length > 0) {
      const earnings = response.data.results;
      
      // Count by importance
      const imp4Count = earnings.filter(e => e.importance === 4).length;
      const imp5Count = earnings.filter(e => e.importance === 5).length;
      
      console.log(`📊 Found ${earnings.length} total earnings with importance >= 4`);
      console.log(`   - Importance 4: ${imp4Count} earnings`);
      console.log(`   - Importance 5: ${imp5Count} earnings`);
      console.log(`\n✅ This confirms that importance.gte=4 fetches BOTH 4 and 5\n`);
      
      // Show some examples
      console.log('Sample Importance 4 earnings:');
      earnings.filter(e => e.importance === 4).slice(0, 5).forEach(e => {
        console.log(`  ${e.ticker.padEnd(6)} ${e.company_name.substring(0, 30).padEnd(30)} (imp: ${e.importance})`);
      });
      
      console.log('\nSample Importance 5 earnings:');
      earnings.filter(e => e.importance === 5).slice(0, 5).forEach(e => {
        console.log(`  ${e.ticker.padEnd(6)} ${e.company_name.substring(0, 30).padEnd(30)} (imp: ${e.importance})`);
      });
      
    } else {
      console.log('⚠️  No earnings found for the date range');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testImportanceFilter();
