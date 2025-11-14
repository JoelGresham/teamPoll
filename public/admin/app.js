// Admin App State
let socket = null;
let dashboardSocket = null; // Socket for dashboard notifications
let currentPoll = null;
let questionCount = 0;
let hasActivePoll = false;
let activePollId = null;
let revealedQuestions = new Set(); // Track which questions have been revealed
let draggedElement = null; // Track the element being dragged

// Screen Management
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

// Check for active poll
async function checkActivePoll() {
  try {
    const response = await fetch('/api/admin/active-poll');
    const data = await response.json();
    hasActivePoll = data.hasActivePoll;
    activePollId = data.hasActivePoll ? data.poll.session_id : null;

    return data;
  } catch (error) {
    console.error('Error checking active poll:', error);
  }
}

// Load Dashboard
async function loadDashboard() {
  try {
    await checkActivePoll();

    const response = await fetch('/api/admin/polls');

    const data = await response.json();
    displayPolls(data.polls);
  } catch (error) {
    console.error('Error loading polls:', error);
  }
}

// Display Polls List
function displayPolls(polls) {
  const pollsList = document.getElementById('polls-list');

  if (!polls || polls.length === 0) {
    pollsList.innerHTML = '<p class="no-responses">No polls yet. Create your first poll!</p>';
    return;
  }

  pollsList.innerHTML = polls.map(poll => {
    const date = new Date(poll.created_at).toLocaleDateString();
    const time = new Date(poll.created_at).toLocaleTimeString();

    // Determine display status based on admin control
    let displayStatus = poll.status;
    let statusBadge = 'badge-danger';

    if (poll.has_active_admin) {
      displayStatus = 'in progress';
      statusBadge = 'badge-success';
    } else if (poll.status === 'active' || poll.status === 'pending') {
      displayStatus = 'waiting';
      statusBadge = 'badge-warning';
    } else if (poll.status === 'completed') {
      displayStatus = 'completed';
      statusBadge = 'badge-danger';
    }

    // Display poll name if available, otherwise show session ID
    const pollTitle = poll.poll_name ? `${poll.poll_name} (${poll.session_id})` : poll.session_id;
    const rerunBadge = poll.is_rerun ? `<span class="badge badge-small" style="background: #17a2b8;">rerun of ${poll.original_poll_id || 'unknown'}</span>` : '';

    // Disable Open and Delete buttons if poll has active admin (someone is controlling it)
    const disableControls = poll.has_active_admin;

    return `
      <div class="poll-item">
        <div class="poll-item-info">
          <strong>${pollTitle}</strong>
          <small>Created: ${date} ${time}</small>
          <small>${rerunBadge} <span class="badge badge-small ${statusBadge}">${displayStatus}</span></small>
        </div>
        <div class="poll-item-actions">
          ${poll.status !== 'completed' ?
            `${poll.current_question_index === -1 && !disableControls ?
              `<button class="btn btn-secondary btn-small" onclick="editPoll('${poll.session_id}')">Edit</button>` : ''}
             <button class="btn btn-primary btn-small" onclick="openPoll('${poll.session_id}')" ${disableControls ? 'disabled' : ''}>Open</button>` :
            poll.is_rerun && poll.original_poll_id ?
              `<button class="btn btn-secondary btn-small" onclick="viewResults('${poll.session_id}')">View Results</button>
               <button class="btn btn-primary btn-small" onclick="compareResults('${poll.session_id}', '${poll.original_poll_id}')">Compare Results</button>` :
              `<button class="btn btn-secondary btn-small" onclick="viewResults('${poll.session_id}')">View Results</button>
               <button class="btn btn-primary btn-small" onclick="rerunPoll('${poll.session_id}')">Rerun</button>`
          }
          <button class="btn btn-danger btn-small" onclick="deletePoll('${poll.session_id}')" ${disableControls ? 'disabled' : ''}>Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

// Create New Poll
document.getElementById('create-poll-btn').addEventListener('click', () => {
  editingPollId = null;
  questionCount = 0;
  document.getElementById('questions-container').innerHTML = '';
  document.getElementById('poll-name-input').value = '';
  document.getElementById('save-poll-btn').textContent = 'Create Poll';
  addQuestion(); // Start with one question
  showScreen('create-poll-screen');
});

document.getElementById('back-to-dashboard-btn').addEventListener('click', () => {
  editingPollId = null;
  document.getElementById('save-poll-btn').textContent = 'Create Poll';
  showScreen('dashboard-screen');
  loadDashboard();
});

document.getElementById('back-to-dashboard-btn-2').addEventListener('click', () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentPoll = null;
  showScreen('dashboard-screen');
  loadDashboard();
});

// Add Question
document.getElementById('add-question-btn').addEventListener('click', addQuestion);

function addQuestion() {
  questionCount++;
  const container = document.getElementById('questions-container');

  const questionDiv = document.createElement('div');
  questionDiv.className = 'question-item';
  questionDiv.dataset.index = questionCount;

  questionDiv.innerHTML = `
    <div class="question-header">
      <div class="question-title-section">
        <button class="drag-handle" title="Drag to reorder">⠿</button>
        <h4>Question ${questionCount}</h4>
      </div>
      <button class="btn btn-danger btn-small" onclick="removeQuestion(${questionCount})">Remove</button>
    </div>
    <div class="question-fields">
      <textarea placeholder="Enter question text..." required></textarea>
      <select class="question-type-select" onchange="handleQuestionTypeChange(${questionCount})">
        <option value="rating" selected>Rating Scale</option>
        <option value="multiple_choice">Multiple Choice</option>
        <option value="yes_no">Yes/No</option>
        <option value="text">Short Text</option>
      </select>
      <div class="question-options">
        <div class="scale-inputs">
          <input type="number" placeholder="Min (e.g., 0)" class="scale-min" value="0" />
          <input type="number" placeholder="Max (e.g., 10)" class="scale-max" value="10" />
        </div>
      </div>
    </div>
  `;

  // Make the question item draggable
  questionDiv.draggable = true;
  questionDiv.addEventListener('dragstart', handleDragStart);
  questionDiv.addEventListener('dragend', handleDragEnd);
  questionDiv.addEventListener('dragover', handleDragOver);
  questionDiv.addEventListener('drop', handleDrop);

  container.appendChild(questionDiv);
}

function removeQuestion(index) {
  const questionDiv = document.querySelector(`.question-item[data-index="${index}"]`);
  if (questionDiv) {
    questionDiv.remove();
  }
}

function handleQuestionTypeChange(index) {
  const questionDiv = document.querySelector(`.question-item[data-index="${index}"]`);
  const select = questionDiv.querySelector('.question-type-select');
  const optionsContainer = questionDiv.querySelector('.question-options');

  const type = select.value;

  if (type === 'multiple_choice') {
    optionsContainer.innerHTML = `
      <div class="options-container">
        <div class="option-input-group">
          <input type="text" placeholder="Option 1" class="option-input" />
          <button class="btn btn-small btn-secondary" onclick="addOption(${index})">+</button>
        </div>
        <div class="option-input-group">
          <input type="text" placeholder="Option 2" class="option-input" />
        </div>
      </div>
    `;
  } else if (type === 'yes_no') {
    optionsContainer.innerHTML = '<p style="color: #6c757d; font-size: 14px;">Options: Yes / No</p>';
  } else if (type === 'rating') {
    optionsContainer.innerHTML = `
      <div class="scale-inputs">
        <input type="number" placeholder="Min (e.g., 0)" class="scale-min" value="0" />
        <input type="number" placeholder="Max (e.g., 10)" class="scale-max" value="10" />
      </div>
    `;
  } else if (type === 'text') {
    optionsContainer.innerHTML = '<p style="color: #6c757d; font-size: 14px;">Participants can enter free text</p>';
  }
}

function addOption(index) {
  const questionDiv = document.querySelector(`.question-item[data-index="${index}"]`);
  const optionsContainer = questionDiv.querySelector('.options-container');

  const optionCount = optionsContainer.querySelectorAll('.option-input-group').length + 1;

  const optionGroup = document.createElement('div');
  optionGroup.className = 'option-input-group';
  optionGroup.innerHTML = `<input type="text" placeholder="Option ${optionCount}" class="option-input" />`;

  optionsContainer.appendChild(optionGroup);
}

// Add option in edit mode
window.addEditOption = function(index) {
  const questionDiv = document.querySelector(`.question-item[data-index="${index}"]`);
  const optionsContainer = questionDiv.querySelector('.options-container');

  const optionCount = optionsContainer.querySelectorAll('.option-input-group').length + 1;

  const optionGroup = document.createElement('div');
  optionGroup.className = 'option-input-group';

  // Add - button to new options
  optionGroup.innerHTML = `
    <input type="text" placeholder="Option ${optionCount}" class="option-input" />
    <button class="btn btn-small btn-danger" onclick="removeEditOption(${index}, this)">-</button>
  `;

  optionsContainer.appendChild(optionGroup);

  // Update buttons on all options to ensure proper state
  updateEditOptionButtons(index);
}

// Remove option in edit mode
window.removeEditOption = function(index, button) {
  const questionDiv = document.querySelector(`.question-item[data-index="${index}"]`);
  const optionsContainer = questionDiv.querySelector('.options-container');
  const optionGroups = optionsContainer.querySelectorAll('.option-input-group');

  // Don't allow removal if only 2 options left
  if (optionGroups.length <= 2) {
    alert('Must have at least 2 options');
    return;
  }

  // Remove the option group
  button.parentElement.remove();

  // Update buttons on remaining options
  updateEditOptionButtons(index);
}

// Update buttons for edit mode options
function updateEditOptionButtons(index) {
  const questionDiv = document.querySelector(`.question-item[data-index="${index}"]`);
  const optionsContainer = questionDiv.querySelector('.options-container');
  const optionGroups = optionsContainer.querySelectorAll('.option-input-group');

  optionGroups.forEach((group, idx) => {
    const input = group.querySelector('.option-input');
    const inputValue = input.value;
    const inputPlaceholder = input.placeholder;

    // Clear existing buttons
    const existingButtons = group.querySelectorAll('button');
    existingButtons.forEach(btn => btn.remove());

    // Re-add buttons based on position and count
    let buttons = '';
    if (idx === 0) {
      buttons += `<button class="btn btn-small btn-secondary" onclick="addEditOption(${index})">+</button>`;
    }
    if (optionGroups.length > 2) {
      buttons += `<button class="btn btn-small btn-danger" onclick="removeEditOption(${index}, this)">-</button>`;
    }

    // Rebuild the group HTML
    group.innerHTML = `
      <input type="text" placeholder="${inputPlaceholder}" class="option-input" value="${inputValue}" />
      ${buttons}
    `;
  });
}

// Drag and Drop Handlers for Question Reordering
function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');

  // Remove all drag-over effects
  document.querySelectorAll('.question-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }

  e.dataTransfer.dropEffect = 'move';

  const afterElement = getDragAfterElement(document.getElementById('questions-container'), e.clientY);
  const draggable = document.querySelector('.dragging');
  const container = document.getElementById('questions-container');

  if (afterElement == null) {
    container.appendChild(draggable);
  } else {
    container.insertBefore(draggable, afterElement);
  }

  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  return false;
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.question-item:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Save Poll
document.getElementById('save-poll-btn').addEventListener('click', async () => {
  const questions = [];
  const questionDivs = document.querySelectorAll('.question-item');

  if (questionDivs.length === 0) {
    alert('Please add at least one question');
    return;
  }

  for (const div of questionDivs) {
    const questionText = div.querySelector('textarea').value.trim();
    const questionType = div.querySelector('.question-type-select').value;

    if (!questionText) {
      alert('Please fill in all question texts');
      return;
    }

    const question = {
      question_text: questionText,
      question_type: questionType
    };

    if (questionType === 'multiple_choice') {
      const options = Array.from(div.querySelectorAll('.option-input'))
        .map(input => input.value.trim())
        .filter(val => val);

      if (options.length < 2) {
        alert('Multiple choice questions must have at least 2 options');
        return;
      }

      question.options = options;
    } else if (questionType === 'yes_no') {
      question.options = ['Yes', 'No'];
    } else if (questionType === 'rating') {
      const scaleMin = parseInt(div.querySelector('.scale-min').value);
      const scaleMax = parseInt(div.querySelector('.scale-max').value);

      if (isNaN(scaleMin) || isNaN(scaleMax) || scaleMin >= scaleMax) {
        alert('Please provide valid scale min and max values');
        return;
      }

      question.scale_min = scaleMin;
      question.scale_max = scaleMax;
    }

    questions.push(question);
  }

  // Get poll name
  const pollName = document.getElementById('poll-name-input').value.trim();

  try {
    // Check if we're editing or creating
    if (editingPollId) {
      // Update existing poll
      const response = await fetch(`/api/admin/polls/${editingPollId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          questions,
          poll_name: pollName || null
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('Poll updated successfully!');
        editingPollId = null;
        document.getElementById('save-poll-btn').textContent = 'Create Poll';
        showScreen('dashboard-screen');
        loadDashboard();
      } else {
        alert('Failed to update poll: ' + (data.error || 'Unknown error'));
      }
    } else {
      // Create new poll
      const response = await fetch('/api/admin/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          questions,
          poll_name: pollName || null
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('Poll created successfully!');
        showScreen('dashboard-screen');
        loadDashboard();
      } else {
        alert('Failed to create poll: ' + (data.error || 'Unknown error'));
      }
    }
  } catch (error) {
    console.error('Error saving poll:', error);
    alert('Failed to save poll');
  }
});

