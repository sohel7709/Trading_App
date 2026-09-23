'use strict';

const kotakNeoService = require('./kotakNeoService');
const marketDataService = require('./marketDataService');

console.log('=== Kotak Neo Service Integration Test ===');
console.log('Is Kotak Neo Configured?:', kotakNeoService.isConfigured());

(async () => {
  if (kotakNeoService.isConfigured()) {
    console.log('Attempting Kotak Neo Session init...');
    const sessionOk = await kotakNeoService.ensureSession();
    console.log('Session result:', sessionOk);
  } else {
    console.log('Kotak Neo credentials not present in process.env — fallback chain active.');
  }

  console.log('Testing Option Expiries for NIFTY 50...');
  const expiries = await marketDataService.getOptionExpiries('NIFTY 50');
  console.log('Expiries result:', expiries);

  console.log('Testing Option Chain for NIFTY 50...');
  const chain = await marketDataService.getOptionChain('NIFTY 50', expiries[0]);
  console.log('Chain Source:', chain?.source);
  console.log('ATM Strike:', chain?.atmStrike);
  console.log('Rows Count:', chain?.rows?.length);

  console.log('=== Test Complete ===');
})();
