'use strict';

const mongoose = require('mongoose');
const ReplaySessionSchema = require('../schema/ReplaySessionSchema');

const ReplaySessionModel = mongoose.model('ReplaySession', ReplaySessionSchema);

module.exports = ReplaySessionModel;
