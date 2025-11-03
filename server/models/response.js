const db = require('../db/database');
const crypto = require('crypto');

class Response {
  // Submit a response
  static submit(sessionId, questionId, answer) {
    const responseId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();

    const stmt = db.prepare(`
      INSERT INTO responses (response_id, session_id, question_id, answer, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(responseId, sessionId, questionId, answer, timestamp);

    return responseId;
  }

  // Get all responses for a question
  static getByQuestion(questionId) {
    const stmt = db.prepare('SELECT * FROM responses WHERE question_id = ? ORDER BY timestamp');
    return stmt.all(questionId);
  }

  // Get all responses for a session
  static getBySession(sessionId) {
    const stmt = db.prepare('SELECT * FROM responses WHERE session_id = ? ORDER BY timestamp');
    return stmt.all(sessionId);
  }

  // Get response count for a question
  static getCountByQuestion(questionId) {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM responses WHERE question_id = ?');
    return stmt.get(questionId).count;
  }

  // Get aggregated results for a question
  static getResults(questionId) {
    const responses = this.getByQuestion(questionId);

    if (responses.length === 0) {
      return { total: 0, breakdown: {} };
    }

    // Count each unique answer
    const breakdown = {};
    responses.forEach(r => {
      const answer = r.answer;
      breakdown[answer] = (breakdown[answer] || 0) + 1;
    });

    return {
      total: responses.length,
      breakdown
    };
  }

  // Get all results for a session (all questions)
  static getSessionResults(sessionId) {
    const stmt = db.prepare(`
      SELECT q.question_id, q.question_index, q.question_text, q.question_type, q.options,
             r.answer
      FROM questions q
      LEFT JOIN responses r ON q.question_id = r.question_id
      WHERE q.session_id = ?
      ORDER BY q.question_index, r.timestamp
    `);

    const rows = stmt.all(sessionId);

    // Group by question
    const questionMap = {};

    rows.forEach(row => {
      if (!questionMap[row.question_id]) {
        questionMap[row.question_id] = {
          question_id: row.question_id,
          question_index: row.question_index,
          question_text: row.question_text,
          question_type: row.question_type,
          options: row.options ? JSON.parse(row.options) : null,
          responses: []
        };
      }

      if (row.answer !== null) {
        questionMap[row.question_id].responses.push(row.answer);
      }
    });

    // Convert to array and calculate breakdown
    return Object.values(questionMap).map(q => {
      const breakdown = {};
      q.responses.forEach(answer => {
        breakdown[answer] = (breakdown[answer] || 0) + 1;
      });

      return {
        question_id: q.question_id,
        question_index: q.question_index,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        total_responses: q.responses.length,
        breakdown
      };
    });
  }

  // Export results to CSV format
  static exportToCSV(sessionId) {
    const results = this.getSessionResults(sessionId);

    let csv = 'Question Index,Question Text,Answer,Count\n';

    results.forEach(result => {
      Object.entries(result.breakdown).forEach(([answer, count]) => {
        const questionText = result.question_text.replace(/"/g, '""');
        const answerText = answer.replace(/"/g, '""');
        csv += `${result.question_index},"${questionText}","${answerText}",${count}\n`;
      });
    });

    return csv;
  }

  // Export results to JSON format
  static exportToJSON(sessionId) {
    return this.getSessionResults(sessionId);
  }
}

module.exports = Response;
