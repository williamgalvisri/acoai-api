const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        required: true,
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientPersona',
        // required: true,
    },
    reminderSent: {
        type: Boolean,
        default: false,
    },
    // We keep customerPhone for redundancy/easy access if needed, or we could remove it.
    // Spec says ensure it has contactId, but not explicitly to remove phoneNumber.
    // I made customerPhone NOT required if we rely on contactId, assuming it's populating.
    // Actually, existing code relies on customerPhone. Let's keep it but ideally we rely on Contact.
    customerPhone: {
        type: String,
        required: true,
    },
    dateTime: {
        type: Date,
        required: true,
    },
    endTime: {
        type: Date,
        // required: true, // Optional for now to avoid breaking existing docs, or make it required if we migrate.
    },
    service: {
        type: String,
        default: 'General',
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending',
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
