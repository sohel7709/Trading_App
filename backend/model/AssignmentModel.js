const { model } = require('mongoose');
const { AssignmentSchema } = require('../schema/AssignmentSchema');

const AssignmentModel = new model('Assignment', AssignmentSchema);

module.exports = { AssignmentModel };
