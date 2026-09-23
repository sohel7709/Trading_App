const express = require('express');
const router = express.Router();
const { authenticate: auth } = require('../middleware/authenticate');
const BrokerCredentialModel = require('../model/BrokerCredentialModel');
const InstituteModel = require('../model/InstituteModel');
const kotakNeoService = require('../kotakNeoService');
const dhanDataService = require('../dhanDataService');

const dhanAuthService = require('../services/dhanAuthService');

// Require INSTRUCTOR, ADMIN, or SUPER_ADMIN role
router.use(auth);
router.use((req, res, next) => {
  const allowed = ['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN', 'INSTITUTE_ADMIN'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: Requires INSTRUCTOR, ADMIN, SUPER_ADMIN, or INSTITUTE_ADMIN role' });
  }
  next();
});

const getTenantId = (req) => req.user.instituteCode || String(req.user._id || 'ADMIN');

// GET all broker credentials for tenant
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const creds = await BrokerCredentialModel.find({ tenantId });
    const safeCreds = creds.map(doc => {
      const obj = doc.toObject();
      const hasPin = Boolean(obj.pin);
      const hasTotpSecret = Boolean(obj.totpSecret);
      const hasAccessToken = Boolean(obj.accessToken);
      delete obj.password;
      delete obj.mpin;
      delete obj.consumerSecret;
      delete obj.accessToken;
      delete obj.pin;
      delete obj.totpSecret;
      return {
        ...obj,
        hasPin,
        hasTotpSecret,
        hasAccessToken,
      };
    });
    res.json(safeCreds);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching broker credentials', error: error.message });
  }
});

// GET live feed status for tenant
router.get('/feed-status', (req, res) => {
  const tenantId = getTenantId(req);
  const manager = req.app.get('instituteDataManager');
  if (!manager) {
    return res.json({ status: 'NOT_INITIALIZED', message: 'Market data manager not initialized' });
  }
  const status = manager.getStatus(tenantId);
  res.json(status);
});

// POST restart market data feed for tenant
router.post('/restart-feed', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const manager = req.app.get('instituteDataManager');
    if (!manager) {
      return res.status(503).json({ message: 'Market data manager not ready' });
    }
    const success = await manager.restart(tenantId);
    res.json({
      message: success ? `Market data feed restarted for ${tenantId}` : `Feed restart attempted for ${tenantId}`,
      status: manager.getStatus(tenantId),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error restarting market data feed', error: error.message });
  }
});

// POST on-demand token generation using stored or passed TOTP credentials
router.post('/generate-token', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { pin, totpSecret, clientId } = req.body || {};

    let result;
    if (clientId && pin && totpSecret) {
      result = await dhanAuthService.generateTokenFromCredentials({
        clientId: String(clientId).trim(),
        pin: String(pin).trim(),
        totpSecret: String(totpSecret).trim(),
      });

      // Update credentials in DB
      await BrokerCredentialModel.findOneAndUpdate(
        { tenantId, provider: 'DHAN' },
        {
          $set: {
            apiKey: String(clientId).trim(),
            pin: String(pin).trim(),
            totpSecret: String(totpSecret).trim(),
            accessToken: result.accessToken,
            expiresAt: result.expiresAt,
            status: 'ACTIVE',
            lastAutoRenewAt: new Date(),
            lastAutoRenewStatus: 'SUCCESS',
            lastAutoRenewError: '',
          },
        },
        { upsert: true, new: true }
      );
      await dhanAuthService.cacheToken(tenantId, result.accessToken, result.expiresAt);
    } else {
      // Use renewInstituteToken with saved DB credentials
      result = await dhanAuthService.renewInstituteToken(tenantId);
    }

    // Keep global fallback config updated if ADMIN
    if (tenantId === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
      dhanDataService.setCachedConfig({ clientId: clientId || result.clientId, accessToken: result.accessToken });
    }

    // Automatically trigger InstituteDataManager to restart feed with the fresh token
    const manager = req.app.get('instituteDataManager');
    if (manager && tenantId) {
      manager.restart(tenantId).catch(err => console.warn('[BrokerRoutes] Restart feed warning:', err.message));
    }

    res.json({
      success: true,
      message: 'Dhan 24-hour access token successfully generated and cached!',
      expiresAt: result.expiresAt,
      lastGeneratedAt: new Date(),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: `Failed to generate Dhan token: ${error.message}`,
      error: error.message,
    });
  }
});

