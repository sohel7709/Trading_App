const { model } = require('mongoose');
const { EnrollmentSchema } = require('../schema/EnrollmentSchema');

const EnrollmentModel = new model('Enrollment', EnrollmentSchema);

module.exports = { EnrollmentModel };
