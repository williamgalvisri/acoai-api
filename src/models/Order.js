const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientPersona',
        required: true
    },
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        required: true
    },
    items: [{
        productId: { type: String, required: true }, // Can be Meta ID or Local ID
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        currency: { type: String, default: 'COP' }
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'COP'
    },
    paymentMethod: {
        type: String,
        enum: ['transfer', 'cash', 'not_specified'],
        default: 'not_specified'
    },
    paymentProofUrl: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'pending_verification', 'confirmed', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema);
