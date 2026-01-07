const express = require('express');
const router = express.Router();
const sheetsService = require('../services/sheets');

// POST /goals - Add a new goal
router.post('/', async (req, res) => {
  try {
    const { goal, priority, timeEstimate, date } = req.body;
    const email = req.user.email;

    const profile = await sheetsService.getUserProfileByEmail(email);
    const username = profile?.username || null;

    if (!goal || !priority || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newGoal = await sheetsService.addGoal({
      email,
      username,
      date,
      goal,
      priority,
      timeEstimate,
      status: 'Not Completed'
    });

    res.status(201).json(newGoal);
  } catch (error) {
    console.error('Error adding goal:', error);
    res.status(500).json({ error: 'Failed to add goal' });
  }
});

// GET /goals - Get goals for a specific date or all goals
router.get('/', async (req, res) => {
  try {
    const email = req.user.email;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'teacher';
    const { date, studentEmail, studentUsername } = req.query;
    const profile = await sheetsService.getUserProfileByEmail(email);
    const username = profile?.username || null;

    // Admin/Teacher can see all students' goals
    if (isAdmin) {
      // If studentEmail is provided, show that student's goals
      // Otherwise show all goals
      const targetEmail = studentEmail || null;
      const goals = await sheetsService.getAllGoals(targetEmail, date, studentUsername || null);
      res.json(goals);
    } else {
      // Regular users only see their own goals
      const goals = await sheetsService.getGoals(email, date, username);
      res.json(goals);
    }
  } catch (error) {
    console.error('Error getting goals:', error);
    res.status(500).json({ error: 'Failed to get goals' });
  }
});

// PATCH /goals/:id - Update goal status
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reflection, blockers, goal } = req.body;

    const updatedGoal = await sheetsService.updateGoal(id, {
      status,
      reflection,
      blockers,
      goal,
    });

    res.json(updatedGoal);
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

module.exports = router;
