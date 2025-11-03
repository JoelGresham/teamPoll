// Results App State
let socket = null;
let sessionId = null;

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

  document.getElementById('session-id-badge').textContent = sessionId;

  connectToSocket();
  loadResults();
}

// Connect to WebSocket for real-time updates
function connectToSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('join_session', { session_id: sessionId });
  });

  socket.on('response_received', (data) => {
    console.log('New response received, updating results');
    loadResults();
  });

  socket.on('question_revealed', () => {
    console.log('New question revealed');
  });

  socket.on('poll_ended', () => {
    console.log('Poll ended');
    loadResults();
  });

  socket.on('error', (data) => {
    console.error('Socket error:', data.message);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
}

// Load Results
async function loadResults() {
  try {
    // Load poll info to get the name
    const pollResponse = await fetch(`/api/admin/polls/${sessionId}`);
    if (pollResponse.ok) {
      const pollData = await pollResponse.json();
      if (pollData.poll && pollData.poll.poll_name) {
        document.getElementById('poll-name-display').textContent = pollData.poll.poll_name;
      } else {
        document.getElementById('poll-name-display').textContent = 'Poll Results';
      }
    }

    const response = await fetch(`/api/poll/${sessionId}/results`);

    if (!response.ok) {
      throw new Error('Failed to load results');
    }

    const data = await response.json();
    displayResults(data.results);
    showScreen('results-screen');
  } catch (error) {
    console.error('Error loading results:', error);
    showError('Failed to load results. Please try again.');
  }
}

// Display Results
function displayResults(results) {
  const container = document.getElementById('results-container');
  container.innerHTML = '';

  if (!results || results.length === 0) {
    container.innerHTML = '<div class="card"><p class="no-responses">No results available yet.</p></div>';
    return;
  }

  results.forEach((result, index) => {
    const card = document.createElement('div');
    card.className = 'result-card';

    const totalResponses = result.total_responses || 0;
    const responseText = totalResponses === 1 ? 'response' : 'responses';

    card.innerHTML = `
      <h3>Question ${result.question_index + 1}</h3>
      <div class="question-text">${escapeHtml(result.question_text)}</div>
      <div class="response-info">${totalResponses} ${responseText}</div>
    `;

    if (totalResponses === 0) {
      card.innerHTML += '<p class="no-responses">No responses yet</p>';
    } else if (result.question_type === 'text') {
      // Display text responses
      const textResponsesDiv = document.createElement('div');
      textResponsesDiv.className = 'text-responses';

      const responses = Object.keys(result.breakdown);
      responses.forEach(response => {
        const count = result.breakdown[response];
        for (let i = 0; i < count; i++) {
          const item = document.createElement('div');
          item.className = 'text-response-item';
          item.textContent = response;
          textResponsesDiv.appendChild(item);
        }
      });

      card.appendChild(textResponsesDiv);
    } else if (result.question_type === 'rating') {
      // Display as histogram for rating questions
      const resultsDiv = document.createElement('div');

      // Always use 0-10 scale for consistency
      const scaleMin = 0;
      const scaleMax = 10;

      // Build histogram data
      const histogramData = [];
      for (let i = scaleMin; i <= scaleMax; i++) {
        histogramData.push({
          value: i,
          count: result.breakdown[i] || 0
        });
      }

      const maxCount = Math.max(...histogramData.map(d => d.count), 1);

      // Calculate average
      let sum = 0;
      let count = 0;
      Object.entries(result.breakdown).forEach(([value, cnt]) => {
        sum += parseFloat(value) * cnt;
        count += cnt;
      });
      const average = count > 0 ? (sum / count).toFixed(1) : 0;

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
        <div class="histogram-info">${totalResponses} responses</div>
      `;

      resultsDiv.innerHTML = histogramHtml;
      card.appendChild(resultsDiv);
    } else {
      // Display as bar chart for other question types
      const resultsDiv = document.createElement('div');

      // Sort by count (descending)
      const sortedEntries = Object.entries(result.breakdown)
        .sort((a, b) => b[1] - a[1]);

      const maxCount = Math.max(...Object.values(result.breakdown));

      sortedEntries.forEach(([answer, count]) => {
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const responsePercentage = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0;

        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';

        resultItem.innerHTML = `
          <div class="result-label">${escapeHtml(answer)}</div>
          <div class="result-bar-container">
            <div class="result-bar" style="width: ${percentage}%">
              ${count}
            </div>
          </div>
          <div class="result-count">${count} (${responsePercentage}%)</div>
        `;

        resultsDiv.appendChild(resultItem);
      });

      card.appendChild(resultsDiv);
    }

    container.appendChild(card);
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show Error
function showError(message) {
  document.getElementById('error-message').textContent = message;
  showScreen('error-screen');
}

// Back to Dashboard Button
document.getElementById('back-to-dashboard-btn').addEventListener('click', () => {
  window.location.href = '/admin';
});

// Initialize on load
window.addEventListener('DOMContentLoaded', init);

// Auto-refresh every 30 seconds
setInterval(() => {
  if (document.getElementById('results-screen').classList.contains('active')) {
    loadResults();
  }
}, 30000);
