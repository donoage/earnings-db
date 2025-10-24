const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const ticker = 'TMUS';

async function testTickerInfo() {
  try {
    const response = await axios.get(
      `https://api.polygon.io/v3/reference/tickers/${ticker}`,
      { params: { apiKey: POLYGON_API_KEY }, timeout: 10000 }
    );
    
    console.log('Full response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testTickerInfo().finally(() => process.exit(0));
