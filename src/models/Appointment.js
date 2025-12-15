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
    dateTime: { // Renaming to 'date' as per req? Req said `date` (Date). Existing is `dateTime`.
        // I'll stick to `dateTime` to match existing code unless explicitly told to rename and refactor usages.
        // Req: date (Date). Existing: dateTime (Date). I will add `date` alias or just keep `dateTime` if user permits.
        // Actually the req said: "Ensure it has: ... date (Date)".
        // I will add `date` and deprecate `dateTime` or just replace it.
        // Replacing `dateTime` with `date` might break `openaiService`.
        // I will keep `dateTime` to minimize breakage for now or map it.
        // Wait, "Ensure it has: date (Date)" implies strict naming.
        // I will use `date` and refactor usage in `openaiService`.
        type: Date,
        required: true,
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
