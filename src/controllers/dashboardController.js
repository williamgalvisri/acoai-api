const Contact = require('../models/Contact');
const Appointment = require('../models/Appointment');
const { NotFoundError } = require('../utils/ApiResponse');
const ClientPersona = require('../models/ClientPersona');
const ContactModel = require('../models/Contact');
const ChatHistory = require('../models/ChatHistory');

// GET /api/contacts
exports.getContacts = async (req, res) => {
    try {
        const contacts = await Contact.find().sort({ lastInteraction: -1 });
        return res.success(contacts);
    } catch (error) {
        return res.error(error);
    }
};

// GET /api/appointments
exports.getAppointments = async (req, res) => {
    try {
        const { start, end } = req.query;
        let query = {};

        if (start && end) {
            query.dateTime = {
                $gte: new Date(start),
                $lte: new Date(end)
            };
        }

        const appointments = await Appointment.find(query)
            .populate('contactId')
            .sort({ dateTime: 1 });
        return res.success(appointments);
    } catch (error) {
        return res.error(error);
    }
};

// PUT /api/appointments/:id
exports.updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const appointment = await Appointment.findByIdAndUpdate(id, updates, { new: true });

        if (!appointment) {
            throw new NotFoundError('Appointment not found');
        }

        return res.success(appointment);
    } catch (error) {
        return res.error(error);
    }
};

// POST /api/contacts/:id/toggle-bot
exports.toggleBot = async (req, res) => {
    try {
        const { id } = req.params;
        const { isBotActive } = req.body; // Expect boolean

        const contact = await Contact.findByIdAndUpdate(
            id,
            { isBotActive },
            { new: true }
        );

        if (!contact) {
            throw new NotFoundError('Contact not found');
        }

        return res.success(contact);
    } catch (error) {
        return res.error(error);
    }
};

// GET /api/contacts/:id/messages
exports.getMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 20, before } = req.query;

        const contact = await ContactModel.findById(id);
        if (!contact) {
            throw new NotFoundError('Contact not found');
        }

        let query = { phoneNumber: contact.phoneNumber };

        if (before) {
            query.timestamp = { $lt: before };
        }

        // Get latest messages first (descending), then reverse them
        const messages = await ChatHistory.find(query)
            .sort({ timestamp: -1 }) // Newest first to get the "last X"
            .limit(parseInt(limit));

        // Reverse to return them in chronological order (oldest first) for the chat UI
        const chronologicalMessages = messages.reverse();

        return res.success(chronologicalMessages);
    } catch (error) {
        return res.error(error);
    }
};

// GET /api/settings
exports.getSettings = async (req, res) => {
    try {
        // Single tenant assumption: Get the first persona
        const persona = await ClientPersona.findOne({});
        if (!persona) {
            return res.success({ reminderSettings: { isEnabled: true, hoursBefore: 24 } }); // Default if no persona
        }
        return res.success({ reminderSettings: persona.reminderSettings });
    } catch (error) {
        return res.error(error);
    }
};

// PUT /api/settings
exports.updateSettings = async (req, res) => {
    try {
        // req.body comes directly as { isEnabled: true, hoursBefore: 3 } from frontend
        const { isEnabled, hoursBefore } = req.body;
        const reminderSettings = { isEnabled, hoursBefore };

        // Update the first persona found
        const persona = await ClientPersona.findOneAndUpdate(
            {},
            { $set: { reminderSettings: reminderSettings } },
            { new: true, upsert: true } // Create if doesn't exist (though it should)
        );

        return res.success({ reminderSettings: persona.reminderSettings });
    } catch (error) {
        return res.error(error);
    }
};
