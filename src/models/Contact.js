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
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientPersona',
        required: true
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
    currentAppointment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Contact', ContactSchema);
