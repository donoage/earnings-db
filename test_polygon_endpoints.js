const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const ticker = 'TMUS';

async function testAllEndpoints() {
  console.log('Testing all Polygon endpoints for TMUS...\n');
  
  // 1. Ticker Info - v3/reference/tickers/{ticker}
  console.log('1. Testing v3/reference/tickers endpoint:');
  try {
    const response = await axios.get(
      `https://api.polygon.io/v3/reference/tickers/${ticker}`,
      { params: { apiKey: POLYGON_API_KEY } }
    );
    console.log('✓ Status:', response.data.status);
    console.log('✓ Has results:', !!response.data.results);
    if (response.data.results) {
      console.log('  - name:', response.data.results.name);
      console.log('  - primary_exchange:', response.data.results.primary_exchange);
      console.log('  - sic_description:', response.data.results.sic_description);
      console.log('  - market_cap:', response.data.results.market_cap);
    }
  } catch (error) {
    console.log('✗ Error:', error.response?.data || error.message);
  }
  
  console.log('\n2. Testing vX/reference/financials (ratios):');
  try {
    const response = await axios.get(
      'https://api.polygon.io/vX/reference/financials',
      {
        params: {
          ticker,
          timeframe: 'ttm',
          limit: 1,
          apiKey: POLYGON_API_KEY
        }
      }
    );
    console.log('✓ Status:', response.data.status);
    console.log('✓ Results count:', response.data.results?.length || 0);
    if (response.data.results?.[0]) {
      console.log('  - Has financials:', !!response.data.results[0].financials);
    }
  } catch (error) {
    console.log('✗ Error:', error.response?.data || error.message);
  }
  
  console.log('\n3. Testing stocks/financials/v1/ratios:');
  try {
    const response = await axios.get(
      'https://api.polygon.io/stocks/financials/v1/ratios',
      {
        params: {
          ticker,
          limit: 1,
          apiKey: POLYGON_API_KEY
        }
      }
    );
    console.log('✓ Status:', response.data.status);
    console.log('✓ Results count:', response.data.results?.length || 0);
  } catch (error) {
    console.log('✗ Error:', error.response?.data || error.message);
  }
  
  console.log('\n4. Testing stocks/financials/v1/income-statements:');
  try {
    const response = await axios.get(
      'https://api.polygon.io/stocks/financials/v1/income-statements',
      {
        params: {
          tickers: ticker,
          timeframe: 'trailing_twelve_months',
          limit: 1,
          apiKey: POLYGON_API_KEY
        }
      }
    );
    console.log('✓ Status:', response.data.status);
    console.log('✓ Results count:', response.data.results?.length || 0);
  } catch (error) {
    console.log('✗ Error:', error.response?.data || error.message);
  }
}

testAllEndpoints().catch(console.error).finally(() => process.exit(0));
