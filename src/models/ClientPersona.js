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
        pricing: Object,
        location: String,
        hours: String,
    },
    reminderSettings: {
        isEnabled: { type: Boolean, default: true },
        hoursBefore: { type: Number, default: 24 }
    },
    usage: {
        promptTokens: { type: Number, default: 0 },      // Monthly Input Sum
        completionTokens: { type: Number, default: 0 },  // Monthly Output Sum
        totalTokens: { type: Number, default: 0 },       // Monthly Total Sum
        lastResetDate: { type: Date, default: Date.now } // To track billing cycle
    },
    subscription: {
        plan: { type: String, enum: ['basic', 'pro'], default: 'basic' },
        tokenLimit: { type: Number, default: 100000 },   // Monthly limit
        isActive: { type: Boolean, default: true }
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('ClientPersona', ClientPersonaSchema);
