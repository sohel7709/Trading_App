const { model } = require('mongoose');
const { CorporateActionSchema } = require('../schema/CorporateActionSchema');
const CorporateActionModel = new model('CorporateAction', CorporateActionSchema);
module.exports = { CorporateActionModel };
