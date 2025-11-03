// Poll App State
let socket = null;
let sessionId = null;
let currentQuestion = null;
let selectedAnswer = null;

// Get session ID from URL
const pathParts = window.location.pathname.split('/');
sessionId = pathParts[pathParts.length - 1];

// Screen Management
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

// Initialize
function init() {
  if (!sessionId) {
    showError('Invalid poll URL');
    return;
  }

  connectToSocket();
}

// Connect to WebSocket
function connectToSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('join_session', { session_id: sessionId });
  });

  socket.on('session_joined', (data) => {
    console.log('Joined session:', data.session_id, 'Status:', data.status, 'Current question:', data.current_question_index);

    if (data.status === 'completed') {
      console.log('Poll is completed, showing ended screen');
      showScreen('ended-screen');
    } else if (data.status === 'active' && data.current_question_index >= 0) {
      // Poll is already active, waiting for question
      console.log('Poll is active, showing waiting screen');
      showScreen('waiting-screen');
    } else {
      console.log('Poll is pending, showing waiting screen');
      showScreen('waiting-screen');
    }
  });

  socket.on('poll_started', () => {
    console.log('Poll started');
    showScreen('waiting-screen');
  });

  socket.on('question_revealed', (data) => {
    console.log('Question revealed:', data.question);
    console.log('Switching to question screen');

    // Check if this is a different question than the current one
    const isDifferentQuestion = !currentQuestion || currentQuestion.question_id !== data.question.question_id;

    currentQuestion = data.question;

    // Reset selectedAnswer if it's a different question
    if (isDifferentQuestion) {
      selectedAnswer = null;
    }
    // If same question, keep selectedAnswer so it stays highlighted

    displayQuestion(data.question);
    showScreen('question-screen');
  });

  socket.on('question_closed', () => {
    console.log('Question closed');
    currentQuestion = null;
    selectedAnswer = null;
    showScreen('waiting-screen');
  });

  socket.on('response_submitted', (data) => {
    console.log('Response submitted successfully, response_id:', data?.response_id);
    showScreen('submitted-screen');
    currentQuestion = null;
    selectedAnswer = null;
  });

  socket.on('poll_ended', () => {
    console.log('Poll ended');
    showScreen('ended-screen');
  });

  socket.on('error', (data) => {
    console.error('Socket error:', data.message);
    alert('Error: ' + data.message); // Show alert so it's visible
    showErrorMessage(data.message);

    // Reset submit button if it's spinning
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit Answer';
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showError('Connection lost. Please refresh the page.');
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showError('Failed to connect to poll. Please try again.');
  });
}

// Display Question
function displayQuestion(question) {
  document.getElementById('question-text').textContent = question.question_text;
  const optionsContainer = document.getElementById('answer-options');
  const submitBtn = document.getElementById('submit-btn');
  const errorMessage = document.getElementById('error-message');

  errorMessage.textContent = '';
  submitBtn.disabled = true;
  optionsContainer.innerHTML = '';

  // Change button text if they're updating an answer
  if (selectedAnswer) {
    submitBtn.textContent = 'Update Answer';
  } else {
    submitBtn.textContent = 'Submit Answer';
  }

  if (question.question_type === 'multiple_choice' || question.question_type === 'yes_no') {
    // Display as buttons
    question.options.forEach(option => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = option;
      btn.onclick = () => selectOption(option, btn);

      // If this was previously selected, highlight it
      if (selectedAnswer && selectedAnswer === option) {
        btn.classList.add('selected');
        document.getElementById('submit-btn').disabled = false;
      }

      optionsContainer.appendChild(btn);
    });
  } else if (question.question_type === 'rating') {
    // Display rating scale
    const ratingContainer = document.createElement('div');
    ratingContainer.className = 'rating-options';

    const scaleMin = parseInt(question.scale_min);
    const scaleMax = parseInt(question.scale_max);

    console.log('Rating scale:', { scaleMin, scaleMax, question });

    // Check if we have valid scale values
    if (isNaN(scaleMin) || isNaN(scaleMax)) {
      console.error('Invalid scale values:', question.scale_min, question.scale_max);
      optionsContainer.innerHTML = '<p class="error-message">Error: Invalid rating scale configuration</p>';
      return;
    }

    for (let i = scaleMin; i <= scaleMax; i++) {
      const btn = document.createElement('button');
      btn.className = 'rating-btn';
      btn.textContent = i;
      btn.onclick = () => selectOption(i.toString(), btn);

      // If this was previously selected, highlight it
      if (selectedAnswer && selectedAnswer === i.toString()) {
        btn.classList.add('selected');
        document.getElementById('submit-btn').disabled = false;
      }

      ratingContainer.appendChild(btn);
    }

    optionsContainer.appendChild(ratingContainer);

    // Add labels
    const labels = document.createElement('div');
    labels.className = 'rating-labels';
    labels.innerHTML = `
      <span>Low</span>
      <span>High</span>
    `;
    optionsContainer.appendChild(labels);
  } else if (question.question_type === 'text') {
    // Display text input
    const textarea = document.createElement('textarea');
    textarea.className = 'text-input';
    textarea.placeholder = 'Enter your answer...';

    // Restore previous answer if available
    if (selectedAnswer) {
      textarea.value = selectedAnswer;
      submitBtn.disabled = false;
    }

    textarea.oninput = (e) => {
      selectedAnswer = e.target.value.trim();
      submitBtn.disabled = !selectedAnswer;
    };
    optionsContainer.appendChild(textarea);
  }
}

// Select Option
function selectOption(answer, btnElement) {
  selectedAnswer = answer;

  // Remove selected class from all buttons
  const allBtns = document.querySelectorAll('.option-btn, .rating-btn');
  allBtns.forEach(btn => btn.classList.remove('selected'));

  // Add selected class to clicked button
  btnElement.classList.add('selected');

  // Enable submit button
  document.getElementById('submit-btn').disabled = false;
}

// Submit Answer
document.getElementById('submit-btn').addEventListener('click', () => {
  if (!selectedAnswer || !currentQuestion) {
    showErrorMessage('Please select an answer');
    return;
  }

  console.log('Submitting response:', {
    session_id: sessionId,
    question_id: currentQuestion.question_id,
    answer: selectedAnswer
  });

  // Disable button to prevent double submission
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner-large"></span>';

  // Submit via WebSocket
  socket.emit('submit_response', {
    session_id: sessionId,
    question_id: currentQuestion.question_id,
    answer: selectedAnswer
  });
});

// Show Error Message (in question screen)
function showErrorMessage(message) {
  document.getElementById('error-message').textContent = message;
}

// Show Error Screen
function showError(message) {
  document.getElementById('error-screen-message').textContent = message;
  showScreen('error-screen');
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);
