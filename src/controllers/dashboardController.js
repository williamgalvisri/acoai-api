const Contact = require('../models/Contact');
const Appointment = require('../models/Appointment');
const { NotFoundError } = require('../utils/ApiResponse');

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
        const appointments = await Appointment.find()
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
