// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const goalsRouter = require('./routes/goals');
// const weeklyReportRouter = require('./routes/weeklyReport');
// const profileRouter = require('./routes/profile');
// const authMiddleware = require('./middleware/auth');

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 5000;

// // Middleware
// const allowedOrigins = [
//   process.env.FRONTEND_URL || 'http://localhost:3000',
//   'http://localhost:3001',
//   'http://localhost:3002'
// ];

// app.use(cors({
//   origin: (origin, callback) => {
//     // Allow requests with no origin (mobile apps, curl) or whitelisted origins
//     if (!origin || allowedOrigins.includes(origin)) {
//       return callback(null, true);
//     }
//     return callback(new Error('Not allowed by CORS'));
//   },
//   credentials: true
// }));
// app.use(express.json());

// // Routes
// app.get('/', (req, res) => {
//   res.json({ message: 'AI Goal Tracker API' });
// });

// app.use('/goals', authMiddleware, goalsRouter);
// app.use('/weekly-report', authMiddleware, weeklyReportRouter);
// app.use('/profile', authMiddleware, profileRouter);

// // Error handling middleware
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).json({ error: 'Something went wrong!' });
// });

// app.listen(PORT, () => {
//   // console.log(`Server running on port ${PORT}`);
// });
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const goalsRouter = require('./routes/goals');
const weeklyReportRouter = require('./routes/weeklyReport');
const profileRouter = require('./routes/profile');
const authMiddleware = require('./middleware/auth');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ MIDDLEWARES
app.use(cors({
  origin: "*",
}));
app.use(express.json());

// ✅ ROUTES
app.get('/', (req, res) => {
  res.json({ message: 'AI Goal Tracker API' });
});

app.use('/goals', authMiddleware, goalsRouter);
app.use('/weekly-report', authMiddleware, weeklyReportRouter);
app.use('/profile', authMiddleware, profileRouter);

// ✅ ERROR HANDLER
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ✅ START SERVER
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
