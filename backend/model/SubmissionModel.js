const { model } = require('mongoose');
const { SubmissionSchema } = require('../schema/SubmissionSchema');

const SubmissionModel = new model('Submission', SubmissionSchema);

module.exports = { SubmissionModel };
