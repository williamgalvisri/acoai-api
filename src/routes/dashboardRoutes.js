const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/contacts', dashboardController.getContacts);
router.get('/appointments', dashboardController.getAppointments);
router.put('/appointments/:id', dashboardController.updateAppointment);
router.post('/contacts/:id/toggle-bot', dashboardController.toggleBot);
router.get('/contacts/:id/messages', dashboardController.getMessages);

module.exports = router;
