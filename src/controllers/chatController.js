const openaiService = require('../services/openaiService');

exports.handleChat = async (req, res) => {
    try {
        const { message, userPhone } = req.body;

        if (!message || !userPhone) {
            return res.status(400).json({ error: 'Message and userPhone are required.' });
        }

        const aiResponse = await openaiService.generateResponse(message, userPhone);

        res.json({ response: aiResponse });
    } catch (error) {
        console.error('Chat processing error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
