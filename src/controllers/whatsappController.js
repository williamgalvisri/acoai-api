const axios = require('axios');
const openaiService = require('../services/openaiService');
const ChatHistory = require('../models/ChatHistory');

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

                    // Save User Message
                    await ChatHistory.create({
                        phoneNumber: from,
                        role: 'user',
                        content: msgBody
                    });

                    // Generate AI Response
                    // TODO: Dynamic ownerId based on phoneNumberId or config
                    const ownerId = "user_123_costa";
                    const aiResponse = await openaiService.generateResponse(from, msgBody, ownerId);

                    // Save Assistant Response
                    await ChatHistory.create({
                        phoneNumber: from,
                        role: 'assistant',
                        content: aiResponse
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
                }
            }
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('Error handling WhatsApp message:', error.response ? error.response.data : error.message);
        res.sendStatus(500);
    }
};
