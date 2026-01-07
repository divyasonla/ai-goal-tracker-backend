require('dotenv').config();
const { google } = require('googleapis');

// Initialize Google Sheets API only if credentials are valid
let sheets = null;
let sheetsInitialized = false;

if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SHEET_ID !== 'demo-sheet-id') {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });
    sheetsInitialized = true;
  } catch (error) {
  }
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
// Use the existing default tab name from the spreadsheet
const GOALS_SHEET_NAME = 'Sheet1';
const USERS_SHEET_NAME = 'Users';
const WEEKLY_SHEET_NAME = 'WeeklyProgress';

const GOAL_HEADERS = ['ID', 'Email', 'Username', 'Date', 'Goal', 'Priority', 'TimeEstimate', 'Status', 'Reflection', 'Blockers'];
const USER_HEADERS = ['Email', 'Username', 'FirstName', 'LastName', 'Phase', 'Role', 'UpdatedAt'];
const WEEKLY_HEADERS = ['Email', 'Username', 'WeekStart', 'WeekEnd', 'Total', 'Completed', 'Partial', 'Missed', 'CompletionRate', 'PerformanceStatus', 'AIFeedback', 'FinalRemarks', 'RecordedAt'];

class SheetsService {
  // Demo storage for when Google Sheets is not available
  demoData = [];
  usersDemoData = [];
  weeklyDemoData = [];

  parseGoalRow(row) {
    if (!row || row.length < 7) return null;
    
    // Strategy: Check if row[3] looks like a date (YYYY-MM-DD)
    // If yes, then row has username column: [ID, Email, Username, Date, Goal, ...]
    // If no, then row lacks username: [ID, Email, Date, Goal, ...]
    const row3LooksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(row[3]);
    const hasUsername = row3LooksLikeDate;
    
    const parsed = {
      id: row[0] || '',
      email: row[1] || '',
      username: hasUsername ? (row[2] || '') : '',
      date: hasUsername ? (row[3] || '') : (row[2] || ''),
      goal: hasUsername ? (row[4] || '') : (row[3] || ''),
      priority: hasUsername ? (row[5] || '') : (row[4] || ''),
      timeEstimate: hasUsername ? (row[6] || '') : (row[5] || ''),
      status: hasUsername ? (row[7] || '') : (row[6] || ''),
      reflection: hasUsername ? (row[8] || '') : (row[7] || ''),
      blockers: hasUsername ? (row[9] || '') : (row[8] || '')
    };
    
    // Validate that we have essential fields
    if (!parsed.date || !parsed.goal) {
      return null;
    }
    
    return parsed;
  }

  goalToRow(goal) {
    return [
      goal.id,
      goal.email,
      goal.username || '',
      goal.date,
      goal.goal,
      goal.priority,
      goal.timeEstimate || '',
      goal.status || 'Not Completed',
      goal.reflection || '',
      goal.blockers || ''
    ];
  }

