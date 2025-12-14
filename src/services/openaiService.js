const OpenAI = require('openai');
const ClientPersona = require('../models/ClientPersona');
const ChatHistory = require('../models/ChatHistory');
const Appointment = require('../models/Appointment');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generates a response from OpenAI based on the user's message, history, and the client's persona.
 * @param {string} phoneNumber - The user's phone number.
 * @param {string} messageText - The message from the user.
 * @param {string} ownerId - The ID of the business owner to fetch the persona.
 * @returns {Promise<string>} - The AI's response.
 */
async function generateResponse(phoneNumber, messageText, ownerId) {
    try {
        // 1. Fetch Client Persona
        // Assuming ownerId is passed or determined upstream
        const persona = await ClientPersona.findOne({ ownerId });

        if (!persona) {
            console.warn(`Persona not found for ownerId: ${ownerId}. Using fallback.`);
        }

        // 2. Fetch Chat History
        const history = await ChatHistory.find({ phoneNumber })
            .sort({ timestamp: -1 })
            .limit(10);

        // Reverse to chronological order for the LLM
        const conversationHistory = history.reverse().map(msg => ({
            role: msg.role,
            content: msg.content,
        }));

        // 3. Construct System Prompt
        let systemPrompt = "You are a helpful assistant.";
        if (persona) {
            const examples = persona.responseExamples.map(ex => `User: ${ex.userMessage}\nYou: ${ex.idealResponse}`).join('\n');
            const services = persona.businessContext?.services?.join(', ') || '';
            const pricing = JSON.stringify(persona.businessContext?.pricing || {});
            const location = persona.businessContext?.location || '';

            systemPrompt = `You are ${persona.botName}. 
      Your tone is ${persona.toneDescription}. 
      Use these keywords naturally: ${persona.keywords.join(', ')}.
      Fillers to use occasionally: ${persona.fillers.join(', ')}.
      
      Business Context:
      Services: ${services}
      Pricing: ${pricing}
      Location: ${location}

      Here are examples of how you speak (Few-Shot Learning):
      ${examples}
      
      Goal: Automate appointment scheduling while mimicking the detailed persona above.
      If the user wants to book, check availability first.`;
        }

        // 4. Define Tools
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
        ];

        // 5. Call OpenAI
        const messages = [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
            { role: "user", content: messageText },
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            tools: tools,
            tool_choice: "auto",
        });

        const responseMessage = response.choices[0].message;

        // 6. Handle Tool Calls
        if (responseMessage.tool_calls) {
            const availableFunctions = {
                checkAvailability: async (args) => {
                    const availability = await checkAvailability(args.dateTime);
                    return availability;
                },
                bookAppointment: async (args) => {
                    return await bookAppointment(args.dateTime, phoneNumber, args.notes);
                },
            };

            messages.push(responseMessage); // Extend conversation with assistant's reply

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

            // Get final response from model after tool execution
            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messages,
            });

            return secondResponse.choices[0].message.content;
        }

        return responseMessage.content;

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
        // In a real app, check availability here.
        const newAppointment = new Appointment({
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
