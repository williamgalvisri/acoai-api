require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Setup Cron Jobs
const setupReminderJob = require('./src/jobs/reminderJob');
setupReminderJob();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
