const mongoose = require('mongoose');
const BrokerCredentialSchema = require('../schema/BrokerCredentialSchema');

const BrokerCredentialModel = mongoose.model('BrokerCredential', BrokerCredentialSchema);

module.exports = BrokerCredentialModel;
