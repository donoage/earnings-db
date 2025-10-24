const { createClient } = require('redis');

async function clearAllIncompleteCache() {
  const publicRedisUrl = 'redis://default:QlilHBgsouxNhLMXIxFMTiUNVswGEqZF@shinkansen.proxy.rlwy.net:16259';
  
  const client = createClient({
    url: publicRedisUrl
  });
  
  try {
    await client.connect();
    console.log('Connected to Redis\n');
    
    // Get all fundamentals keys
    const keys = await client.keys('fundamentals:*');
    console.log(`Found ${keys.length} fundamentals cache entries\n`);
    
    let clearedCount = 0;
    
    for (const key of keys) {
      const data = await client.get(key);
      if (data) {
        const fundamentals = JSON.parse(data);
        
        // Check if data is incomplete (missing exchange, sector, or industry)
        if (!fundamentals.exchange || !fundamentals.sector || !fundamentals.industry) {
          const ticker = key.replace('fundamentals:', '');
          console.log(`Clearing incomplete data for ${ticker}:`, {
            exchange: fundamentals.exchange || 'MISSING',
            sector: fundamentals.sector || 'MISSING',
            industry: fundamentals.industry || 'MISSING'
          });
          await client.del(key);
          clearedCount++;
        }
      }
    }
    
    console.log(`\nCleared ${clearedCount} incomplete cache entries`);
    await client.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

clearAllIncompleteCache().catch(console.error).finally(() => process.exit(0));
