const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    name: {
        type: String,
        default: 'Cliente',
    },
    notes: {
        type: String,
        default: '',
    },
    lastInteraction: {
        type: Date,
        default: Date.now,
    },
    isBotActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Contact', ContactSchema);
