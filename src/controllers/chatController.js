const openaiService = require('../services/openaiService');
const { BadRequestError } = require('../utils/ApiResponse');

exports.handleChat = async (req, res) => {
    try {
        const { message, userPhone } = req.body;

        if (!message || !userPhone) {
            return res.error(new BadRequestError('Message and userPhone are required.'));
        }

        const aiResponse = await openaiService.generateResponse(message, userPhone);

        return res.success({ response: aiResponse });
    } catch (error) {
        console.error('Chat processing error:', error);
        return res.error(error);
    }
};
