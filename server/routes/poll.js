const express = require('express');
const Poll = require('../models/poll');
const Response = require('../models/response');

const router = express.Router();

// Rate limiting map (simple in-memory rate limiting)
const rateLimitMap = new Map();

function checkRateLimit(identifier) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 10;

  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, []);
  }

  const requests = rateLimitMap.get(identifier);
  const recentRequests = requests.filter(time => now - time < windowMs);

  if (recentRequests.length >= maxRequests) {
    return false;
  }

  recentRequests.push(now);
  rateLimitMap.set(identifier, recentRequests);

  return true;
}

// Get poll session info (for participants)
router.get('/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const poll = Poll.getById(sessionId);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    // Don't send questions yet - participants should receive them via WebSocket
    res.json({
      session_id: poll.session_id,
      status: poll.status,
      current_question_index: poll.current_question_index
    });
  } catch (error) {
    console.error('Error getting poll info:', error);
    res.status(500).json({ error: 'Failed to get poll info' });
  }
});

// Submit response (with rate limiting)
router.post('/:sessionId/respond', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { question_id, answer } = req.body;

    // Rate limiting based on IP + session
    const identifier = `${req.ip}-${sessionId}`;
    if (!checkRateLimit(identifier)) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    if (!question_id || answer === undefined || answer === null) {
      return res.status(400).json({ error: 'question_id and answer are required' });
    }

    const poll = Poll.getById(sessionId);
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    if (poll.status !== 'active') {
      return res.status(400).json({ error: 'Poll is not active' });
    }

    const question = Poll.getQuestion(question_id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (question.session_id !== sessionId) {
      return res.status(400).json({ error: 'Question does not belong to this poll' });
    }

    // Check if question is currently active
    if (poll.current_question_index !== question.question_index) {
      return res.status(400).json({ error: 'This question is not currently active' });
    }

    // Validate answer based on question type
    if (question.question_type === 'multiple_choice') {
      const options = JSON.parse(question.options);
      if (!options.includes(answer)) {
        return res.status(400).json({ error: 'Invalid answer option' });
      }
    } else if (question.question_type === 'yes_no') {
      if (answer !== 'Yes' && answer !== 'No') {
        return res.status(400).json({ error: 'Answer must be Yes or No' });
      }
    } else if (question.question_type === 'rating') {
      const rating = parseInt(answer);
      if (isNaN(rating) || rating < question.scale_min || rating > question.scale_max) {
        return res.status(400).json({ error: `Rating must be between ${question.scale_min} and ${question.scale_max}` });
      }
    }

    // Submit response
    const responseId = Response.submit(sessionId, question_id, answer.toString());

    res.json({
      success: true,
      response_id: responseId
    });
  } catch (error) {
    console.error('Error submitting response:', error);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// Get results for a specific session (public endpoint)
router.get('/:sessionId/results', (req, res) => {
  try {
    const { sessionId } = req.params;
    const poll = Poll.getById(sessionId);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const results = Response.getSessionResults(sessionId);

    res.json({ results });
  } catch (error) {
    console.error('Error getting results:', error);
    res.status(500).json({ error: 'Failed to get results' });
  }
});

module.exports = router;
