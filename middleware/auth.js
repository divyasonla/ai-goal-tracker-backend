const admin = require('firebase-admin');
const sheetsService = require('../services/sheets');

// Initialize Firebase Admin only if credentials are valid
let firebaseInitialized = false;

if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID && 
    process.env.FIREBASE_PROJECT_ID !== 'demo-project') {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    firebaseInitialized = true;
  } catch (error) {
    console.warn('⚠️  Firebase initialization failed. Running in demo mode.');
    console.warn('Add valid Firebase credentials to .env to enable authentication.');
  }
}

const authMiddleware = async (req, res, next) => {
  // Demo mode: Skip auth if Firebase not initialized
  if (!firebaseInitialized) {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split('Bearer ')[1] : '';

    // Try to decode Firebase JWT payload to extract email (best-effort demo mode)
    let demoEmail = 'demo@example.com';
    if (token) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
        demoEmail = payload.email || demoEmail;
      } catch (e) {
        demoEmail = token; // fallback to raw token string
      }
    }

    // Fetch role from database
    let userRole = 'student';
    try {
      const profile = await sheetsService.getUserProfileByEmail(demoEmail);
      userRole = profile?.role || 'student';
    } catch (e) {
      // Fallback to student if profile doesn't exist yet
    }

    req.user = {
      uid: 'demo-user-' + Date.now(),
      email: demoEmail,
      role: userRole
    };
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Fetch role from database
    let userRole = 'student';
    try {
      const profile = await sheetsService.getUserProfileByEmail(decodedToken.email);
      userRole = profile?.role || 'student';
    } catch (e) {
      // Fallback to student if profile doesn't exist yet
    }
    
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userRole
    };
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }
};

module.exports = authMiddleware;
