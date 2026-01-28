

require('dotenv').config();
const { google } = require('googleapis');

/* =======================
   GOOGLE SHEETS INIT
======================= */

let sheets = null;
let sheetsInitialized = false;

if (
  process.env.GOOGLE_SHEET_ID &&
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
  process.env.GOOGLE_PRIVATE_KEY &&
  process.env.GOOGLE_SHEET_ID !== 'demo-sheet-id'
) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheets = google.sheets({ version: 'v4', auth });
    sheetsInitialized = true;
  } catch (err) {
    console.error('❌ Google Sheets init failed, demo mode enabled');
  }
}

/* =======================
   CONSTANTS
======================= */

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

const GOALS_SHEET_NAME = 'Sheet1';
const USERS_SHEET_NAME = 'Users';
const WEEKLY_SHEET_NAME = 'WeeklyProgress';

const GOAL_HEADERS = [
  'ID', 'Email', 'Username', 'Date', 'Goal', 'Priority',
  'TimeEstimate', 'Status', 'Reflection', 'Blockers'
];

const USER_HEADERS = [
  'Email', 'Username', 'FirstName', 'LastName',
  'Phase', 'Role', 'UpdatedAt'
];

const WEEKLY_HEADERS = [
  'Email', 'Username', 'WeekStart', 'WeekEnd',
  'Total', 'Completed', 'Partial', 'Missed',
  'CompletionRate', 'PerformanceStatus',
  'AIFeedback', 'FinalRemarks', 'RecordedAt'
];

/* =======================
   SERVICE CLASS
======================= */

