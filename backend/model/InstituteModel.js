const { model } = require('mongoose');
const { InstituteSchema } = require('../schema/InstituteSchema');

const InstituteModel = new model('Institute', InstituteSchema);

module.exports = { InstituteModel };
