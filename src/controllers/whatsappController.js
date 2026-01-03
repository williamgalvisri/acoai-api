const axios = require('axios');
const openaiService = require('../services/openaiService');
const ChatHistory = require('../models/ChatHistory');
const Contact = require('../models/Contact');
const ClientPersona = require('../models/ClientPersona');
const sseManager = require('../utils/sseManager');
const { InternalError } = require('../utils/ApiResponse');
const { default: mongoose } = require('mongoose');
const bucket = require('../config/firebase');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Helper: Download Media from WhatsApp
async function downloadWhatsAppMedia(mediaId, token) {
    try {
        // 1. Get Media URL
        const urlRes = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const mediaUrl = urlRes.data.url;
        const mimeType = urlRes.data.mime_type;

        // 2. Download Binary
        const binaryRes = await axios.get(mediaUrl, {
            responseType: 'arraybuffer',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        return { buffer: binaryRes.data, mimeType };
    } catch (error) {
        console.error('Error downloading media:', error.message);
        return null;
    }
}

// Helper: Upload to Firebase
async function uploadToFirebase(buffer, mimeType, folder = 'whatsapp_media') {
    try {
        const ext = mimeType.split('/')[1] || 'bin';
        const filename = `${folder}/${uuidv4()}.${ext}`;
        const file = bucket.file(filename);

        await file.save(buffer, {
            metadata: { contentType: mimeType }
        });

        await file.makePublic();
        return `https://storage.googleapis.com/${bucket.name}/${filename}`;
    } catch (error) {
        console.error('Error uploading to Firebase:', error.message);
        return null;
    }
}

// Verify Webhook
exports.verifyWebhook = async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        const persona = await ClientPersona.findOne({ _id: new mongoose.Types.ObjectId(token) });
        if (!persona) {
            return res.error(new InternalError('persona not found'));
        }

        if (mode === 'subscribe' && token === persona._id.toString()) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
};

// Extracted Core Logic
exports.processIncomingMessage = async (messageObject, phoneNumberId, replyCallback) => {
    const from = messageObject.from; // Phone number
    let msgBody = messageObject.text?.body; // Text message content

    // Find Persona by phoneNumberId (WhatsApp Business ID)
    // For CLI, we might need a way to mock or force a persona if phoneNumberId is fake/mocked.
    const persona = await ClientPersona.findOne({ "whatsappBussinesConfig.phoneNumberId": phoneNumberId });

    if (!persona) {
        throw new Error('Persona not found for phoneNumberId: ' + phoneNumberId);
    }

    // 1. Identify/Create Contact or Update
    let contact = await Contact.findOne({ phoneNumber: from });
    if (!contact) {
        contact = await Contact.create({
            phoneNumber: from,
            ownerId: persona._id,
            lastInteraction: new Date()
        });
    } else {
        // Update existing contact's last interaction
        contact = await Contact.findByIdAndUpdate(
            contact._id,
            { lastInteraction: new Date() },
            { new: true }
        );
    }

    // 1.5 HANDLE ORDER MESSAGES
    let orderContext = null;
    
    if (messageObject.type === 'order') {
        const order = messageObject.order;
        const catalogId = order.catalog_id;
        const items = order.product_items || [];
        
        let orderSummary = "User sent a shopping cart/order with the following items:\n";
        items.forEach(item => {
            orderSummary += `- ${item.quantity}x Product ID: ${item.product_retailer_id} (Price: ${item.item_price} ${item.currency})\n`;
        });
        
        if (order.text) {
            orderSummary += `User's Note: "${order.text}"`;
            msgBody = order.text; // Use user's note as the message body if present
        } else {
            msgBody = "I just sent you an order."; // Default text if empty
        }

        console.log('ORDER RECEIVED:', orderSummary);
        orderContext = orderSummary;
        
        // Treat as text so it doesn't get blocked
        messageObject.type = 'text'; 
    }

    // HANDLE TEXT & IMAGE MESSAGES
    if (messageObject.type === 'image') {
        const imageId = messageObject.image?.id;
        const imageCaption = messageObject.image?.caption || "";
        let publicUrl = "[IMAGE_UPLOAD_FAILED]";

        console.log('IMAGE RECEIVED from', from, 'ID:', imageId);

        if (imageId && persona.whatsappBussinesConfig?.token) {
             const mediaData = await downloadWhatsAppMedia(imageId, persona.whatsappBussinesConfig.token);
             if (mediaData) {
                 publicUrl = await uploadToFirebase(mediaData.buffer, mediaData.mimeType);
                 console.log('Image uploaded to:', publicUrl);
             }
        }

        msgBody = `[IMAGE] ${publicUrl} ${imageCaption}`;
        
    } else if (messageObject.type !== 'text') {
        // Still block other types for now (audio, sticker, etc) unless requested otherwise
        console.log(`Blocking unsupported media: ${messageObject.type}`);
        const messageDefaultFail = "Disculpa, por el momento solo puedo leer mensajes de texto e imágenes. Por favor escríbeme lo que necesitas.";

         // Reply to user using callback
        await replyCallback(from, messageDefaultFail, persona);

        // ... (logging logic for blocked content could remain or be simplified) ...
        return 'MEDIA_BLOCKED';
    }

    // Handle Text Messages
    if (msgBody) {
        // 2. Save User Message
        const userMsg = await ChatHistory.create({
            phoneNumber: from,
            role: 'user',
            content: msgBody
        });

        // 3. Emit SSE Event (User Message)
        sseManager.sendEvent('NEW_MESSAGE', {
            _id: userMsg._id,
            contactId: contact._id,
            phoneNumber: from,
            role: 'user',
            content: msgBody ?? 'N/A',
            timestamp: userMsg.timestamp,
        });

        // 4. Check Bot Active Status
        if (contact.isBotActive) {
            // Call Service
            // Pass orderContext if available (it might be null for normal messages)
            const { text: aiResponseText, usage } = await openaiService.generateResponse(from, msgBody, persona._id, orderContext);

            // Save Assistant Response & Audit Log
            const aiMsg = await ChatHistory.create({
                phoneNumber: from,
                role: 'assistant',
                content: aiResponseText, // Use the text part
                tokens: {
                    prompt: usage?.prompt_tokens || 0,
                    completion: usage?.completion_tokens || 0,
                    total: usage?.total_tokens || 0
                }
            });

            // Update Aggregate Usage
            if (persona && usage) {
                await ClientPersona.updateOne(
                    { _id: persona._id },
                    {
                        $inc: {
                            'usage.promptTokens': usage.prompt_tokens || 0,
                            'usage.completionTokens': usage.completion_tokens || 0,
                            'usage.totalTokens': usage.total_tokens || 0
                        }
                    }
                );
            }

            // Emit SSE Event (Assistant Message)
            sseManager.sendEvent('NEW_MESSAGE', {
                _id: aiMsg._id,
                contactId: contact._id,
                phoneNumber: from,
                role: 'assistant',
                content: aiResponseText,
                timestamp: aiMsg.timestamp,
            });

            // Send Response using callback
            await replyCallback(from, aiResponseText, persona);
            
            return 'RESPONSE_SENT';
        } else {
            console.log(`Bot disabled for ${from}. Skipping AI response.`);
            return 'BOT_DISABLED';
        }
    }
    return 'NO_BODY';
};

// Helper to send outbound notifications (e.g. status updates)
exports.sendNotification = async (to, text, persona) => {
    try {
        const phoneNumberId = persona.whatsappBussinesConfig.phoneNumberId;
        const token = persona.whatsappBussinesConfig.token;

        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            data: {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text },
            },
        });
        console.log(`Notification sent to ${to}: ${text}`);
    } catch (error) {
        console.error('Failed to send notification:', error.response ? error.response.data : error.message);
    }
};

// Handle Incoming Messages (Web hook entry point)
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
                
                // Define the reply callback for HTTP/Axios
                const sendReply = async (to, text, persona) => {
                     // Re-use the helper
                     await exports.sendNotification(to, text, persona);
                };

                await exports.processIncomingMessage(messageObject, phoneNumberId, sendReply);
            }
            return res.success(null, 'EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('Error handling WhatsApp message:', error.response ? error.response.data : error.message);
        // If it's our own thrown error from processIncomingMessage
        if (error.message.includes('Persona not found')) {
             return res.error(new InternalError('persona not found'));
        }
        return res.error(error); 
    }
};
