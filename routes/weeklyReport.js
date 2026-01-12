const express = require('express');
const router = express.Router();
const sheetsService = require('../services/sheets');
const aiService = require('../services/ai');

// GET /weekly-report - Generate weekly report with AI insights
router.get('/', async (req, res) => {
  try {
    const email = req.user.email;
    const profile = await sheetsService.getUserProfileByEmail(email);
    const username = profile?.username || null;

    // Get goals from the past week
    const goals = await sheetsService.getWeeklyGoals(email, username);

    // console.log('📊 Weekly report - Goals fetched:', goals.length);
    if (goals.length > 0) {
      // console.log('📊 Sample goal statuses:', goals.slice(0, 3).map(g => ({ status: g.status, goal: g.goal?.substring(0, 30) })));
    }

    if (goals.length === 0) {
      return res.json({
        totalGoals: 0,
        completed: 0,
        partiallyCompleted: 0,
        notCompleted: 0,
        completedPercentage: 0,
        partialPercentage: 0,
        missedPercentage: 0,
        aiInsights: 'No goals found for the past week. Start adding goals to see insights!',
        recommendations: ['Set your first goal to get started', 'Aim for 3-5 goals per day']
      });
    }

    // Calculate statistics
    const totalGoals = goals.length;
    const completed = goals.filter(g => g.status === 'Completed').length;
    const partiallyCompleted = goals.filter(g => g.status === 'Partially Completed').length;
    // Count goals without status or with 'Not Completed' status as not completed
    const notCompleted = goals.filter(g => !g.status || g.status === 'Not Completed').length;

    // console.log('📊 Weekly stats:', { totalGoals, completed, partiallyCompleted, notCompleted });
    // console.log('📊 Status breakdown:', goals.reduce((acc, g) => {
    //   const status = g.status || 'undefined';
    //   acc[status] = (acc[status] || 0) + 1;
    //   return acc;
    // }, {}));

    const completedPercentage = (completed / totalGoals) * 100;
    const partialPercentage = (partiallyCompleted / totalGoals) * 100;
    const missedPercentage = (notCompleted / totalGoals) * 100;

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = today.toISOString().split('T')[0];

    // Persist weekly summary to a separate sheet
    // Get AI analysis
    const aiAnalysis = await aiService.analyzeWeeklyGoals(goals);

    // Conditionally save weekly summary with AI feedback
    try {
      const shouldSave = req.query.save === 'true';
      // Use IST timezone to check Saturday
      const isSaturdayIST = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        timeZone: 'Asia/Kolkata'
      }) === 'Saturday';

      if (shouldSave && isSaturdayIST) {
        await sheetsService.saveWeeklySummary({
          email,
          username,
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          total: totalGoals,
          completed,
          partial: partiallyCompleted,
          missed: notCompleted,
          aiFeedback: aiAnalysis.insights.substring(0, 500), // Limit length for sheet
        });
      }
    } catch (e) {
      console.warn('Failed to save weekly summary:', e.message);
    }

    res.json({
      totalGoals,
      completed,
      partiallyCompleted,
      notCompleted,
      completedPercentage,
      partialPercentage,
      missedPercentage,
      aiInsights: aiAnalysis.insights,
      recommendations: aiAnalysis.recommendations
    });
  } catch (error) {
    console.error('Error generating weekly report:', error);
    res.status(500).json({ error: 'Failed to generate weekly report' });
  }
});

// GET /weekly-report/all - Get all students' weekly reports (Teacher only)
router.get('/all', async (req, res) => {
  try {
    const isTeacher = req.user.role === 'teacher' || req.user.role === 'admin';
    
    if (!isTeacher) {
      return res.status(403).json({ error: 'Access denied. Teachers only.' });
    }

    // Fetch all weekly reports from WeeklyProgress sheet
    const allReports = await sheetsService.getAllWeeklyReports();
    
    res.json(allReports);
  } catch (error) {
    console.error('Error fetching all weekly reports:', error);
    res.status(500).json({ error: 'Failed to fetch weekly reports' });
  }
});

module.exports = router;
