const OpenAI = require('openai');

// Initialize Groq client
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

class AIService {
  async analyzeWeeklyGoals(goals) {
    // Check for API key
    if (!process.env.GROQ_API_KEY) {
      console.error('Groq API key is not configured.');
      return {
        insights: "AI service is not configured. Please add GROQ_API_KEY to your environment variables.",
        recommendations: []
      };
    }

    try {
      // Prepare data for analysis
      const totalGoals = goals.length;
      const completed = goals.filter(g => g.status === 'Completed').length;
      const partiallyCompleted = goals.filter(g => g.status === 'Partially Completed').length;
      const notCompleted = goals.filter(g => g.status === 'Not Completed').length;

      // Group goals by date to find patterns
      const goalsByDate = {};
      goals.forEach(goal => {
        if (!goalsByDate[goal.date]) {
          goalsByDate[goal.date] = [];
        }
        goalsByDate[goal.date].push(goal);
      });

      // Find days with most incomplete goals
      const dayAnalysis = Object.entries(goalsByDate).map(([date, dayGoals]) => {
        const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
        const incomplete = dayGoals.filter(g => g.status !== 'Completed').length;
        return { date, dayName, total: dayGoals.length, incomplete };
      });

      // Extract blockers and reflections
      const blockers = goals
        .filter(g => g.blockers && g.blockers.trim())
        .map(g => g.blockers);
      
      const reflections = goals
        .filter(g => g.reflection && g.reflection.trim())
        .map(g => g.reflection);

      // Create context for AI
      const context = `
Analyze the following weekly goal data for a user and provide a report.

Weekly Performance:
- Total Goals: ${totalGoals}
- Completed: ${completed}
- Partially Completed: ${partiallyCompleted}
- Not Completed: ${notCompleted}

Daily Breakdown:
${dayAnalysis.map(d => `- ${d.dayName}: ${d.incomplete} of ${d.total} goals were not completed.`).join('\n')}

User's Blockers:
${blockers.length > 0 ? blockers.map(b => `- ${b}`).join('\n') : 'None reported.'}

User's Reflections:
${reflections.length > 0 ? reflections.map(r => `- ${r}`).join('\n') : 'None reported.'}

Based on this data, please generate a concise report that includes:
1. A summary of the user's performance.
2. Key trends or problem areas (e.g., specific days, high number of incomplete goals).
3. Actionable recommendations to help the user improve.
4. A motivational closing statement.
`;

      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are a productivity coach analyzing weekly goal data. Provide insightful, actionable feedback to help users improve their goal completion rate.'
          },
          {
            role: 'user',
            content: context
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const insights = completion.choices[0].message.content;

      const recommendations = this.extractRecommendations(insights);

      return {
        insights,
        recommendations
      };
    } catch (error) {
      console.error('Error analyzing goals with Groq:', error);
      return {
        insights: 'There was an error generating the AI analysis. Please try again later.',
        recommendations: []
      };
    }
  }

  extractRecommendations(insights) {
    // A simple way to extract lines that seem like recommendations
    const lines = insights.split('\n');
    const recommendations = lines.filter(line => 
      /^\s*(\d+\.|-|\*)\s/.test(line) && // Starts with a number, dash, or asterisk
      (line.toLowerCase().includes('try') || 
      line.toLowerCase().includes('consider') ||
      line.toLowerCase().includes('focus on'))
    );
    return recommendations.slice(0, 4); // Return up to 4 recommendations
  }
}

module.exports = new AIService();
