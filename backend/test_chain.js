const axios = require('axios');
(async () => {
  try {
    const login = await axios.post('http://localhost:8080/auth/login', { userId: 'SOHEL', password: 'password123' });
    const token = login.data.accessToken;
    console.log("Logged in. Token:", token.slice(0,10) + "...");
    
    const chain = await axios.get('http://localhost:8080/market/optionchain/NIFTY%2050', { headers: { Authorization: `Bearer ${token}` }});
    console.log("Chain fetched! Rows:", chain.data.rows?.length);
  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err.message);
  }
})();
