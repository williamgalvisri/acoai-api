const express = require('express');
const router = express.Router();
const sseManager = require('../utils/sseManager');

router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseManager.addClient(res);

    req.on('close', () => {
        sseManager.removeClient(res);
    });
});

module.exports = router;
