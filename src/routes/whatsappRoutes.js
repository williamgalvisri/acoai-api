const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

router.get('/webhook', whatsappController.verifyWebhook);
router.post('/webhook', whatsappController.handleMessage);

module.exports = router;
