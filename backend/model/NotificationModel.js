const mongoose = require('mongoose');
const { NotificationSchema } = require('../schema/NotificationSchema');

const NotificationModel = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

module.exports = { NotificationModel };
