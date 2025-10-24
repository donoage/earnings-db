const { createClient } = require('redis');

async function verifyCacheClear() {
  const publicRedisUrl = 'redis://default:QlilHBgsouxNhLMXIxFMTiUNVswGEqZF@shinkansen.proxy.rlwy.net:16259';
  
  const client = createClient({
    url: publicRedisUrl
  });
  
  try {
    await client.connect();
    console.log('Connected to Redis');
    
    // Check if TMUS key exists
    const exists = await client.exists('fundamentals:TMUS');
    console.log('fundamentals:TMUS exists:', exists === 1);
    
    if (exists) {
      const data = await client.get('fundamentals:TMUS');
      console.log('Cached data:', JSON.parse(data));
      
      // Delete it
      await client.del('fundamentals:TMUS');
      console.log('Deleted fundamentals:TMUS');
    }
    
    await client.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

verifyCacheClear().catch(console.error).finally(() => process.exit(0));