// Open Poll Control
async function openPoll(sessionId) {
  try {
    // Load poll data
    const response = await fetch(`/api/admin/polls/${sessionId}`);

    const data = await response.json();
    currentPoll = data.poll;

    // Reset revealed questions tracking
    revealedQuestions.clear();

    // Mark questions as revealed based on current_question_index
    for (let i = 0; i <= currentPoll.current_question_index; i++) {
      revealedQuestions.add(i);
    }

    // Also mark questions as revealed if they have responses
    currentPoll.questions.forEach((question, index) => {
      if (question.response_count && question.response_count > 0) {
        revealedQuestions.add(index);
      }
    });

    // Setup WebSocket
    setupWebSocket(sessionId);

    // Display poll control
    document.getElementById('session-id-display').textContent = sessionId;
    const participantUrl = `${window.location.origin}/poll/${sessionId}`;
    document.getElementById('participant-url').value = participantUrl;

    // Generate QR code
    fetch(`/api/admin/qrcode?url=${encodeURIComponent(participantUrl)}`)
      .then(response => response.blob())
      .then(blob => {
        const img = document.getElementById('qr-code-image');
        img.src = URL.createObjectURL(blob);
      })
      .catch(error => {
        console.error('QR Code generation error:', error);
      });

    // Display poll name if available
    if (currentPoll.poll_name) {
      document.getElementById('poll-name-display').textContent = currentPoll.poll_name;
      document.getElementById('poll-name-row').style.display = 'flex';
    } else {
      document.getElementById('poll-name-row').style.display = 'none';
    }

    displayQuestionControls();

    showScreen('control-poll-screen');

    // Start poll if it's pending
    if (currentPoll.status === 'pending') {
      await startPoll(sessionId);
    }
  } catch (error) {
    console.error('Error opening poll:', error);
    alert('Failed to open poll');
  }
}

