const { model } = require('mongoose');
const { RiskRuleSchema } = require('../schema/RiskRuleSchema');

const RiskRuleModel = new model('RiskRule', RiskRuleSchema);

module.exports = { RiskRuleModel };
