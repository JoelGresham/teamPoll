const express = require('express');
const bcrypt = require('bcrypt');
const Poll = require('../models/poll');
const Response = require('../models/response');
const { hasActiveAdmin, getActivePolls } = require('../socket/handlers');

const router = express.Router();

// Check if there's an active poll
function hasActivePoll() {
  const polls = Poll.getAll();
  return polls.some(poll => poll.status === 'active' || poll.status === 'pending');
}

// Get the active poll if one exists
function getActivePoll() {
  const polls = Poll.getAll();
  return polls.find(poll => poll.status === 'active' || poll.status === 'pending');
}

// Check active poll status
router.get('/active-poll', (req, res) => {
  const activePoll = getActivePoll();
  if (activePoll) {
    res.json({ hasActivePoll: true, poll: activePoll });
  } else {
    res.json({ hasActivePoll: false });
  }
});

// Create new poll session
router.post('/polls', async (req, res) => {
  try {
    const { questions, poll_name, is_rerun, original_poll_id } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Questions array is required' });
    }

    // Validate questions
    for (const q of questions) {
      if (!q.question_text || !q.question_type) {
        return res.status(400).json({ error: 'Each question must have question_text and question_type' });
      }

      if (!['multiple_choice', 'yes_no', 'rating', 'text'].includes(q.question_type)) {
        return res.status(400).json({ error: 'Invalid question_type' });
      }

      if (q.question_type === 'multiple_choice' && (!q.options || q.options.length < 2)) {
        return res.status(400).json({ error: 'Multiple choice questions must have at least 2 options' });
      }

      if (q.question_type === 'rating' && (q.scale_min === undefined || q.scale_max === undefined)) {
        return res.status(400).json({ error: 'Rating questions must have scale_min and scale_max' });
      }
    }

    // Create poll session
    const sessionId = Poll.create('', poll_name, is_rerun, original_poll_id);

    // Add questions
    questions.forEach((q, index) => {
      Poll.addQuestion(sessionId, index, q);
    });

    const poll = Poll.getFullPoll(sessionId);

    res.json({
      success: true,
      session_id: sessionId,
      poll
    });
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

// Get all polls
router.get('/polls', (req, res) => {
  try {
    const polls = Poll.getAll();
    // Add active admin status to each poll
    const pollsWithStatus = polls.map(poll => ({
      ...poll,
      has_active_admin: hasActiveAdmin(poll.session_id)
    }));
    res.json({ polls: pollsWithStatus });
  } catch (error) {
    console.error('Error getting polls:', error);
    res.status(500).json({ error: 'Failed to get polls' });
  }
});

// Get specific poll
router.get('/polls/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const poll = Poll.getFullPoll(sessionId);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    res.json({ poll });
  } catch (error) {
    console.error('Error getting poll:', error);
    res.status(500).json({ error: 'Failed to get poll' });
  }
});

// Start poll
router.post('/polls/:sessionId/start', (req, res) => {
  try {
    const { sessionId } = req.params;
    const poll = Poll.getById(sessionId);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    Poll.updateStatus(sessionId, 'active');

    res.json({ success: true });
  } catch (error) {
    console.error('Error starting poll:', error);
    res.status(500).json({ error: 'Failed to start poll' });
  }
});

// End poll
router.post('/polls/:sessionId/end', (req, res) => {
  try {
    const { sessionId } = req.params;
    const poll = Poll.getById(sessionId);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    Poll.updateStatus(sessionId, 'completed');

    res.json({ success: true });
  } catch (error) {
    console.error('Error ending poll:', error);
    res.status(500).json({ error: 'Failed to end poll' });
  }
});

// Get results for a poll
router.get('/polls/:sessionId/results', (req, res) => {
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

// Export results as CSV
router.get('/polls/:sessionId/export/csv', (req, res) => {
  try {
    const { sessionId } = req.params;
    const poll = Poll.getById(sessionId);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const csv = Response.exportToCSV(sessionId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="poll-${sessionId}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Export results as JSON
router.get('/polls/:sessionId/export/json', (req, res) => {
  try {
    const { sessionId } = req.params;
    const poll = Poll.getById(sessionId);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const results = Response.exportToJSON(sessionId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="poll-${sessionId}.json"`);
    res.json(results);
  } catch (error) {
    console.error('Error exporting JSON:', error);
    res.status(500).json({ error: 'Failed to export JSON' });
  }
});

// Delete poll
router.delete('/polls/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    Poll.delete(sessionId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting poll:', error);
    res.status(500).json({ error: 'Failed to delete poll' });
  }
});

module.exports = router;
