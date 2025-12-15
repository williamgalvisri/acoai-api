const OpenAI = require('openai');
const ClientPersona = require('../models/ClientPersona');
const ChatHistory = require('../models/ChatHistory');
const Appointment = require('../models/Appointment');
const Contact = require('../models/Contact');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generates a response from OpenAI based on the user's message, history, and the client's persona.
 * @param {string} phoneNumber - The user's phone number.
 * @param {string} messageText - The message from the user.
 * @param {string} ownerId - The ID of the business owner to fetch the persona.
 * @returns {Promise<{text: string, usage: object}>} - The AI's response and token usage.
 */
async function generateResponse(phoneNumber, messageText, ownerId) {
    try {
        // 1. Identify/Create Contact
        let contact = await Contact.findOne({ phoneNumber });
        if (!contact) {
            contact = await Contact.create({ phoneNumber });
        }

        // 2. Fetch Client Persona
        // Assuming ownerId is passed or determined upstream
        const persona = await ClientPersona.findOne({ ownerId });

        if (!persona) {
            console.warn(`Persona not found for ownerId: ${ownerId}. Using fallback.`);
        }

        // 3. Fetch Context (Optimized)
        const history = await ChatHistory.find({ phoneNumber })
            .sort({ timestamp: -1 })
            .limit(10);

        // Reverse to chronological order for the LLM
        const conversationHistory = history.reverse().map(msg => ({
            role: msg.role === 'owner' ? 'assistant' : msg.role,
            content: msg.content,
        }));

        // 4. Construct System Prompt
        let systemPrompt = "You are a helpful assistant.";
        if (persona) {
            const examples = persona.responseExamples.map(ex => `User: ${ex.userMessage}\nYou: ${ex.idealResponse}`).join('\n');

            // Format Services
            const servicesList = persona.businessContext?.services?.map(s =>
                `- ${s.name} ($${s.price || '?'})${s.duration ? `, ${s.duration} mins` : ''}${s.description ? `: ${s.description}` : ''}`
            ).join('\n') || 'No specific services listed.';

            // Format Hours
            const hoursObj = persona.businessContext?.hours;
            let hoursStr = "Hours not specified.";
            if (hoursObj) {
                // @ts-ignore
                hoursStr = Object.entries(hoursObj).map(([day, val]) => {
                    if (!val.isOpen) return `${day.charAt(0).toUpperCase() + day.slice(1)}: Closed`;
                    return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${val.open} - ${val.close}`;
                }).join('\n');
            }

            const location = persona.businessContext?.location || 'Not specified';
            const contactPhone = persona.businessContext?.contactPhone || '';

            const defaultDuration = persona.appointmentSettings?.defaultDuration || 30;
            const bufferTime = persona.appointmentSettings?.bufferTime || 5;

            systemPrompt = `You are ${persona.botName}. 
      Your tone is ${persona.toneDescription}. 
      
      IMPORTANT: The user's current name in your database is "${contact.name}".
      ${(contact.name === 'Cliente' || contact.name === 'Unknown')
                    ? `CRITICAL INSTRUCTION: YOU DO NOT KNOW THIS USER'S NAME YET. 
             Your HIGHEST PRIORITY is to politely ask for their name so you can save it. 
             Claim you lost your contacts or changed your phone. 
             DO NOT provide full assistance until you get their name. 
             Once they give it, call the 'updateContactName' tool IMMEDIATELY.`
                    : `You are talking to ${contact.name}.`}

      Use these keywords naturally: ${persona.keywords.join(', ')}.
      Fillers to use occasionally: ${persona.fillers.join(', ')}.
      
      Business Context:
      Location: ${location}
      Contact: ${contactPhone}
      
      Services & Pricing:
      ${servicesList}
      
      Operating Hours:
      ${hoursStr}
      
      Appointment Rules:
      - Default Appointment Duration: ${defaultDuration} minutes.
      - Buffer Time required between appointments: ${bufferTime} minutes.
      - When checking availability or booking, ALWAYS consider the duration + buffer.
      
      Current Date: ${new Date().toLocaleString('en-US', { timeZone: persona.appointmentSettings?.timezone || 'America/Bogota' })}
 
      Here are examples of how you speak (Few-Shot Learning):
      ${examples}
      
      Goal: Automate appointment scheduling while mimicking the detailed persona above.
      
      CRITICAL RULES:
      1. You MUST use the 'checkAvailability' tool BEFORE confirming, promising, or booking ANY appointment time. 
      2. Do NOT trust your memory or previous messages for availability. The database is the only source of truth.
      3. If the user requests a time, check it first using 'checkAvailability'.
      4. WHEN the user confirms the date and time, EXECUTE the 'bookAppointment' tool IMMEDIATELY. This is the only way to finalize the booking.
      5. If the user tells you their name, remember it using the 'updateContactName' tool.`;
        }

        // 5. Define Tools
        const tools = [
            {
                type: "function",
                function: {
                    name: "checkAvailability",
                    description: "Check availability for a specific date and time.",
                    parameters: {
                        type: "object",
                        properties: {
                            dateTime: {
                                type: "string",
                                description: "The date and time to check (ISO 8601 format or compatible string).",
                            },
                        },
                        required: ["dateTime"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "bookAppointment",
                    description: "Book an appointment for the client at a specific date and time.",
                    parameters: {
                        type: "object",
                        properties: {
                            dateTime: {
                                type: "string",
                                description: "The date and time of the appointment (ISO 8601 format or compatible string).",
                            },
                            notes: {
                                type: "string",
                                description: "Any special requests or notes from the customer.",
                            },
                        },
                        required: ["dateTime"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "updateContactName",
                    description: "Update the user's name if they provide it during the conversation.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "The name the user provided.",
                            },
                        },
                        required: ["name"],
                    },
                },
            },
        ];

        // 5. Call OpenAI (Loop for sequential tool calls)
        let messages = [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
            { role: "user", content: messageText },
        ];

        let totalUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };

        let finalResponseText = "";
        let keepLooping = true;
        let loopCount = 0;
        const MAX_LOOPS = 5; // Safety break

        while (keepLooping && loopCount < MAX_LOOPS) {
            loopCount++;

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messages,
                tools: tools,
                tool_choice: "auto",
            });

            // Accumulate usage
            if (response.usage) {
                totalUsage.prompt_tokens += response.usage.prompt_tokens;
                totalUsage.completion_tokens += response.usage.completion_tokens;
                totalUsage.total_tokens += response.usage.total_tokens;
            }

            const responseMessage = response.choices[0].message;

            // If text content exists, update final response (it might be the final answer or a thought before a tool)
            if (responseMessage.content) {
                finalResponseText = responseMessage.content;
            }

            // Check if tool calls present
            if (responseMessage.tool_calls) {
                messages.push(responseMessage); // Add assistant's tool-call request to history

                const availableFunctions = {
                    checkAvailability: async (args) => {
                        console.log('running checkAvailability tool');
                        const availability = await checkAvailability(args.dateTime);
                        return availability;
                    },
                    bookAppointment: async (args) => {
                        console.log('running bookAppointment tool');
                        return await bookAppointment(args.dateTime, phoneNumber, args.notes);
                    },
                    updateContactName: async (args) => {
                        console.log('running updateContactName tool');
                        await Contact.updateOne({ phoneNumber }, { name: args.name });
                        return JSON.stringify({ success: true, message: `Contact name updated to ${args.name}` });
                    }
                };

                for (const toolCall of responseMessage.tool_calls) {
                    const functionName = toolCall.function.name;
                    const functionToCall = availableFunctions[functionName];
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    // Execute the function
                    const functionResponse = await functionToCall(functionArgs);

                    messages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: functionName,
                        content: functionResponse,
                    });
                }
                // Loop continues to let OpenAI digest the tool results
            } else {
                // No more tool calls, we are done
                keepLooping = false;
            }
        }

        return {
            text: finalResponseText,
            usage: totalUsage
        };

    } catch (error) {
        console.error("Error in generateResponse:", error);
        return "Sorry, I'm having trouble processing your request right now.";
    }
}



/**
 * Helper function to book an appointment.
 */
async function bookAppointment(dateTime, customerPhone, notes) {
    try {
        const contact = await Contact.findOne({ phoneNumber: customerPhone });
        console.log('booked');
        if (!contact) {
            throw new Error("Contact not found for booking");
        }

        // User requested to use the Document ObjectId reference
        //todo: pasar por parametro el ownerId
        const persona = await ClientPersona.findOne({});
        // We use persona._id if found
        const ownerId = persona ? persona._id : null;

        const newAppointment = new Appointment({
            contactId: contact._id,
            ownerId: ownerId, // Now an ObjectId ref
            customerPhone,
            dateTime: new Date(dateTime),
            notes,
            status: 'confirmed',
        });

        await newAppointment.save();
        return `Appointment confirmed for ${dateTime}.`;
    } catch (err) {
        console.error("Booking error:", err);
        return "Failed to book appointment. Please try again.";
    }
}

async function checkAvailability(dateTime) {
    try {
        console.log('checking availability');
        const appointment = await Appointment.findOne({
            dateTime: new Date(dateTime),
        });
        if (appointment) {
            return JSON.stringify({ available: false, message: "Slot not available" });
        }
        return JSON.stringify({ available: true, message: "Slot available" });
    } catch (err) {
        console.error("Availability check error:", err);
        return JSON.stringify({ available: false, message: "Failed to check availability" });
    }
}

module.exports = { generateResponse };
