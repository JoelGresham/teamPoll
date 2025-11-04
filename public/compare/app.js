// Comparison App State
let rerunSessionId = null;
let originalSessionId = null;

// Get session IDs from URL
const pathParts = window.location.pathname.split('/');
rerunSessionId = pathParts[pathParts.length - 2];
originalSessionId = pathParts[pathParts.length - 1];

// Screen Management
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

// Initialize
function init() {
  if (!rerunSessionId || !originalSessionId) {
    showError('Invalid comparison URL');
    return;
  }

  document.getElementById('rerun-session-badge').textContent = rerunSessionId;
  document.getElementById('original-session-badge').textContent = originalSessionId;

  loadComparison();
}

// Load Comparison
async function loadComparison() {
  try {
    // Load both polls
    const [rerunResponse, originalResponse] = await Promise.all([
      fetch(`/api/admin/polls/${rerunSessionId}`),
      fetch(`/api/admin/polls/${originalSessionId}`)
    ]);

    if (!rerunResponse.ok || !originalResponse.ok) {
      throw new Error('Failed to load poll data');
    }

    const rerunData = await rerunResponse.json();
    const originalData = await originalResponse.json();

    // Load results for both polls
    const [rerunResultsResponse, originalResultsResponse] = await Promise.all([
      fetch(`/api/poll/${rerunSessionId}/results`),
      fetch(`/api/poll/${originalSessionId}/results`)
    ]);

    if (!rerunResultsResponse.ok || !originalResultsResponse.ok) {
      throw new Error('Failed to load results');
    }

    const rerunResults = await rerunResultsResponse.json();
    const originalResults = await originalResultsResponse.json();

    // Display poll name
    if (rerunData.poll && rerunData.poll.poll_name) {
      document.getElementById('poll-name-display').textContent = `Compare: ${rerunData.poll.poll_name}`;
    }

    displayComparison(originalResults.results, rerunResults.results);
    showScreen('comparison-screen');
  } catch (error) {
    console.error('Error loading comparison:', error);
    showError('Failed to load comparison. Please try again.');
  }
}

// Display Comparison
function displayComparison(originalResults, rerunResults) {
  const container = document.getElementById('comparison-container');
  container.innerHTML = '';

  if (!originalResults || originalResults.length === 0) {
    container.innerHTML = '<div class="card"><p class="no-responses">No results available.</p></div>';
    return;
  }

  originalResults.forEach((originalResult, index) => {
    const rerunResult = rerunResults[index];
    if (!rerunResult) return;

    const card = document.createElement('div');
    card.className = 'result-card';

    card.innerHTML = `
      <h3>Question ${originalResult.question_index + 1}</h3>
      <div class="question-text">${escapeHtml(originalResult.question_text)}</div>
      <div class="comparison-card">
        <div class="comparison-side original">
          <h4>Original (${originalResult.total_responses || 0} responses)</h4>
          <div id="original-${index}"></div>
        </div>
        <div class="comparison-side rerun">
          <h4>Rerun (${rerunResult.total_responses || 0} responses)</h4>
          <div id="rerun-${index}"></div>
        </div>
      </div>
    `;

    container.appendChild(card);

    // Render results for each side
    renderResult(originalResult, `original-${index}`);
    renderResult(rerunResult, `rerun-${index}`);
  });
}

// Render individual result (histogram or bar chart)
function renderResult(result, containerId) {
  const container = document.getElementById(containerId);

  if (!result || (result.total_responses || 0) === 0) {
    container.innerHTML = '<p class="no-responses">No responses</p>';
    return;
  }

  if (result.question_type === 'rating') {
    container.innerHTML = renderHistogram(result);
  } else if (result.question_type === 'text') {
    container.innerHTML = renderTextResponses(result);
  } else {
    container.innerHTML = renderBarChart(result);
  }
}

// Render histogram for rating questions
function renderHistogram(result) {
  const scaleMin = 0;
  const scaleMax = 10;

  const histogramData = [];
  for (let i = scaleMin; i <= scaleMax; i++) {
    histogramData.push({
      value: i,
      count: result.breakdown[i] || 0
    });
  }

  const maxCount = Math.max(...histogramData.map(d => d.count), 1);

  let sum = 0;
  let count = 0;
  Object.entries(result.breakdown).forEach(([value, cnt]) => {
    sum += parseFloat(value) * cnt;
    count += cnt;
  });
  const average = count > 0 ? (sum / count).toFixed(1) : 0;
  const averagePosition = ((parseFloat(average) - scaleMin) / (scaleMax - scaleMin)) * 100;

  return `
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
  `;
}

// Render bar chart for multiple choice/yes-no
function renderBarChart(result) {
  const sortedEntries = Object.entries(result.breakdown).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...Object.values(result.breakdown));
  const totalResponses = result.total_responses || 0;

  return sortedEntries.map(([answer, count]) => {
    const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
    const responsePercentage = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0;

    return `
      <div class="result-item">
        <div class="result-label">${escapeHtml(answer)}</div>
        <div class="result-bar-container">
          <div class="result-bar" style="width: ${percentage}%">${count}</div>
        </div>
        <div class="result-count">${count} (${responsePercentage}%)</div>
      </div>
    `;
  }).join('');
}

// Render text responses as styled tags
function renderTextResponses(result) {
  const sortedResponses = Object.entries(result.breakdown).sort((a, b) => b[1] - a[1]);

  const tagsHtml = sortedResponses.map(([response, count]) => {
    const fontSize = Math.max(12, Math.min(24, 12 + (count * 2)));
    const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    return `
      <div style="
        display: inline-block;
        margin: 6px;
        padding: 6px 12px;
        background: ${color}15;
        border: 2px solid ${color};
        border-radius: 16px;
        font-size: ${fontSize}px;
        font-weight: ${count > 1 ? 'bold' : 'normal'};
        color: ${color};
      ">
        ${escapeHtml(response)}${count > 1 ? ` <span style="opacity: 0.7;">(${count})</span>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; line-height: 1.8; min-height: 100px;">
      ${tagsHtml}
    </div>
  `;
}

// Escape HTML
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
