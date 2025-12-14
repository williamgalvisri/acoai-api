const express = require('express');
const cors = require('cors');
const chatRoutes = require('./routes/chatRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Health Check
app.get('/', (req, res) => {
    res.send('Eco AI API is running...');
});

module.exports = app;
