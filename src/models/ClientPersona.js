const mongoose = require('mongoose');

const ClientPersonaSchema = new mongoose.Schema({
    ownerId: {
        type: String,
        required: true,
    },
    botName: {
        type: String,
        default: 'Assistant',
    },
    toneDescription: {
        type: String,
        required: true,
        // e.g., 'Friendly, casual, uses emojis'
    },
    keywords: {
        type: [String],
        default: [],
    },
    fillers: {
        type: [String],
        default: [],
    },
    responseExamples: [{
        intent: String,
        userMessage: String,
        idealResponse: String,
    }],
    businessContext: {
        services: [String],
        pricing: mongoose.Schema.Types.Mixed,
        location: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('ClientPersona', ClientPersonaSchema);
