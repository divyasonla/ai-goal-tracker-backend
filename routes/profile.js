const express = require('express');
const router = express.Router();
const sheetsService = require('../services/sheets');

// GET /profile - get current user's profile
router.get('/', async (req, res) => {
  try {
    const email = req.user.email;
    
    let profile = await sheetsService.getUserProfileByEmail(email);

    if (!profile) {
      const baseUsername = (email || 'user@example.com').split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'user';

      let createdProfile = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidate = attempt === 0 ? baseUsername : `${baseUsername}${attempt}`;
        try {
          createdProfile = await sheetsService.upsertUserProfile({
            email,
            username: candidate,
            firstName: '',
            lastName: '',
            phase: 0,
            role: 'student',
          });
          break;
        } catch (err) {
          if (err.code === 'USERNAME_TAKEN') {
            continue;
          }
          throw err;
        }
      }

      if (!createdProfile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      profile = createdProfile;
    }

    res.json(profile);
  } catch (error) {
    console.error('❌ Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// POST /profile - create or update profile
router.post('/', async (req, res) => {
  try {
    const email = req.user.email;
    const { username, firstName, lastName, phase, role } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const numericPhase = Number.isFinite(Number(phase)) ? Number(phase) : 0;
    if (numericPhase < 0 || numericPhase > 7) {
      return res.status(400).json({ error: 'Phase must be between 0 and 7' });
    }

    const savedProfile = await sheetsService.upsertUserProfile({
      email,
      username: normalizedUsername,
      firstName: firstName?.trim() || '',
      lastName: lastName?.trim() || '',
      phase: numericPhase,
      role: role || 'student',
    });

    res.status(200).json(savedProfile);
  } catch (error) {
    console.error('❌ Error saving profile:', error);
    if (error.code === 'USERNAME_TAKEN') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

module.exports = router;
