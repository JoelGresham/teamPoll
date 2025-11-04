const Poll = require('../models/poll');
const Response = require('../models/response');

// Store active connections by session
const sessionConnections = new Map();
// Store active admin connections by session (session_id -> socket.id)
const activeAdmins = new Map();

function initSocketHandlers(io) {
  io.on('connection', (socket) => {
    let currentSession = null;
    let isAdmin = false;
    let answeredQuestions = new Set(); // Track which questions this socket has answered
    let connectionLogged = false; // Track if we've logged the connection type

    // Admin joins session
    socket.on('admin_join', ({ session_id }) => {
      const poll = Poll.getById(session_id);
      if (!poll) {
        socket.emit('error', { message: 'Poll not found' });
        return;
      }

      currentSession = session_id;
      isAdmin = true;

      socket.join(`admin-${session_id}`);

      // Track this admin as controlling the poll
      activeAdmins.set(session_id, socket.id);

      // Notify all admins in dashboard that this poll is now in progress
      io.emit('admin_status_changed', { session_id });

      socket.emit('admin_joined', { session_id });

      // Send current participant count
      const participantCount = getParticipantCount(session_id);
      socket.emit('participant_count', { count: participantCount });

      if (!connectionLogged) {
        console.log('Admin connected:', socket.id);
        connectionLogged = true;
      }
      console.log(`Admin joined session: ${session_id}`);
    });

    // Participant joins session
    socket.on('join_session', ({ session_id }) => {
      const poll = Poll.getById(session_id);
      if (!poll) {
        socket.emit('error', { message: 'Poll not found' });
        return;
      }

      currentSession = session_id;
      socket.join(`session-${session_id}`);

      // Track participant
      if (!sessionConnections.has(session_id)) {
        sessionConnections.set(session_id, new Set());
      }
      sessionConnections.get(session_id).add(socket.id);

      // Notify participant of current state
      socket.emit('session_joined', {
        session_id,
        status: poll.status,
        current_question_index: poll.current_question_index
      });

      // If poll is active and there's a current question, send it
      if (poll.status === 'active' && poll.current_question_index >= 0) {
        const question = Poll.getQuestionByIndex(session_id, poll.current_question_index);
        if (question) {
          socket.emit('question_revealed', { question });
        }
      }

      // Notify admin of new participant
      const participantCount = sessionConnections.get(session_id).size;
      io.to(`admin-${session_id}`).emit('participant_count', { count: participantCount });

      if (!connectionLogged) {
        console.log('Participant connected:', socket.id);
        connectionLogged = true;
      }
      console.log(`Participant joined session: ${session_id}, total: ${participantCount}`);
    });

    // Admin starts poll
    socket.on('start_poll', ({ session_id }) => {
      if (!isAdmin) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      Poll.updateStatus(session_id, 'active');

      // Notify all participants
      io.to(`session-${session_id}`).emit('poll_started', { session_id });
      io.to(`admin-${session_id}`).emit('poll_started', { session_id });

      console.log(`Poll started: ${session_id}`);
    });

    // Admin reveals question
    socket.on('reveal_question', ({ session_id, question_index }) => {
      if (!isAdmin) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      const question = Poll.getQuestionByIndex(session_id, question_index);
      if (!question) {
        socket.emit('error', { message: 'Question not found' });
        return;
      }

      // Update current question index
      Poll.updateCurrentQuestion(session_id, question_index);

      // Send question to all participants
      io.to(`session-${session_id}`).emit('question_revealed', { question });
      io.to(`admin-${session_id}`).emit('question_revealed', { question });

      console.log(`Question ${question_index + 1} (ID: ${question.question_id}) revealed in session: ${session_id}`);
    });

    // Admin closes question
    socket.on('close_question', ({ session_id }) => {
      if (!isAdmin) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      const poll = Poll.getById(session_id);
      const currentQuestionNumber = poll && poll.current_question_index >= 0 ? poll.current_question_index + 1 : 'unknown';

      // Set current_question_index to -1 so participants who refresh will go to waiting screen
      Poll.updateCurrentQuestion(session_id, -1);

      io.to(`session-${session_id}`).emit('question_closed');
      io.to(`admin-${session_id}`).emit('question_closed');

      console.log(`Question ${currentQuestionNumber} closed in session: ${session_id}`);
    });

    // Participant submits response
    socket.on('submit_response', ({ session_id, question_id, answer }) => {
      try {
        const poll = Poll.getById(session_id);
        if (!poll || poll.status !== 'active') {
          socket.emit('error', { message: 'Poll is not active' });
          return;
        }

        const question = Poll.getQuestion(question_id);
        if (!question) {
          socket.emit('error', { message: 'Question not found' });
          return;
        }

        if (question.session_id !== session_id) {
          socket.emit('error', { message: 'Question does not belong to this poll' });
          return;
        }

        // Allow responses to any question that has been revealed (current or past)
        if (question.question_index > poll.current_question_index) {
          socket.emit('error', { message: 'This question has not been revealed yet' });
          return;
        }

        // Check if this socket has already answered this question
        const questionKey = `${session_id}-${question_id}`;
        const isUpdate = answeredQuestions.has(questionKey);

        if (isUpdate) {
          console.log(`Socket ${socket.id} updating answer for question ${question.question_index + 1}`);
        }

        // Submit response (allows updating)
        const responseId = Response.submit(session_id, question_id, answer.toString());

        // Mark this question as answered for this socket
        answeredQuestions.add(questionKey);

        // Confirm to participant
        console.log(`Sending response_submitted confirmation to socket ${socket.id}`);
        socket.emit('response_submitted', { response_id: responseId });

        // Get updated results
        const results = Response.getResults(question_id);

        // Send updated results to admin
        io.to(`admin-${session_id}`).emit('response_received', {
          question_id,
          results
        });

        console.log(`Response submitted for Question ${question.question_index + 1} (ID: ${question_id}) in session: ${session_id}`);
      } catch (error) {
        console.error('Error submitting response:', error);
        socket.emit('error', { message: 'Failed to submit response' });
      }
    });

    // Admin ends poll
    socket.on('end_poll', ({ session_id }) => {
      if (!isAdmin) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      Poll.updateStatus(session_id, 'completed');

      // Remove admin tracking since poll is now completed
      if (activeAdmins.get(session_id) === socket.id) {
        activeAdmins.delete(session_id);
      }

      // Notify everyone
      io.to(`session-${session_id}`).emit('poll_ended', { session_id });
      io.to(`admin-${session_id}`).emit('poll_ended', { session_id });

      // Notify all admins in dashboard that this poll is now completed
      io.emit('admin_status_changed', { session_id });

      console.log(`Poll ended: ${session_id}`);
    });

    // Request current results (for admin or results page)
    socket.on('request_results', ({ session_id, question_id }) => {
      try {
        if (question_id) {
          const results = Response.getResults(question_id);
          socket.emit('results_update', { question_id, results });
        } else {
          const results = Response.getSessionResults(session_id);
          socket.emit('session_results', { results });
        }
      } catch (error) {
        console.error('Error getting results:', error);
        socket.emit('error', { message: 'Failed to get results' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (isAdmin) {
        console.log('Admin disconnected:', socket.id);
      } else if (connectionLogged) {
        console.log('Participant disconnected:', socket.id);
      }

      if (currentSession) {
        if (isAdmin) {
          // Remove admin tracking if this was the admin for this session
          if (activeAdmins.get(currentSession) === socket.id) {
            activeAdmins.delete(currentSession);
            console.log(`Admin released control of session: ${currentSession}`);

            // Notify all admins in dashboard to refresh
            io.emit('admin_status_changed', { session_id: currentSession });
          }
        } else {
          // Remove from participant tracking
          if (sessionConnections.has(currentSession)) {
            sessionConnections.get(currentSession).delete(socket.id);

            // Update participant count
            const participantCount = sessionConnections.get(currentSession).size;
            io.to(`admin-${currentSession}`).emit('participant_count', { count: participantCount });

            // Clean up empty session
            if (participantCount === 0) {
              sessionConnections.delete(currentSession);
            }
          }
        }
      }
    });
  });
}

function getParticipantCount(sessionId) {
  return sessionConnections.has(sessionId) ? sessionConnections.get(sessionId).size : 0;
}

function hasActiveAdmin(sessionId) {
  return activeAdmins.has(sessionId);
}

function getActivePolls() {
  return Array.from(activeAdmins.keys());
}

module.exports = initSocketHandlers;
module.exports.hasActiveAdmin = hasActiveAdmin;
module.exports.getActivePolls = getActivePolls;