// Setup WebSocket
function setupWebSocket(sessionId) {
  if (socket) {
    socket.disconnect();
  }

  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('admin_join', { session_id: sessionId });
  });

  socket.on('admin_joined', (data) => {
    console.log('Admin joined session:', data.session_id);
  });

  socket.on('participant_count', (data) => {
    const plural = data.count === 1 ? 'participant' : 'participants';
    document.getElementById('participant-count').textContent = `${data.count} ${plural}`;
  });

  socket.on('response_received', (data) => {
    updateQuestionResults(data.question_id, data.results);
  });

  socket.on('poll_ended', (data) => {
    console.log('Poll ended:', data.session_id);
    alert('Poll has been ended');
    // Disconnect and return to dashboard
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    currentPoll = null;
    showScreen('dashboard-screen');
    loadDashboard();
  });

  socket.on('error', (data) => {
    console.error('Socket error:', data.message);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
}

// Display Question Controls
function displayQuestionControls() {
  const container = document.getElementById('questions-control');

  // Save current results HTML before rebuilding
  const savedResults = {};
  currentPoll.questions.forEach(q => {
    const resultsEl = document.getElementById(`results-${q.question_id}`);
    if (resultsEl && resultsEl.innerHTML !== '<p class="no-responses">No responses yet</p>') {
      savedResults[q.question_id] = resultsEl.innerHTML;
    }
  });

  container.innerHTML = '';

  currentPoll.questions.forEach((question, index) => {
    const isActive = currentPoll.current_question_index === index;
    const hasBeenRevealed = revealedQuestions.has(index);

    console.log(`Question ${index + 1}: isActive=${isActive}, hasBeenRevealed=${hasBeenRevealed}, current_question_index=${currentPoll.current_question_index}`);

    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-control' + (isActive ? ' active' : '');
    questionDiv.dataset.questionId = question.question_id;

    const actionButton = isActive ?
      `<button class="btn btn-secondary btn-small" onclick="closeQuestion()">Close Question</button>` :
      (hasBeenRevealed ?
        `<button class="btn btn-success btn-small" onclick="revealQuestion(${index})">Re-reveal</button>` :
        `<button class="btn btn-success btn-small" onclick="revealQuestion(${index})">Reveal Question</button>`);

    questionDiv.innerHTML = `
      <div class="question-control-header">
        <h4>Question ${index + 1}</h4>
        ${actionButton}
      </div>
      ${hasBeenRevealed ? `<div class="question-text">${question.question_text}</div>` : ''}
      <div class="results-display" id="results-${question.question_id}" ${!hasBeenRevealed ? 'style="display: none;"' : ''}>
        <p class="no-responses">No responses yet</p>
      </div>
    `;

    container.appendChild(questionDiv);

    // Restore saved results or load fresh
    if (savedResults[question.question_id]) {
      document.getElementById(`results-${question.question_id}`).innerHTML = savedResults[question.question_id];
    } else if (hasBeenRevealed) {
      loadQuestionResults(question.question_id);
    }
  });
}

// Start Poll
async function startPoll(sessionId) {
  try {
    await fetch(`/api/admin/polls/${sessionId}/start`, {
      method: 'POST'
    });

    socket.emit('start_poll', { session_id: sessionId });
    currentPoll.status = 'active';
  } catch (error) {
    console.error('Error starting poll:', error);
  }
}

// Reveal Question
function revealQuestion(index) {
  if (!currentPoll) return;

  const question = currentPoll.questions[index];
  socket.emit('reveal_question', {
    session_id: currentPoll.session_id,
    question_index: index
  });

  currentPoll.current_question_index = index;
  revealedQuestions.add(index); // Mark as revealed
  displayQuestionControls();
}

// Close Question
function closeQuestion() {
  if (!currentPoll) return;

  console.log('Closing question, current_question_index before:', currentPoll.current_question_index);
  socket.emit('close_question', { session_id: currentPoll.session_id });
  // Set current question to -1 to indicate no active question
  currentPoll.current_question_index = -1;
  console.log('Closing question, current_question_index after:', currentPoll.current_question_index);
  displayQuestionControls();
}

// Load Question Results
async function loadQuestionResults(questionId) {
  socket.emit('request_results', {
    session_id: currentPoll.session_id,
    question_id: questionId
  });

  socket.once('results_update', (data) => {
    if (data.question_id === questionId) {
      updateQuestionResults(questionId, data.results);
    }
  });
}

// Update Question Results
function updateQuestionResults(questionId, results) {
  const resultsDiv = document.getElementById(`results-${questionId}`);
  if (!resultsDiv) return;

  if (results.total === 0) {
    resultsDiv.innerHTML = '<p class="no-responses">No responses yet</p>';
    return;
  }

  // Find the question to check its type
  const question = currentPoll.questions.find(q => q.question_id === questionId);
  const isRating = question && question.question_type === 'rating';
  const isText = question && question.question_type === 'text';

  if (isText) {
    // Display text responses as styled tags (cloud-like visualization)
    const textResponsesHtml = Object.entries(results.breakdown)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([response, count]) => {
        const fontSize = Math.max(14, Math.min(32, 14 + (count * 2))); // Size based on frequency
        const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return `
          <div class="text-response-item" style="
            display: inline-block;
            margin: 8px;
            padding: 8px 16px;
            background: ${color}15;
            border: 2px solid ${color};
            border-radius: 20px;
            font-size: ${fontSize}px;
            font-weight: ${count > 1 ? 'bold' : 'normal'};
            color: ${color};
          ">
            ${response}${count > 1 ? ` <span style="opacity: 0.7;">(${count})</span>` : ''}
          </div>
        `;
      }).join('');

    resultsDiv.innerHTML = `
      <div style="background: white; padding: 20px; border-radius: 8px; line-height: 2;">
        ${textResponsesHtml}
      </div>
      <div class="histogram-info" style="margin-top: 10px;">${results.total} responses</div>
    `;
  } else if (isRating) {
    // Calculate average for rating questions
    let sum = 0;
    let count = 0;
    Object.entries(results.breakdown).forEach(([answer, answerCount]) => {
      sum += parseInt(answer) * answerCount;
      count += answerCount;
    });
    const average = count > 0 ? (sum / count).toFixed(2) : 0;

    // Create histogram for rating questions
    const scaleMin = parseInt(question.scale_min);
    const scaleMax = parseInt(question.scale_max);

    // Build array with count for each value in the scale
    const histogramData = [];
    for (let i = scaleMin; i <= scaleMax; i++) {
      histogramData.push({
        value: i,
        count: results.breakdown[i.toString()] || 0
      });
    }

    const maxCount = Math.max(...histogramData.map(d => d.count), 1);

    // Calculate average position percentage for the line
    const averagePosition = ((parseFloat(average) - scaleMin) / (scaleMax - scaleMin)) * 100;

    const histogramHtml = `
      <div class="histogram-container">
        <div class="histogram-bars">
          ${histogramData.map(data => {
            const heightPercent = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
            return `
              <div class="histogram-column">
                <div class="histogram-bar-area">
                  <div class="histogram-bar" style="height: ${heightPercent}%">
                    <span class="histogram-count">${data.count > 0 ? data.count : ''}</span>
                  </div>
                </div>
                <div class="histogram-label">${data.value}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="average-line" style="left: ${averagePosition}%">
          <div class="average-label">Avg: ${average}</div>
        </div>
      </div>
      <div class="histogram-info">${results.total} responses</div>
    `;

    resultsDiv.innerHTML = histogramHtml;
  } else {
    // Non-rating questions - use regular bar chart
    const maxCount = Math.max(...Object.values(results.breakdown));

    const resultsHtml = Object.entries(results.breakdown)
      .map(([answer, count]) => {
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const responsePercentage = Math.round((count / results.total) * 100);

        return `
          <div class="result-item">
            <div class="result-label">${answer}</div>
            <div class="result-bar-container">
              <div class="result-bar" style="width: ${percentage}%">
                ${count}
              </div>
            </div>
            <div class="result-count">${count} (${responsePercentage}%)</div>
          </div>
        `;
      }).join('');

    resultsDiv.innerHTML = resultsHtml;
  }
}

// End Poll
document.getElementById('end-poll-btn').addEventListener('click', async () => {
  if (!currentPoll) return;

  if (!confirm('Are you sure you want to end this poll? This cannot be undone.')) {
    return;
  }

  try {
    await fetch(`/api/admin/polls/${currentPoll.session_id}/end`, {
      method: 'POST'
    });

    socket.emit('end_poll', { session_id: currentPoll.session_id });

    alert('Poll ended successfully');
    showScreen('dashboard-screen');
    loadDashboard();
  } catch (error) {
    console.error('Error ending poll:', error);
    alert('Failed to end poll');
  }
});

// Copy URL
document.getElementById('copy-url-btn').addEventListener('click', () => {
  const urlInput = document.getElementById('participant-url');
  urlInput.select();
  document.execCommand('copy');

  const btn = document.getElementById('copy-url-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => {
    btn.textContent = originalText;
  }, 2000);
});

// Delete Poll
async function deletePoll(sessionId) {
  if (!confirm('Are you sure you want to delete this poll? This cannot be undone.')) {
    return;
  }

  try {
    await fetch(`/api/admin/polls/${sessionId}`, {
      method: 'DELETE'
    });

    loadDashboard();
  } catch (error) {
    console.error('Error deleting poll:', error);
    alert('Failed to delete poll');
  }
}

// View Results
function viewResults(sessionId) {
  window.location.href = `/results/${sessionId}`;
}

// Compare Results
function compareResults(rerunSessionId, originalSessionId) {
  window.location.href = `/compare/${rerunSessionId}/${originalSessionId}`;
}

// Rerun Poll
async function rerunPoll(sessionId) {
  if (!confirm('This will create a new poll with the same questions. Continue?')) {
    return;
  }

  try {
    // Get the original poll
    const response = await fetch(`/api/admin/polls/${sessionId}`);
    const data = await response.json();
    const originalPoll = data.poll;

    // Extract questions (without responses)
    const questions = originalPoll.questions.map(q => ({
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options,
      scale_min: q.scale_min,
      scale_max: q.scale_max
    }));

    // Create new poll with same questions, marking it as a rerun
    const createResponse = await fetch('/api/admin/polls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        questions,
        poll_name: originalPoll.poll_name,
        is_rerun: true,
        original_poll_id: sessionId
      })
    });

    const createData = await createResponse.json();

    if (createData.success) {
      currentPoll = createData.poll;
      openPoll(createData.session_id);
    } else {
      alert('Failed to rerun poll: ' + (createData.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error rerunning poll:', error);
    alert('Failed to rerun poll');
  }
}

// Edit Poll
let editingPollId = null;

window.editPoll = async function(sessionId) {
  try {
    // Load poll data
    const response = await fetch(`/api/admin/polls/${sessionId}`);
    const data = await response.json();

    if (!data.poll) {
      alert('Poll not found');
      return;
    }

    const poll = data.poll;

    // Set editing mode
    editingPollId = sessionId;

    // Clear existing questions
    questionCount = 0;
    document.getElementById('questions-container').innerHTML = '';

    // Set poll name
    document.getElementById('poll-name-input').value = poll.poll_name || '';

    // Load each question
    poll.questions.forEach(question => {
      addQuestion();
      const questionDiv = document.querySelector(`.question-item[data-index="${questionCount}"]`);

      // Set question text
      questionDiv.querySelector('textarea').value = question.question_text;

      // Set question type
      questionDiv.querySelector('.question-type-select').value = question.question_type;
      handleQuestionTypeChange(questionCount);

      // Set type-specific data
      if (question.question_type === 'multiple_choice' && question.options) {
        const optionsContainer = questionDiv.querySelector('.options-container');
        optionsContainer.innerHTML = '';
        const optionsArray = Array.isArray(question.options) ? question.options : JSON.parse(question.options);
        optionsArray.forEach((option, idx) => {
          const optionGroup = document.createElement('div');
          optionGroup.className = 'option-input-group';

          // Add + button to first option, - button to all options if more than 2
          let buttons = '';
          if (idx === 0) {
            buttons = `<button class="btn btn-small btn-secondary" onclick="addEditOption(${questionCount})">+</button>`;
          }
          if (optionsArray.length > 2) {
            buttons += `<button class="btn btn-small btn-danger" onclick="removeEditOption(${questionCount}, this)">-</button>`;
          }

          optionGroup.innerHTML = `
            <input type="text" placeholder="Option ${idx + 1}" class="option-input" value="${option}" />
            ${buttons}
          `;
          optionsContainer.appendChild(optionGroup);
        });
      } else if (question.question_type === 'rating') {
        questionDiv.querySelector('.scale-min').value = question.scale_min || 0;
        questionDiv.querySelector('.scale-max').value = question.scale_max || 10;
      }
    });

    // Update button text
    document.getElementById('save-poll-btn').textContent = 'Update Poll';

    // Show create poll screen
    showScreen('create-poll-screen');
  } catch (error) {
    console.error('Error loading poll for edit:', error);
    alert('Failed to load poll');
  }
}

// Initialize
// Setup dashboard socket for status updates
function setupDashboardSocket() {
  if (!dashboardSocket) {
    dashboardSocket = io();

    dashboardSocket.on('admin_status_changed', (data) => {
      console.log('Admin status changed for session:', data.session_id);
      // Reload the dashboard to show updated status
      loadDashboard();
    });

    dashboardSocket.on('connect', () => {
      console.log('Dashboard socket connected');
    });

    dashboardSocket.on('disconnect', () => {
      console.log('Dashboard socket disconnected');
    });
  }
}

// Export Templates
document.getElementById('export-templates-btn').addEventListener('click', async () => {
  try {
    // Get available polls
    const response = await fetch('/api/admin/templates/available');
    const data = await response.json();

    if (!data.polls || data.polls.length === 0) {
      alert('No polls available for export. Only unfinished, non-rerun polls can be exported.');
      return;
    }

    // Show selection dialog
    const checkboxes = data.polls.map(poll => {
      const pollName = poll.poll_name || poll.session_id;
      return `
        <label style="display: block; padding: 10px; cursor: pointer;">
          <input type="checkbox" value="${poll.session_id}" checked style="margin-right: 10px;">
          <strong>${pollName}</strong> (${poll.question_count} questions)
        </label>
      `;
    }).join('');

    const dialog = document.createElement('div');
    dialog.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';
    dialog.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; max-width: 500px; max-height: 80vh; overflow-y: auto;">
        <h2 style="margin-top: 0;">Select Polls to Export</h2>
        <div id="poll-checkboxes">${checkboxes}</div>
        <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancel-export" class="btn btn-secondary">Cancel</button>
          <button id="confirm-export" class="btn btn-primary">Export Selected</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    document.getElementById('cancel-export').onclick = () => dialog.remove();
    document.getElementById('confirm-export').onclick = async () => {
      const selected = Array.from(dialog.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

      if (selected.length === 0) {
        alert('Please select at least one poll');
        return;
      }

      try {
        const exportResponse = await fetch('/api/admin/templates/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_ids: selected })
        });

        const exportData = await exportResponse.json();

        if (exportData.success) {
          alert(`Exported ${exportData.exported} poll template(s) to templates/poll-templates.json`);
          dialog.remove();
        } else {
          alert('Failed to export: ' + (exportData.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error exporting:', error);
        alert('Failed to export templates');
      }
    };
  } catch (error) {
    console.error('Error loading available polls:', error);
    alert('Failed to load available polls');
  }
});

// Import Templates
document.getElementById('import-templates-btn').addEventListener('click', async () => {
  if (!confirm('This will import polls from templates/poll-templates.json. Continue?')) {
    return;
  }

  try {
    const response = await fetch('/api/admin/templates/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.success) {
      alert(`Imported ${data.imported} poll template(s) from templates/poll-templates.json`);
      loadDashboard();
    } else {
      alert('Failed to import templates: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error importing templates:', error);
    alert('Failed to import templates');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  showScreen('dashboard-screen');

  // Setup dashboard socket for real-time updates
  setupDashboardSocket();

  // Check for active poll every 5 seconds
  setInterval(checkActivePoll, 5000);
});