  async getUserProfileByEmail(email) {
    if (!email) return null;

    if (sheetsInitialized) {
      await this.initializeSheet();
    }

    if (!sheetsInitialized) {
      return this.usersDemoData.find(user => user.email === email) || null;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET_NAME}!A2:G`,
    });

    const rows = response.data.values || [];
    const row = rows.find(r => r[0] === email);
    if (!row) return null;

    return {
      email: row[0],
      username: row[1],
      firstName: row[2],
      lastName: row[3],
      phase: Number(row[4]) || 0,
      role: row[5] || 'student',
      updatedAt: row[6]
    };
  }

  async getUserProfileByUsername(username) {
    if (!username) return null;

    if (sheetsInitialized) {
      await this.initializeSheet();
    }

    if (!sheetsInitialized) {
      return this.usersDemoData.find(user => user.username === username) || null;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET_NAME}!A2:G`,
    });

    const rows = response.data.values || [];
    const row = rows.find(r => r[1] === username);
    if (!row) return null;

    return {
      email: row[0],
      username: row[1],
      firstName: row[2],
      lastName: row[3],
      phase: Number(row[4]) || 0,
      role: row[5] || 'student',
      updatedAt: row[6]
    };
  }

  async upsertUserProfile(profile) {
    const payload = {
      email: profile.email,
      username: profile.username,
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phase: Number.isFinite(profile.phase) ? Number(profile.phase) : 0,
      role: profile.role || 'student',
      updatedAt: new Date().toISOString()
    };

    if (sheetsInitialized) {
      await this.initializeSheet();
    }

    if (!sheetsInitialized) {
      const usernameTaken = this.usersDemoData.some(u => u.username === payload.username && u.email !== payload.email);
      if (usernameTaken) {
        const error = new Error('Username already taken');
        error.code = 'USERNAME_TAKEN';
        throw error;
      }

      const existingIndex = this.usersDemoData.findIndex(u => u.email === payload.email);
      if (existingIndex !== -1) {
        this.usersDemoData[existingIndex] = payload;
      } else {
        this.usersDemoData.push(payload);
      }
      return payload;
    }

    // Check unique username
    const existingByUsername = await this.getUserProfileByUsername(payload.username);
    if (existingByUsername && existingByUsername.email !== payload.email) {
      const error = new Error('Username already taken');
      error.code = 'USERNAME_TAKEN';
      throw error;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET_NAME}!A2:G`,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === payload.email);

    if (rowIndex === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USERS_SHEET_NAME}!A:G`,
        valueInputOption: 'RAW',
        resource: { values: [[payload.email, payload.username, payload.firstName, payload.lastName, payload.phase, payload.role, payload.updatedAt]] }
      });
    } else {
      const actualRowIndex = rowIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USERS_SHEET_NAME}!A${actualRowIndex}:G${actualRowIndex}`,
        valueInputOption: 'RAW',
        resource: { values: [[payload.email, payload.username, payload.firstName, payload.lastName, payload.phase, payload.role, payload.updatedAt]] }
      });
    }

    return payload;
  }

  // Initialize sheets with headers if they don't exist
  async initializeSheet() {
    if (!sheetsInitialized) {
      // console.log('📝 Demo mode: Using in-memory storage');
      return;
    }

    try {
      const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
      });

      const sheetNames = response.data.sheets.map(sheet => sheet.properties.title);

      const ensureSheet = async (sheetName, headers) => {
        const exists = sheetNames.includes(sheetName);
        if (!exists) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
              requests: [{
                addSheet: {
                  properties: { title: sheetName }
                }
              }]
            }
          });
        }

        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] }
        });
      };

      await ensureSheet(GOALS_SHEET_NAME, GOAL_HEADERS);
      await ensureSheet(USERS_SHEET_NAME, USER_HEADERS);
      await ensureSheet(WEEKLY_SHEET_NAME, WEEKLY_HEADERS);
    } catch (error) {
      console.error('Error initializing sheet:', error);
      throw error;
    }
  }

  // Add a new goal
  async addGoal(goal) {
    const id = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (sheetsInitialized) {
      await this.initializeSheet();
    }
    
    // Demo mode: Store in memory
    if (!sheetsInitialized) {
      // console.log('⚠️  Adding goal to demo memory (Sheets not initialized)');
      const newGoal = {
        id,
        email: goal.email,
        username: goal.username || '',
        date: goal.date,
        goal: goal.goal,
        priority: goal.priority,
        timeEstimate: goal.timeEstimate || '',
        status: goal.status || 'Not Completed',
        reflection: goal.reflection || '',
        blockers: goal.blockers || ''
      };
      this.demoData.push(newGoal);
      return newGoal;
    }

    // console.log('📝 Adding goal to Google Sheets:', goal.email, goal.goal);
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${GOALS_SHEET_NAME}!A:J`,
        valueInputOption: 'RAW',
        resource: { values: [this.goalToRow({ ...goal, id })] }
      });

      // console.log('✅ Goal added to Sheets successfully!');
      return { id, ...goal };
    } catch (error) {
      console.error('Error adding goal:', error);
      throw error;
    }
  }

  // Get goals for a specific date
  async getGoals(email, date = null, username = null) {
    const identifier = username || email;
    // console.log(`📖 Fetching goals for ${identifier}, date: ${date || 'all'}`);
    
    // Demo mode: Retrieve from memory
    if (!sheetsInitialized) {
      // console.log('⚠️  Reading from demo memory');
      return this.demoData.filter(goal => {
        const byUsername = username
          ? (goal.username ? goal.username === username : goal.email === email)
          : goal.email === email;
        const dateMatch = date ? goal.date === date : true;
        return byUsername && dateMatch;
      });
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${GOALS_SHEET_NAME}!A2:J`,
      });

      const rows = response.data.values || [];
      // console.log(`📊 Sheet has ${rows.length} total rows`);
      
      let goals = rows.map(row => this.parseGoalRow(row)).filter(Boolean);

      // Prefer username filter, fallback to email
      goals = goals.filter(g => {
        if (username) {
          return g.username ? g.username === username : g.email === email;
        }
        return g.email === email;
      });
      // console.log(`✅ Found ${goals.length} goals for ${identifier}`);

      // Filter by date if provided
      if (date) {
        goals = goals.filter(g => g.date === date);
      }

      return goals;
    } catch (error) {
      console.error('Error getting goals:', error);
      throw error;
    }
  }

  // Update a goal
  async updateGoal(id, updates) {
    // Demo mode: Update in memory
    if (!sheetsInitialized) {
      const goalIndex = this.demoData.findIndex(goal => goal.id === id);
      if (goalIndex === -1) {
        throw new Error('Goal not found');
      }
      const updatedGoal = { ...this.demoData[goalIndex], ...updates };
      this.demoData[goalIndex] = updatedGoal;
      return updatedGoal;
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${GOALS_SHEET_NAME}!A2:J`,
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === id);

      if (rowIndex === -1) {
        throw new Error('Goal not found');
      }

      // console.log('🔄 Updating goal - existing row:', JSON.stringify(rows[rowIndex].slice(0, 5)));
      const existingGoal = this.parseGoalRow(rows[rowIndex]);
      // console.log('🔄 Parsed existing goal:', { id: existingGoal.id, username: existingGoal.username, date: existingGoal.date, goal: existingGoal.goal?.substring(0, 30) });

      const updatedGoal = { ...existingGoal, ...updates };
      // console.log('🔄 Updated goal:', { id: updatedGoal.id, username: updatedGoal.username, date: updatedGoal.date, goal: updatedGoal.goal?.substring(0, 30), status: updatedGoal.status });
      
      const actualRowIndex = rowIndex + 2; // +2 because sheet is 1-indexed and we started from row 2
      const rowData = this.goalToRow(updatedGoal);
      // console.log('🔄 Writing row:', JSON.stringify(rowData.slice(0, 5)));

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${GOALS_SHEET_NAME}!A${actualRowIndex}:J${actualRowIndex}`,
        valueInputOption: 'RAW',
        resource: { values: [rowData] }
      });

      // console.log('✅ Goal updated successfully');
      return updatedGoal;
    } catch (error) {
      console.error('❌ Error updating goal:', error);
      throw error;
    }
  }

  // Get goals for the past week
  async getWeeklyGoals(email, username = null) {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0); // Start of 7 days ago

    // console.log(`📅 Weekly date range: ${weekAgo.toISOString()} to ${today.toISOString()}`);

    // Demo mode: Filter from memory
    if (!sheetsInitialized) {
      return this.demoData.filter(g => {
        const userMatch = username
          ? (g.username ? g.username === username : g.email === email)
          : g.email === email;
        if (!userMatch) return false;
        const goalDate = new Date(g.date);
        goalDate.setHours(0, 0, 0, 0);
        return goalDate >= weekAgo && goalDate <= today;
      });
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${GOALS_SHEET_NAME}!A2:J`,
      });

      const rows = response.data.values || [];
      const goals = rows.map(row => this.parseGoalRow(row)).filter(Boolean);

      // console.log(`📊 Total goals before filtering: ${goals.length}`);
      if (goals.length > 0) {
        // console.log(`📊 Sample goal dates:`, goals.slice(0, 3).map(g => g.date));
      }

      // Filter by email and date range
      const filteredGoals = goals.filter(g => {
        const userMatch = username
          ? (g.username ? g.username === username : g.email === email)
          : g.email === email;
        if (!userMatch) return false;
        
        if (!g.date) {
          // console.log(`⚠️  Goal has no date, skipping:`, g.goal?.substring(0, 30));
          return false;
        }
        
        const goalDate = new Date(g.date);
        if (isNaN(goalDate.getTime())) {
          // console.log(`⚠️  Invalid date format for goal: ${g.date}`, g.goal?.substring(0, 30));
          return false;
        }
        
        goalDate.setHours(0, 0, 0, 0);
        const isInRange = goalDate >= weekAgo && goalDate <= today;
        
        if (!isInRange) {
          // console.log(`📅 Goal date ${g.date} is outside range (${weekAgo.toDateString()} to ${today.toDateString()})`);
        }
        
        return isInRange;
      });

      // console.log(`📊 Goals after date filtering: ${filteredGoals.length}`);
      return filteredGoals;
    } catch (error) {
      console.error('Error getting weekly goals:', error);
      throw error;
    }
  }

  // Get all goals (for admin/teacher) - optional email filter
  async getAllGoals(email = null, date = null, username = null) {
    // Demo mode: Retrieve from memory
    if (!sheetsInitialized) {
      return this.demoData.filter(goal => {
        const emailMatch = email ? goal.email === email : true;
        const usernameMatch = username ? (goal.username ? goal.username === username : true) : true;
        const dateMatch = date ? goal.date === date : true;
        return emailMatch && usernameMatch && dateMatch;
      });
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${GOALS_SHEET_NAME}!A2:J`,
      });

      const rows = response.data.values || [];
      const goals = rows.map(row => this.parseGoalRow(row)).filter(Boolean);

      // Filter by email (optional) and date (optional)
      return goals.filter(g => {
        const emailMatch = email ? g.email === email : true;
        const usernameMatch = username ? (g.username ? g.username === username : true) : true;
        const dateMatch = date ? g.date === date : true;
        return emailMatch && usernameMatch && dateMatch;
      });
    } catch (error) {
      console.error('Error getting all goals:', error);
      throw error;
    }
  }

  async saveWeeklySummary(summary) {
    // Calculate performance status
    const completionRate = summary.total > 0 ? ((summary.completed / summary.total) * 100).toFixed(1) : '0.0';
    let performanceStatus = 'Needs Improvement';
    if (parseFloat(completionRate) >= 80) performanceStatus = 'Excellent';
    else if (parseFloat(completionRate) >= 60) performanceStatus = 'Good';

    // Generate final remarks
    let finalRemarks = '';
    if (parseFloat(completionRate) >= 80) {
      finalRemarks = 'Outstanding performance! Keep up the excellent work with consistent effort.';
    } else if (parseFloat(completionRate) >= 60) {
      finalRemarks = 'Good progress shown. With better consistency and planning, performance can improve significantly.';
    } else {
      finalRemarks = 'Needs more consistency and better planning. Focus on achievable goals and maintain daily discipline.';
    }

    const record = {
      email: summary.email,
      username: summary.username || '',
      weekStart: summary.weekStart,
      weekEnd: summary.weekEnd,
      total: summary.total,
      completed: summary.completed,
      partial: summary.partial,
      missed: summary.missed,
      completionRate: completionRate + '%',
      performanceStatus: performanceStatus,
      aiFeedback: summary.aiFeedback || 'Focus on consistency and time management',
      finalRemarks: finalRemarks,
      recordedAt: new Date().toISOString()
    };

    if (!sheetsInitialized) {
      // For demo mode, update existing or add new
      const existingIndex = this.weeklyDemoData.findIndex(
        r => r.email === summary.email && r.weekStart === summary.weekStart && r.weekEnd === summary.weekEnd
      );
      if (existingIndex >= 0) {
        this.weeklyDemoData[existingIndex] = record;
      } else {
        this.weeklyDemoData.push(record);
      }
      return record;
    }

    await this.initializeSheet();

    // Check if entry already exists for this user and week
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${WEEKLY_SHEET_NAME}!A:M`,
    });

    const rows = response.data.values || [];
    let existingRowIndex = -1;
    
    // Skip header row and find matching entry
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === summary.email && 
          rows[i][2] === summary.weekStart && 
          rows[i][3] === summary.weekEnd) {
        existingRowIndex = i;
        break;
      }
    }

    const rowData = [
      record.email,
      record.username,
      record.weekStart,
      record.weekEnd,
      record.total,
      record.completed,
      record.partial,
      record.missed,
      record.completionRate,
      record.performanceStatus,
      record.aiFeedback,
      record.finalRemarks,
      record.recordedAt,
    ];

    if (existingRowIndex >= 0) {
      // Update existing row (row index + 1 because sheets are 1-indexed)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${WEEKLY_SHEET_NAME}!A${existingRowIndex + 1}:M${existingRowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: {
          values: [rowData]
        }
      });
    } else {
      // Add new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${WEEKLY_SHEET_NAME}!A:M`,
        valueInputOption: 'RAW',
        resource: {
          values: [rowData]
        }
      });
    }

    return record;
  }

  async getAllWeeklyReports() {
    if (!sheetsInitialized) {
      await this.initializeSheet();
    }

    if (!sheetsInitialized) {
      return [];
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${WEEKLY_SHEET_NAME}!A2:M`,
      });

      const rows = response.data.values || [];
      
      return rows.map(row => ({
        email: row[0] || '',
        username: row[1] || '',
        weekStart: row[2] || '',
        weekEnd: row[3] || '',
        totalGoals: parseInt(row[4]) || 0,
        completed: parseInt(row[5]) || 0,
        partial: parseInt(row[6]) || 0,
        missed: parseInt(row[7]) || 0,
        completionRate: parseFloat(row[8]) || 0,
        performanceStatus: row[9] || '',
        aiFeedback: row[10] || '',
        finalRemarks: row[11] || '',
        recordedAt: row[12] || '',
      }));
    } catch (error) {
      console.error('Error fetching all weekly reports:', error);
      return [];
    }
  }
}

module.exports = new SheetsService();
