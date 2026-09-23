const marketDataService = require('./marketDataService');
(async () => {
  try {
    const chain = await marketDataService.getOptionChain('NIFTY 50', null);
    console.log("Chain length:", chain.rows?.length);
  } catch (err) {
    console.error("Error:", err.message);
  }
})();
