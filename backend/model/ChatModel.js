const { model } = require('mongoose');
const { ChatSchema } = require('../schema/ChatSchema');

const ChatModel = new model('Chat', ChatSchema);

module.exports = { ChatModel };