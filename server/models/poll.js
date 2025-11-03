const db = require('../db/database');
const crypto = require('crypto');

class Poll {
  // Create a new poll session
  static create(adminPasswordHash, pollName = null, isRerun = false, originalPollId = null) {
    // Generate short 4-character ID (e.g., "abc4", "x9k2")
    const sessionId = crypto.randomBytes(2).toString('hex');
    const createdAt = Date.now();

    const stmt = db.prepare(`
      INSERT INTO poll_sessions (session_id, admin_password_hash, created_at, status, current_question_index, poll_name, is_rerun, original_poll_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(sessionId, adminPasswordHash, createdAt, 'pending', -1, pollName, isRerun ? 1 : 0, originalPollId);

    return sessionId;
  }

  // Get poll session by ID
  static getById(sessionId) {
    const stmt = db.prepare('SELECT * FROM poll_sessions WHERE session_id = ?');
    return stmt.get(sessionId);
  }

  // Get all poll sessions (for admin overview)
  static getAll() {
    const stmt = db.prepare('SELECT * FROM poll_sessions ORDER BY created_at DESC');
    return stmt.all();
  }

  // Update poll status
  static updateStatus(sessionId, status) {
    const stmt = db.prepare('UPDATE poll_sessions SET status = ? WHERE session_id = ?');
    return stmt.run(status, sessionId);
  }

  // Update current question index
  static updateCurrentQuestion(sessionId, questionIndex) {
    const stmt = db.prepare('UPDATE poll_sessions SET current_question_index = ? WHERE session_id = ?');
    return stmt.run(questionIndex, sessionId);
  }

  // Add question to poll
  static addQuestion(sessionId, questionIndex, questionData) {
    const stmt = db.prepare(`
      INSERT INTO questions (session_id, question_index, question_text, question_type, options, scale_min, scale_max)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const options = questionData.options ? JSON.stringify(questionData.options) : null;

    const result = stmt.run(
      sessionId,
      questionIndex,
      questionData.question_text,
      questionData.question_type,
      options,
      questionData.scale_min !== undefined ? questionData.scale_min : null,
      questionData.scale_max !== undefined ? questionData.scale_max : null
    );

    return result.lastInsertRowid;
  }

  // Get all questions for a poll
  static getQuestions(sessionId) {
    const stmt = db.prepare('SELECT * FROM questions WHERE session_id = ? ORDER BY question_index');
    const questions = stmt.all(sessionId);

    // Parse JSON options
    return questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null
    }));
  }

  // Get a specific question
  static getQuestion(questionId) {
    const stmt = db.prepare('SELECT * FROM questions WHERE question_id = ?');
    const question = stmt.get(questionId);

    if (question && question.options) {
      question.options = JSON.parse(question.options);
    }

    return question;
  }

  // Get question by session and index
  static getQuestionByIndex(sessionId, questionIndex) {
    const stmt = db.prepare('SELECT * FROM questions WHERE session_id = ? AND question_index = ?');
    const question = stmt.get(sessionId, questionIndex);

    if (question && question.options) {
      question.options = JSON.parse(question.options);
    }

    return question;
  }

  // Delete a poll session and all related data
  static delete(sessionId) {
    const stmt = db.prepare('DELETE FROM poll_sessions WHERE session_id = ?');
    return stmt.run(sessionId);
  }

  // Get poll with questions and response counts
  static getFullPoll(sessionId) {
    const poll = this.getById(sessionId);
    if (!poll) return null;

    const questions = this.getQuestions(sessionId);

    // Get response counts for each question
    const questionsWithCounts = questions.map(q => {
      const responseCount = db.prepare('SELECT COUNT(*) as count FROM responses WHERE question_id = ?')
        .get(q.question_id).count;

      return { ...q, response_count: responseCount };
    });

    return {
      ...poll,
      questions: questionsWithCounts
    };
  }
}

module.exports = Poll;
