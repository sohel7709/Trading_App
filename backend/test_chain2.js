const axios = require('axios');
const jwt = require('jsonwebtoken');

(async () => {
  try {
    const token = jwt.sign({ sub: 'test_user', role: 'ADMIN' }, process.env.JWT_ACCESS_SECRET || 'zerodha_access_secret_change_in_prod');
    const chain = await axios.get('http://localhost:8080/market/optionchain/NIFTY%2050', { headers: { Authorization: `Bearer ${token}` }});
    console.log("Chain fetched! Rows:", chain.data.rows?.length);
  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err.message);
  }
})();