// POST save or update broker credential and optionally mark active
router.post('/', async (req, res) => {
  try {
    const { 
      provider, 
      apiKey, 
      accessToken, 
      consumerSecret, 
      mobileNo, 
      password, 
      mpin, 
      pin, 
      totpSecret, 
      autoRenew, 
      expiresAt, 
      setAsActive 
    } = req.body;
    const tenantId = getTenantId(req);

    if (!provider || !['DHAN', 'KOTAK', 'ZERODHA'].includes(provider)) {
      return res.status(400).json({ message: 'Valid provider (DHAN, KOTAK, ZERODHA) is required' });
    }

    let effectiveApiKey = apiKey ? String(apiKey).trim() : '';
    let effectiveAccessToken = accessToken ? String(accessToken).trim() : '';
    let calculatedExpiry = expiresAt ? new Date(expiresAt) : undefined;

    if (provider === 'DHAN' && effectiveAccessToken) {
      try {
        const parts = effectiveAccessToken.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload.dhanClientId) {
            effectiveApiKey = String(payload.dhanClientId).trim();
          }
        }
      } catch (err) {}
    }

    if (!effectiveApiKey) {
      return res.status(400).json({ message: 'API Key / Client ID is required' });
    }

    // If provider is DHAN and no accessToken was given, but PIN and TOTP secret were provided, auto-generate token immediately!
    if (provider === 'DHAN') {
      if (!effectiveAccessToken && pin && totpSecret) {
        try {
          const generated = await dhanAuthService.generateTokenFromCredentials({
            clientId: effectiveApiKey,
            pin: String(pin).trim(),
            totpSecret: String(totpSecret).trim(),
          });
          effectiveAccessToken = generated.accessToken;
          calculatedExpiry = generated.expiresAt;
        } catch (err) {
          return res.status(400).json({
            message: `Automatic Dhan token generation failed: ${err.message}. Please check Client ID, PIN, and TOTP Secret.`,
            error: err.message,
          });
        }
      } else if (!effectiveAccessToken) {
        // Check if existing record has saved pin & totpSecret
        const existing = await BrokerCredentialModel.findOne({ tenantId, provider: 'DHAN' });
        if (existing && existing.pin && existing.totpSecret) {
          try {
            const dec = existing.getDecrypted();
            const generated = await dhanAuthService.generateTokenFromCredentials({
              clientId: effectiveApiKey,
              pin: pin ? String(pin).trim() : dec.pin,
              totpSecret: totpSecret ? String(totpSecret).trim() : dec.totpSecret,
            });
            effectiveAccessToken = generated.accessToken;
            calculatedExpiry = generated.expiresAt;
          } catch (err) {
            return res.status(400).json({
              message: `Automatic Dhan token generation failed: ${err.message}`,
              error: err.message,
            });
          }
        } else {
          return res.status(400).json({ message: 'Access Token or (PIN + TOTP Secret) is required for Dhan' });
        }
      }

      if (!calculatedExpiry) {
        calculatedExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
    }

    if (provider === 'KOTAK' && (!consumerSecret || !mobileNo || !password)) {
      return res.status(400).json({ message: 'Consumer Secret, Mobile No, and Password are required for Kotak Neo' });
    }

    if (setAsActive !== false) {
      // Clear active flag on other providers for this tenant
      await BrokerCredentialModel.updateMany({ tenantId }, { $set: { isActiveProvider: false } });
    }

    const payload = {
      tenantId,
      provider,
      apiKey: effectiveApiKey,
      ...(effectiveAccessToken ? { accessToken: effectiveAccessToken } : {}),
      ...(consumerSecret ? { consumerSecret } : {}),
      ...(mobileNo ? { mobileNo } : {}),
      ...(password ? { password } : {}),
      ...(mpin ? { mpin } : {}),
      ...(pin ? { pin: String(pin).trim() } : {}),
      ...(totpSecret ? { totpSecret: String(totpSecret).trim() } : {}),
      ...(typeof autoRenew === 'boolean' ? { autoRenew } : {}),
      ...(calculatedExpiry ? { expiresAt: calculatedExpiry } : {}),
      isActiveProvider: setAsActive !== false,
      status: 'CONFIGURED',
      lastError: '',
    };

    const cred = await BrokerCredentialModel.findOneAndUpdate(
      { tenantId, provider },
      { $set: payload },
      { new: true, upsert: true }
    );

    if (provider === 'DHAN' && effectiveApiKey && effectiveAccessToken) {
      dhanDataService.setCachedConfig({ clientId: effectiveApiKey, accessToken: effectiveAccessToken });
      // Cache in Redis
      await dhanAuthService.cacheToken(tenantId, effectiveAccessToken, calculatedExpiry || new Date(Date.now() + 24 * 3600 * 1000));
      // Keep ADMIN global fallback in sync
      BrokerCredentialModel.findOneAndUpdate(
        { tenantId: 'ADMIN', provider: 'DHAN' },
        { $set: { apiKey: effectiveApiKey, accessToken: effectiveAccessToken, isActiveProvider: true, status: 'ACTIVE', lastError: '' } },
        { upsert: true }
      ).catch(() => {});
    }

    // Automatically trigger InstituteDataManager to load and start feed with new credentials
    const manager = req.app.get('instituteDataManager');
    if (manager && tenantId) {
      manager.restart(tenantId).catch(err => console.warn('[BrokerRoutes] Restart feed warning:', err.message));
    }

    res.json({
      message: `${provider} credentials saved successfully`,
      provider: cred.provider,
      isActiveProvider: cred.isActiveProvider,
      expiresAt: cred.expiresAt,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error saving broker credential', error: error.message });
  }
});

// POST select active provider
router.post('/select-provider', async (req, res) => {
  try {
    const { provider } = req.body;
    const tenantId = getTenantId(req);

    if (!provider || !['DHAN', 'KOTAK', 'ZERODHA'].includes(provider)) {
      return res.status(400).json({ message: 'Valid provider is required' });
    }

    await BrokerCredentialModel.updateMany({ tenantId }, { $set: { isActiveProvider: false } });
    const cred = await BrokerCredentialModel.findOneAndUpdate(
      { tenantId, provider },
      { $set: { isActiveProvider: true } },
      { new: true }
    );

    if (!cred) {
      return res.status(404).json({ message: `No saved credentials found for ${provider}. Please configure credentials first.` });
    }

    const manager = req.app.get('instituteDataManager');
    if (manager && tenantId) {
      manager.restart(tenantId).catch(err => console.warn('[BrokerRoutes] Restart feed warning:', err.message));
    }

    res.json({ message: `${provider} set as active market data provider`, provider: cred.provider });
  } catch (error) {
    res.status(500).json({ message: 'Error selecting active provider', error: error.message });
  }
});

// POST test connection for provider
router.post('/:provider/test', async (req, res) => {
  try {
    const { provider } = req.params;
    const tenantId = getTenantId(req);

    const cred = await BrokerCredentialModel.findOne({ tenantId, provider });
    if (!cred) {
      return res.status(404).json({ message: `No credentials saved for ${provider}` });
    }

    if (provider === 'KOTAK') {
      const ok = await kotakNeoService.testCredentials({
        apiKey: cred.apiKey,
        consumerSecret: cred.consumerSecret,
        mobileNo: cred.mobileNo,
        password: cred.password,
        mpin: cred.mpin,
      });
      if (!ok) return res.status(400).json({ message: 'Kotak Neo connection test failed. Check credentials.' });
      return res.json({ message: 'Kotak Neo connection successful!', provider });
    }

    if (provider === 'DHAN') {
      const ok = await dhanDataService.testCredentials({
        clientId: cred.apiKey,
        accessToken: cred.accessToken,
      });
      if (!ok) return res.status(400).json({ message: 'Dhan connection test failed. Check API key & access token.' });
      return res.json({ message: 'Dhan connection successful!', provider });
    }

    res.json({ message: `${provider} connection test passed`, provider });
  } catch (error) {
    res.status(500).json({ message: 'Error testing connection', error: error.message });
  }
});

// Set Market Data Mode (REPLAY vs LIVE_BROKER)
router.post('/mode', async (req, res) => {
  try {
    const { marketDataMode } = req.body;
    const tenantId = getTenantId(req);

    if (!['REPLAY', 'LIVE_BROKER'].includes(marketDataMode)) {
      return res.status(400).json({ message: 'Invalid marketDataMode' });
    }

    await InstituteModel.findOneAndUpdate(
      { $or: [{ code: tenantId }, { _id: tenantId }] },
      { $set: { 'settings.marketDataMode': marketDataMode } }
    );

    res.json({ message: `Market data mode updated to ${marketDataMode}` });
  } catch (error) {
    res.status(500).json({ message: 'Error updating market data mode', error: error.message });
  }
});

module.exports = router;
