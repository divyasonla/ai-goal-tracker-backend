// This script will be required in server.js to schedule weekly report generation
const cron = require('node-cron');
const sheetsService = require('./services/sheets');
const aiService = require('./services/ai');

// Helper to get all users (students) from your user profile sheet
async function getAllUsers() {
  // You may need to adjust this to your actual user fetching logic
  // Example: return await sheetsService.getAllUserProfiles();
  if (sheetsService.getAllUserProfiles) {
    return await sheetsService.getAllUserProfiles();
  }
  return [];
}

// Schedule: Every minute (for testing only)
cron.schedule('* * * * *', async () => {
  console.log('⏰ Running weekly report generation for all students...');
  try {
    const users = await getAllUsers();
    for (const user of users) {
      const email = user.email;
      const username = user.username || null;
      const goals = await sheetsService.getWeeklyGoals(email, username);
      if (!goals.length) continue;
      const totalGoals = goals.length;
      const completed = goals.filter(g => g.status === 'Completed').length;
      const partiallyCompleted = goals.filter(g => g.status === 'Partially Completed').length;
      const notCompleted = goals.filter(g => !g.status || g.status === 'Not Completed').length;
      const aiAnalysis = await aiService.analyzeWeeklyGoals(goals);
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 7);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = today.toISOString().split('T')[0];
      await sheetsService.saveWeeklySummary({
        email,
        username,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        total: totalGoals,
        completed,
        partial: partiallyCompleted,
        missed: notCompleted,
        aiFeedback: aiAnalysis.insights.substring(0, 500),
      });
      console.log(`✅ Weekly report generated for ${email}`);
    }
    console.log('🎉 All weekly reports generated!');
  } catch (err) {
    console.error('❌ Error in scheduled weekly report generation:', err);
  }
});
