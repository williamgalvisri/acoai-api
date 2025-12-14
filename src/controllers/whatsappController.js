const axios = require('axios');
const openaiService = require('../services/openaiService');
const ChatHistory = require('../models/ChatHistory');
const Contact = require('../models/Contact');
const sseManager = require('../utils/sseManager');

// Verify Webhook
exports.verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
};

// Handle Incoming Messages
exports.handleMessage = async (req, res) => {
    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            if (
                body.entry &&
                body.entry[0].changes &&
                body.entry[0].changes[0] &&
                body.entry[0].changes[0].value.messages &&
                body.entry[0].changes[0].value.messages[0]
            ) {
                const messageObject = body.entry[0].changes[0].value.messages[0];
                const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
                const from = messageObject.from; // Phone number
                const msgBody = messageObject.text?.body; // Text message content

                // Only handle text messages for now
                if (msgBody) {

                    // 1. Identify/Create Contact
                    let contact = await Contact.findOne({ phoneNumber: from });
                    if (!contact) {
                        contact = await Contact.create({ phoneNumber: from });
                    }

                    // 2. Save User Message
                    const userMsg = await ChatHistory.create({
                        phoneNumber: from,
                        role: 'user',
                        content: msgBody
                    });

                    // 3. Emit SSE Event (User Message)
                    sseManager.sendEvent('NEW_MESSAGE', {
                        contactId: contact._id,
                        phoneNumber: from,
                        role: 'user',
                        content: msgBody,
                        timestamp: userMsg.timestamp,
                    });

                    // 4. Check Bot Active Status
                    if (contact.isBotActive) {
                        // Generate AI Response
                        // TODO: Dynamic ownerId based on phoneNumberId or config
                        const ownerId = "user_123_costa";
                        const aiResponse = await openaiService.generateResponse(from, msgBody, ownerId);

                        // Save Assistant Response
                        const aiMsg = await ChatHistory.create({
                            phoneNumber: from,
                            role: 'assistant',
                            content: aiResponse
                        });

                        // Emit SSE Event (Assistant Message)
                        sseManager.sendEvent('NEW_MESSAGE', {
                            contactId: contact._id,
                            phoneNumber: from,
                            role: 'assistant',
                            content: aiResponse,
                            timestamp: aiMsg.timestamp,
                        });

                        // Send Response to WhatsApp
                        await axios({
                            method: 'POST',
                            url: `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
                            headers: {
                                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                                'Content-Type': 'application/json',
                            },
                            data: {
                                messaging_product: 'whatsapp',
                                to: from,
                                text: { body: aiResponse },
                            },
                        });
                    } else {
                        console.log(`Bot disabled for ${from}. Skipping AI response.`);
                    }
                }
            }
            return res.success(null, 'EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('Error handling WhatsApp message:', error.response ? error.response.data : error.message);
        return res.error(error); // This sends a JSON error response. Webhooks usually just want a 500 status, but this is what was requested.
    }
};
