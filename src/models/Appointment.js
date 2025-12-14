const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
    customerName: {
        type: String
    },
    customerPhone: {
        type: String,
        required: true,
    },
    dateTime: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'confirmed', // Assuming auto-confirmation for MVP or based on flow
    },
    notes: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Appointment', AppointmentSchema);
