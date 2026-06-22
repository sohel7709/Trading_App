const { model } = require('mongoose');
const { WalletSchema } = require('../schema/WalletSchema');

const WalletModel = new model('Wallet', WalletSchema);

module.exports = { WalletModel };