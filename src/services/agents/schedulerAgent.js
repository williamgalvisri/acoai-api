const Appointment = require('../../models/Appointment');
const Contact = require('../../models/Contact');
const Notification = require('../../models/Notification');
const sseManager = require('../../utils/sseManager');

/**
 * Scheduler Agent Strategy
 */
const schedulerAgent = {
    /**
     * Generates the system prompt for the scheduler agent.
     * @param {Object} persona - The client persona document.
     * @param {Object} contact - The current contact document.
     * @returns {String} The system prompt.
     */
    getSystemPrompt: (persona, contact) => {
        const location = persona.businessContext?.location || 'Not specified';
        const contactPhone = persona.businessContext?.contactPhone || '';
        const servicesList = persona.businessContext?.services?.map(s =>
            `- ${s.name} ($${s.price || '?'})${s.duration ? `, ${s.duration} mins` : ''}${s.description ? `: ${s.description}` : ''}`
        ).join('\n') || 'No specific services listed.';

        const hoursObj = persona.businessContext?.hours;
        let hoursStr = "Hours not specified.";
        if (hoursObj) {
            // @ts-ignore
            hoursStr = Object.entries(hoursObj).map(([day, val]) => {
                if (!val.isOpen) return `${day.charAt(0).toUpperCase() + day.slice(1)}: Closed`;
                return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${val.open} - ${val.close}`;
            }).join('\n');
        }

        return `### 1. ROLE & IDENTITY
            You are ${persona.botName}. Your tone is ${persona.toneDescription}.
            Use these keywords naturally: ${persona.keywords.join(', ')}.
            Use these fillers occasionally: ${persona.fillers.join(', ')}.

            ### 2. DYNAMIC USER CONTEXT
            The user's current name in the database is: "${contact.name}".

            ${(contact.name === 'Cliente' || contact.name === 'Unknown')
                ? `!!! HIGHEST PRIORITY ALERT !!!
            - You DO NOT know the user's name yet.
            - Your PRIMARY GOAL is to politely ask for their name to save it.
            - Make up a casual excuse (e.g., "I lost my contacts" or "I changed my phone").
            - DO NOT confirm appointments until you have the name.
            - Once obtained, execute 'updateContactName' IMMEDIATELY.`
                : `You are speaking with ${contact.name}.`}

            ### 3. BUSINESS KNOWLEDGE BASE
            Location: ${location}
            Contact: ${contactPhone}
            Operating Hours:
            ${hoursStr}

            Services & Pricing:
            ${servicesList}

            Current Date/Time: ${new Date().toLocaleString('en-US', { timeZone: persona.appointmentSettings?.timezone || 'America/Bogota' })}
            Active Appointment: ${contact.currentAppointment ? `YES: ${new Date(contact.currentAppointment.dateTime).toLocaleString()} for ${contact.currentAppointment.service}.` : "None."}

            ### 4. PLAN-AND-SOLVE PROTOCOL (MANDATORY)
            **YOU ARE BLIND TO THE CALENDAR.** You have zero knowledge of free slots until you use the tool.
            Before responding, you MUST perform this internal "Plan-and-Solve" sequence:

            **Step 1: Decompose the Request** [1]
            - Identify the user's intent (Book, Cancel, Info).
            - Identify variables provided (Date, Time, Service) vs. variables missing.

            **Step 2: Tool Execution Plan** [3]
            - IF the user mentions a time/date OR asks for availability:
            - **ACTION:** You MUST call 'checkAvailability' immediately.
            - **CONSTRAINT:** Do NOT guess. Do NOT say "it is available" before the tool returns "Available".
            - IF the user confirms a booking:
            - **ACTION:** Call 'bookAppointment'.

            **Step 3: Self-Correction & Response** [5]
            - Did I run the tool? If no, STOP and run it.
            - Read the tool output. If the tool says "Busy", you MUST refuse the slot and offer the tool's alternatives.

            ### 5. EXECUTION RULES
            1. **SILENT EXECUTION:** Do not say "Let me check" or "One second". Just run the tool and speak the result [6].
            2. **MANDATORY CLOSING:** Always end with a question to move the process forward (e.g., "Shall I book that for you?") [7].
            3. **NEGATIVE CONSTRAINTS:** 
            - NEVER assume a slot is free because it is within "Operating Hours".
            - NEVER book without confirming the Service and Price first.

            ### 6. FEW-SHOT EXAMPLES
            ${persona.responseExamples.map(ex => `User: ${ex.userMessage}\nYou: ${ex.idealResponse}`).join('\n')}`;
    },

    /**
     * Returns the tools definition for the scheduler agent.
     * @returns {Array} List of tools.
     */
    getTools: () => {
        return [
            {
                type: "function",
                function: {
                    name: "checkAvailability",
                    description: "Check availability for a specific date and time.",
                    parameters: {
                        type: "object",
                        properties: {
                            dateTime: { type: "string", description: "ISO 8601 format" }
                        },
                        required: ["dateTime"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "bookAppointment",
                    description: "Book an appointment.",
                    parameters: {
                        type: "object",
                        properties: {
                            dateTime: { type: "string" },
                            serviceName: { type: "string" },
                            notes: { type: "string" }
                        },
                        required: ["dateTime", "serviceName"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "updateContactName",
                    description: "Update the user's name.",
                    parameters: {
                        type: "object",
                        properties: { name: { type: "string" } },
                        required: ["name"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "cancelAppointment",
                    description: "Cancel the user's upcoming appointment.",
                    parameters: {
                        type: "object",
                        properties: { reason: { type: "string" } }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "rescheduleAppointment",
                    description: "Reschedule appointment.",
                    parameters: {
                        type: "object",
                        properties: { newDateTime: { type: "string" } },
                        required: ["newDateTime"]
                    }
                }
            }
        ];
    },

    /**
     * Returns the map of available functions for the scheduler agent.
     * @param {Object} context - Includes phoneNumber, persona, etc.
     * @returns {Object} Map of function names to implementations.
     */
    getAvailableFunctions: (context) => {
        const { phoneNumber, persona } = context;

        return {
            checkAvailability: async (args) => await checkAvailability(args.dateTime, persona),
            bookAppointment: async (args) => await bookAppointment(args.dateTime, args.serviceName, phoneNumber, args.notes, persona),
            updateContactName: async (args) => {
                await Contact.updateOne({ phoneNumber }, { name: args.name });
                return JSON.stringify({ success: true, message: `Updated name to ${args.name}` });
            },
            cancelAppointment: async (args) => await cancelAppointment(phoneNumber, args.reason),
            rescheduleAppointment: async (args) => await rescheduleAppointment(phoneNumber, args.newDateTime, persona)
        };
    }
};

// --- Helper Functions Implementation ---

async function checkAvailability(dateTime, persona) {
    try {
        console.log('checking availability for:', dateTime);
        const timezone = persona?.appointmentSettings?.timezone || 'America/Bogota';

        const toShiftedDate = (date) => {
            const fmt = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric',
                hour12: false
            });
            const parts = fmt.formatToParts(date);
            const part = (type) => parseInt(parts.find(p => p.type === type).value, 10);

            return new Date(Date.UTC(
                part('year'),
                part('month') - 1, 
                part('day'),
                part('hour'),
                part('minute'),
                part('second')
            ));
        };

        const nowShifted = toShiftedDate(new Date());
        const requestedDateShifted = toShiftedDate(new Date(dateTime));
        const dayName = requestedDateShifted.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();

        const schedule = persona?.businessContext?.hours?.[dayName];
        if (!schedule || !schedule.isOpen) {
            return JSON.stringify({ available: false, message: `We are closed on ${dayName}s.` });
        }

        const { open, close } = schedule;
        const [openHour, openMin] = open.split(':').map(Number);
        const [closeHour, closeMin] = close.split(':').map(Number);

        const openTime = new Date(requestedDateShifted);
        openTime.setUTCHours(openHour, openMin, 0, 0);

        const closeTime = new Date(requestedDateShifted);
        closeTime.setUTCHours(closeHour, closeMin, 0, 0);

        if (requestedDateShifted < openTime || requestedDateShifted >= closeTime) {
            return JSON.stringify({ available: false, message: `That time is outside our business hours (${open} - ${close}).` });
        }

        const defaultDuration = persona?.appointmentSettings?.defaultDuration || 30;
        const bufferTime = persona?.appointmentSettings?.bufferTime || 5;

        const queryStart = new Date(dateTime);
        queryStart.setHours(0, 0, 0, 0);
        queryStart.setDate(queryStart.getDate() - 1);
        const queryEnd = new Date(dateTime);
        queryEnd.setHours(23, 59, 59, 999);
        queryEnd.setDate(queryEnd.getDate() + 1);

        const rawAppointments = await Appointment.find({
            dateTime: { $gte: queryStart, $lte: queryEnd }
        });

        const getConflictEnd = (slotStartShifted) => {
            const myDurationPlusBuffer = defaultDuration + bufferTime;
            const slotEndShifted = new Date(slotStartShifted.getTime() + myDurationPlusBuffer * 60000);

            const appointmentsShifted = rawAppointments.map(appt => {
                const start = toShiftedDate(appt.dateTime);
                let apptEndShifted;
                if (appt.endTime) {
                    apptEndShifted = toShiftedDate(appt.endTime);
                } else {
                    apptEndShifted = new Date(start.getTime() + defaultDuration * 60000);
                }
                const busyBlockEnd = new Date(apptEndShifted.getTime() + bufferTime * 60000);
                return { startDate: start, busyBlockEnd: busyBlockEnd };
            }).sort((a, b) => a.startDate - b.startDate);

            for (const appt of appointmentsShifted) {
                if (slotStartShifted < appt.busyBlockEnd && slotEndShifted > appt.startDate) {
                    return appt.busyBlockEnd;
                }
            }
            return null;
        }

        const conflictEnd = getConflictEnd(requestedDateShifted);
        const freeSlots = [];
        let scanTime = new Date(openTime);

        while (scanTime < closeTime) {
            const slotEnd = new Date(scanTime.getTime() + defaultDuration * 60000);
            const isFuture = scanTime > nowShifted;
            const busyUntil = getConflictEnd(scanTime);

            if (busyUntil) {
                scanTime = new Date(busyUntil);
                continue;
            }

            if (isFuture && slotEnd <= closeTime) {
                const timeStr = scanTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
                freeSlots.push(timeStr);
                scanTime.setUTCMinutes(scanTime.getUTCMinutes() + 30);
            } else {
                scanTime.setUTCMinutes(scanTime.getUTCMinutes() + 30);
            }
        }

        const uniqueSlots = [...new Set(freeSlots)];
        const maxSlotsToShow = 8;
        const futureSlotsStr = uniqueSlots.slice(0, maxSlotsToShow).join(', ');

        if (conflictEnd) {
            return JSON.stringify({
                available: false,
                message: "Slot is busy.",
                alternativeSlots: futureSlotsStr ? `Try these times: ${futureSlotsStr}...` : "No other slots available today."
            });
        }

        return JSON.stringify({
            available: true,
            message: "Slot available",
            futureSlots: futureSlotsStr ? `Other available times today: ${futureSlotsStr}...` : "This is the last slot."
        });
    } catch (err) {
        console.error("Availability check error:", err);
        return JSON.stringify({ available: false, message: "Failed to check availability" });
    }
}

async function bookAppointment(dateTime, serviceName, customerPhone, notes, persona) {
    try {
        const contact = await Contact.findOne({ phoneNumber: customerPhone });
        if (!contact) {
            throw new Error("Contact not found for booking");
        }

        let duration = persona?.appointmentSettings?.defaultDuration || 30;

        if (serviceName && persona?.businessContext?.services) {
            const service = persona.businessContext.services.find(s =>
                s.name.toLowerCase() === serviceName.toLowerCase()
            );
            if (service && service.duration) {
                duration = service.duration;
            }
        }

        const startDate = new Date(dateTime);
        const endTime = new Date(startDate.getTime() + duration * 60000);

        const newAppointment = new Appointment({
            contactId: contact._id,
            ownerId: persona._id,
            customerPhone,
            dateTime: startDate,
            endTime: endTime,
            service: serviceName || 'General',
            notes,
            status: 'confirmed',
        });

        const savedAppointment = await newAppointment.save();

        contact.currentAppointment = savedAppointment._id;
        await contact.save();

        const notification = await Notification.create({
            ownerId: persona._id,
            type: 'appointment_booked',
            title: 'Nueva Cita Agendada',
            message: `El cliente ${contact.name || customerPhone} ha agendado para el ${startDate.toLocaleString()}.`,
            relatedResourceId: savedAppointment._id
        });

        sseManager.sendEvent(persona._id.toString(), 'NEW_NOTIFICATION', notification);

        return `Appointment confirmed for ${dateTime} (${duration} mins).`;
    } catch (err) {
        console.error("Booking error:", err);
        return "Failed to book appointment. Please try again.";
    }
}

async function cancelAppointment(phoneNumber, reason) {
    try {
        const contact = await Contact.findOne({ phoneNumber }).populate('currentAppointment');
        if (!contact || !contact.currentAppointment) {
            return "No active appointment found to cancel.";
        }

        const appointment = await Appointment.findById(contact.currentAppointment._id);
        if (!appointment) return "Appointment not found.";

        appointment.status = 'cancelled';
        appointment.notes = appointment.notes ? `${appointment.notes} | Cancelled: ${reason || 'User request'}` : `Cancelled: ${reason || 'User request'}`;
        await appointment.save();

        contact.currentAppointment = null;
        await contact.save();

        return "Appointment has been successfully cancelled.";
    } catch (error) {
        console.error("Cancel Error:", error);
        return "Failed to cancel appointment.";
    }
}

async function rescheduleAppointment(phoneNumber, newDateTime, persona) {
    try {
        const contact = await Contact.findOne({ phoneNumber }).populate('currentAppointment');
        if (!contact || !contact.currentAppointment) {
            return "No active appointment found to reschedule. Please book a new one.";
        }

        const appointment = await Appointment.findById(contact.currentAppointment._id);
        if (!appointment) return "Appointment not found.";

        let duration = 30;
        if (appointment.endTime && appointment.dateTime) {
            duration = (appointment.endTime - appointment.dateTime) / 60000;
        }

        const newStart = new Date(newDateTime);
        const newEnd = new Date(newStart.getTime() + duration * 60000);

        appointment.dateTime = newStart;
        appointment.endTime = newEnd;
        appointment.status = 'confirmed';
        await appointment.save();

        return `Appointment rescheduled to ${newDateTime}.`;
    } catch (error) {
        console.error("Reschedule Error:", error);
        return "Failed to reschedule appointment.";
    }
}

module.exports = schedulerAgent;