class SheetsService {
    // Get all goals for a user for the past week
    async getWeeklyGoals(email, username = null) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);

      let allGoals = [];
      if (!sheetsInitialized) {
        allGoals = this.demoData;
      } else {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${GOALS_SHEET_NAME}!A2:J`,
        });
        allGoals = (res.data.values || []).map(r => this.parseGoalRow(r)).filter(Boolean);
      }

      return allGoals.filter(g => {
        const userMatch = username ? g.username === username : g.email === email;
        if (!userMatch) return false;
        if (!g.date) return false;
        const goalDate = new Date(g.date);
        if (isNaN(goalDate.getTime())) return false;
        goalDate.setHours(0, 0, 0, 0);
        return goalDate >= weekAgo && goalDate <= today;
      });
    }
  demoData = [];
  usersDemoData = [];
  weeklyDemoData = [];

  /* ---------- INIT SHEETS ---------- */
  async initializeSheet() {
    if (!sheetsInitialized) return;

    const res = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheetNames = res.data.sheets.map(s => s.properties.title);

    const ensureSheet = async (name, headers) => {
      if (!sheetNames.includes(name)) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{ addSheet: { properties: { title: name } } }],
          },
        });
      }
      // Always ensure header row exists (for all sheets)
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${name}!A1:Z1`,
      });
      const firstRow = res.data.values && res.data.values[0] ? res.data.values[0] : [];
      const needsHeader = firstRow.length === 0 || headers.some((h, i) => firstRow[i] !== h);
      if (needsHeader) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${name}!A1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] },
        });
      }
    };

    await ensureSheet(GOALS_SHEET_NAME, GOAL_HEADERS);
    await ensureSheet(USERS_SHEET_NAME, USER_HEADERS);
    await ensureSheet(WEEKLY_SHEET_NAME, WEEKLY_HEADERS);
  }

  /* ---------- HELPERS ---------- */
  parseGoalRow(row) {
    if (!row || row.length < 7) return null;
    const hasUsername = row.length >= 10;

    return {
      id: row[0] || '',
      email: row[1] || '',
      username: hasUsername ? row[2] : '',
      date: hasUsername ? row[3] : row[2],
      goal: hasUsername ? row[4] : row[3],
      priority: hasUsername ? row[5] : row[4],
      timeEstimate: hasUsername ? row[6] : row[5],
      status: hasUsername ? row[7] : row[6],
      reflection: hasUsername ? row[8] : row[7],
      blockers: hasUsername ? row[9] : row[8],
    };
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
      goal.blockers || '',
    ];
  }

  /* ---------- USERS ---------- */
  async getAllUserProfiles() {
    if (!sheetsInitialized) return this.usersDemoData;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET_NAME}!A2:B`,
    });

    return (res.data.values || []).map(r => ({
      email: r[0] || '',
      username: r[1] || '',
    }));
  }

  async getUserProfileByEmail(email) {
    if (!email) return null;

    if (!sheetsInitialized) {
      return this.usersDemoData.find(u => u.email === email) || null;
    }

    await this.initializeSheet();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET_NAME}!A2:G`,
    });

    const row = (res.data.values || []).find(r => r[0] === email);
    if (!row) return null;

    return {
      email: row[0],
      username: row[1],
      firstName: row[2],
      lastName: row[3],
      phase: Number(row[4]) || 0,
      role: row[5] || 'student',
      updatedAt: row[6],
    };
  }

  async upsertUserProfile(profile) {
    const payload = {
      email: profile.email,
      username: profile.username,
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phase: Number(profile.phase) || 0,
      role: profile.role || 'student',
      updatedAt: new Date().toISOString(),
    };

    if (!sheetsInitialized) {
      const idx = this.usersDemoData.findIndex(u => u.email === payload.email);
      if (idx >= 0) this.usersDemoData[idx] = payload;
      else this.usersDemoData.push(payload);
      return payload;
    }

    await this.initializeSheet();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USERS_SHEET_NAME}!A2:G`,
    });

    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === payload.email);

    if (rowIndex === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USERS_SHEET_NAME}!A:G`,
        valueInputOption: 'RAW',
        resource: { values: [[
          payload.email,
          payload.username,
          payload.firstName,
          payload.lastName,
          payload.phase,
          payload.role,
          payload.updatedAt,
        ]] },
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${USERS_SHEET_NAME}!A${rowIndex + 2}:G${rowIndex + 2}`,
        valueInputOption: 'RAW',
        resource: { values: [[
          payload.email,
          payload.username,
          payload.firstName,
          payload.lastName,
          payload.phase,
          payload.role,
          payload.updatedAt,
        ]] },
      });
    }

    return payload;
  }

  /* ---------- GOALS ---------- */
  async addGoal(goal) {
    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const newGoal = { id, ...goal };

    if (!sheetsInitialized) {
      this.demoData.push(newGoal);
      return newGoal;
    }

    await this.initializeSheet();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${GOALS_SHEET_NAME}!A:J`,
      valueInputOption: 'RAW',
      resource: { values: [this.goalToRow(newGoal)] },
    });

    return newGoal;
  }

  async getGoals(email, date = null, username = null) {
    if (!sheetsInitialized) {
      return this.demoData.filter(g =>
        (username ? g.username === username : g.email === email) &&
        (!date || g.date === date)
      );
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${GOALS_SHEET_NAME}!A2:J`,
    });

    return (res.data.values || [])
      .map(r => this.parseGoalRow(r))
      .filter(Boolean)
      .filter(g =>
        (username ? g.username === username : g.email === email) &&
        (!date || g.date === date)
      );
  }

  /* ---------- WEEKLY SUMMARY ---------- */
  async saveWeeklySummary(summary) {
    const completionRate = summary.total
      ? ((summary.completed / summary.total) * 100).toFixed(1)
      : '0.0';

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
      performanceStatus:
        completionRate >= 80 ? 'Excellent' :
        completionRate >= 60 ? 'Good' : 'Needs Improvement',
      aiFeedback: summary.aiFeedback || 'Improve consistency',
      finalRemarks: 'Auto generated',
      recordedAt: new Date().toISOString(),
    };

    if (!sheetsInitialized) {
      this.weeklyDemoData.push(record);
      return record;
    }

    await this.initializeSheet();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${WEEKLY_SHEET_NAME}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [[
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
      ]] },
    });

    return record;
  }
}

module.exports = new SheetsService();
