const { Schema } = require('mongoose');

const ChatSchema = new Schema({
    username: { type: String, default: 'User' },
    message: { type: String, required: true },
    room: { type: String, default: 'general' },
    timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = { ChatSchema };