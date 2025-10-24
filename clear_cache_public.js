const { createClient } = require('redis');
require('dotenv').config();

async function clearCache() {
  // Use the public Redis URL
  const publicRedisUrl = 'redis://default:QlilHBgsouxNhLMXIxFMTiUNVswGEqZF@shinkansen.proxy.rlwy.net:16259';
  
  const client = createClient({
    url: publicRedisUrl
  });
  
  try {
    await client.connect();
    console.log('Connected to Redis via public network');
    
    // Delete the fundamentals cache for TMUS
    const deleted = await client.del('fundamentals:TMUS');
    console.log(`Deleted ${deleted} key(s) for fundamentals:TMUS`);
    
    // Also clear NVDA and AAPL to test with fresh data
    const deletedNVDA = await client.del('fundamentals:NVDA');
    console.log(`Deleted ${deletedNVDA} key(s) for fundamentals:NVDA`);
    
    const deletedAAPL = await client.del('fundamentals:AAPL');
    console.log(`Deleted ${deletedAAPL} key(s) for fundamentals:AAPL`);
    
    await client.disconnect();
    console.log('Disconnected from Redis');
  } catch (error) {
    console.error('Error:', error);
  }
}

clearCache().catch(console.error).finally(() => process.exit(0));
