function currentUser() { return JSON.parse(sessionStorage.getItem('assessly-user') || 'null'); }
function apiToken() { return sessionStorage.getItem('assessly-token'); }
async function api(path, options = {}) { let response; try { response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(apiToken() ? { Authorization: `Bearer ${apiToken()}` } : {}), ...(options.headers || {}) } }); } catch { throw new Error('Open this app at http://localhost:3000, not by opening the HTML file directly.'); } const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Something went wrong'); return body; }
function setUser(user, token) { sessionStorage.setItem('assessly-user', JSON.stringify(user)); sessionStorage.setItem('assessly-token', token); }
function redirectFor(role) { window.location.replace(role === 'teacher' ? 'teacher.html' : 'student.html'); }
function formatDate(value) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function showToast(message) { const toast = document.getElementById('toast'); if (!toast) return; toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2800); }
function escapeHtml(text) { return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function showAuthLoading(message) { const loading = document.getElementById('auth-loading'); if (!loading) return; document.getElementById('auth-loading-text').textContent = message; loading.hidden = false; }
function hideAuthLoading() { const loading = document.getElementById('auth-loading'); if (loading) loading.hidden = true; }
function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

function initLogin() {
  let selectedRole = null;
  const roleChoice = document.getElementById('role-choice');
  const loginView = document.getElementById('login-view');
  const showLogin = role => {
    selectedRole = role;
    roleChoice.hidden = true;
    loginView.hidden = false;
    document.getElementById('selected-role-label').textContent = role === 'teacher' ? 'Faculty' : 'Student';
    document.getElementById('login-description').textContent = role === 'teacher' ? 'Sign in to manage your question papers.' : 'Sign in to continue your learning journey.';
    document.getElementById('student-signup').hidden = role !== 'student';
    document.getElementById('username').focus();
  };
  document.querySelectorAll('.role-card').forEach(card => card.addEventListener('click', () => showLogin(card.dataset.role)));
  document.getElementById('back-to-roles').addEventListener('click', () => { loginView.hidden = true; roleChoice.hidden = false; });

  const bindPasswordToggle = (button, input) => {
    button.addEventListener('click', event => {
      input.type = input.type === 'password' ? 'text' : 'password';
      event.target.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
  };

  bindPasswordToggle(document.querySelector('.password-toggle'), document.getElementById('password'));

  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    showAuthLoading('Signing you in...');
    try { const result = await Promise.all([api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: document.getElementById('username').value.trim(), password: document.getElementById('password').value, role: selectedRole }) }), wait(1200)]).then(([loginResult]) => loginResult); setUser(result.user, result.token); redirectFor(selectedRole); } catch (error) { hideAuthLoading(); document.getElementById('login-error').textContent = error.message; }
  });

}

function initSignup() {
  document.getElementById('signup-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const error = document.getElementById('signup-error');
    error.textContent = '';
    showAuthLoading('Creating your account...');
    try {
      await Promise.all([api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: form.get('name').trim(), username: form.get('username').trim(), password: form.get('password') }) }), wait(1200)]);
      hideAuthLoading();
      event.target.reset();
      document.getElementById('signup-success').hidden = false;
      document.getElementById('continue-to-login').focus();
    } catch (signupError) { hideAuthLoading(); error.textContent = signupError.message; }
  });
  document.getElementById('continue-to-login').addEventListener('click', () => { window.location.replace('index.html'); });
  bindSignupPasswordToggle();
}

function bindSignupPasswordToggle() {
  const button = document.querySelector('.signup-password-toggle');
  const input = document.getElementById('signup-password');
  button.addEventListener('click', event => {
    input.type = input.type === 'password' ? 'text' : 'password';
    event.target.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
}

function requireRole(role) { const user = currentUser(); if (!user || user.role !== role) { window.location.replace('index.html'); return null; } return user; }
function initCommon(user) { document.querySelectorAll('[data-user-name]').forEach(item => item.textContent = user.name); document.querySelectorAll('[data-user-initials]').forEach(item => item.textContent = user.name.split(' ').map(name => name[0]).join('').slice(0, 2)); document.querySelectorAll('.logout').forEach(button => button.addEventListener('click', () => { sessionStorage.removeItem('assessly-user'); sessionStorage.removeItem('assessly-token'); window.location.replace('index.html'); })); }

async function initTeacher() {
  const user = requireRole('teacher'); if (!user) return; initCommon(user);
  const exams = document.getElementById('exam-list'); const renderExams = examsData => { exams.innerHTML = examsData.map(exam => `<div class="exam-row"><span class="exam-bar ${exam.id % 2 ? '' : 'green'}"></span><div class="exam-info"><strong>${escapeHtml(exam.title)}</strong><span>${formatDate(exam.date)} · ${exam.time} · ${exam.duration} min · ${exam.questions.length} questions</span></div><div class="exam-status ${new Date(exam.date) > new Date() ? 'upcoming' : ''}">${new Date(exam.date) > new Date() ? 'Scheduled' : 'Live now'}</div></div>`).join(''); };
  const questionEditor = document.getElementById('question-list-editor'); let questionNumber = 0;
  const addQuestion = () => { questionNumber += 1; const card = document.createElement('div'); card.className = 'question-editor-card'; card.dataset.questionNumber = questionNumber; card.innerHTML = `<div class="question-editor-title"><strong>Question ${questionNumber}</strong><button class="remove-question" type="button">Remove</button></div><label>Question<textarea class="question-text" rows="2" placeholder="Write the question" required></textarea></label><div class="option-grid"><label>Option A<input class="question-option" required></label><label>Option B<input class="question-option" required></label><label>Option C<input class="question-option" required></label><label>Option D<input class="question-option" required></label></div><label>Correct answer<select class="question-answer"><option value="0">Option A</option><option value="1">Option B</option><option value="2">Option C</option><option value="3">Option D</option></select></label>`; card.querySelector('.remove-question').addEventListener('click', () => { if (questionEditor.children.length > 1) { card.remove(); [...questionEditor.children].forEach((item, index) => { item.querySelector('.question-editor-title strong').textContent = `Question ${index + 1}`; }); } else showToast('An exam needs at least one question'); }); questionEditor.appendChild(card); };
  addQuestion(); document.getElementById('add-question').addEventListener('click', addQuestion);
  try { renderExams(await api('/api/exams')); } catch (error) { showToast(error.message); }
  const loadScores = async () => { const list = document.getElementById('score-list'); try { const scores = await api('/api/teacher/scores'); list.innerHTML = scores.length ? scores.map(score => `<article class="score-row"><div><span class="tag">${escapeHtml(score.subject)}</span><h4>${escapeHtml(score.title)}</h4><p>${escapeHtml(score.studentName)}${score.username ? ` · ${escapeHtml(score.username)}` : ''} · ${new Date(score.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div><strong>${score.score}/${score.total}</strong></article>`).join('') : '<div class="empty-state">Student scores will appear after an exam is submitted.</div>'; } catch (error) { list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; } };
  await loadScores();
  document.getElementById('schedule-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.target); const questions = [...questionEditor.children].map(card => ({ text: card.querySelector('.question-text').value.trim(), options: [...card.querySelectorAll('.question-option')].map(input => input.value.trim()), answer: Number(card.querySelector('.question-answer').value) })); try { await api('/api/exams', { method: 'POST', body: JSON.stringify({ title: form.get('title'), subject: form.get('subject'), date: form.get('date'), time: form.get('time'), duration: Number(form.get('duration')), questions }) }); renderExams(await api('/api/exams')); event.target.reset(); questionEditor.innerHTML = ''; questionNumber = 0; addQuestion(); showToast('Question paper scheduled successfully'); } catch (error) { showToast(error.message); } });
  document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click', () => { document.getElementById('settings-modal').hidden = false; })); document.getElementById('close-settings').addEventListener('click', () => { document.getElementById('settings-modal').hidden = true; });
  document.getElementById('change-password-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.target); if (form.get('newPassword') !== form.get('confirmPassword')) { showToast('New passwords do not match'); return; } try { const result = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }) }); sessionStorage.setItem('assessly-token', result.token); event.target.reset(); document.getElementById('settings-modal').hidden = true; showToast('Your password was changed successfully'); } catch (error) { showToast(error.message); } });
  document.getElementById('today-label').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

async function initStudent() {
  const user = requireRole('student'); if (!user) return; initCommon(user); let availableExams = [];
  const render = async () => { const list = document.getElementById('available-exams'); try { availableExams = await api('/api/exams'); document.getElementById('exam-count').textContent = `${availableExams.length} assigned`; if (!availableExams.length) { list.innerHTML = '<div class="empty-state">No question papers have been scheduled yet.</div>'; return; } list.innerHTML = availableExams.map(exam => `<div class="student-exam"><div><span class="tag">${escapeHtml(exam.subject)}</span><h3>${escapeHtml(exam.title)}</h3><p>${formatDate(exam.date)} at ${exam.time} · ${exam.duration} minutes · ${exam.questions.length} questions</p></div><button class="start-button" data-exam-id="${exam.id}">Start exam</button></div>`).join(''); list.querySelectorAll('.start-button').forEach(button => button.addEventListener('click', () => openExam(button.dataset.examId))); } catch (error) { showToast(error.message); } }; await render();
  const loadHistory = async () => { const history = document.getElementById('submission-history'); try { const submissions = await api('/api/submissions'); document.getElementById('previous-count').textContent = `${submissions.length} completed`; history.innerHTML = submissions.length ? submissions.map(submission => `<article class="submission-item"><div><span class="tag">${escapeHtml(submission.subject)}</span><h4>${escapeHtml(submission.title)}</h4><p>${new Date(submission.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${submission.automatic ? ' · Time expired' : ''}</p></div><strong>${submission.score}/${submission.total}</strong></article>`).join('') : '<div class="empty-state">Completed exams will appear here.</div>'; } catch (error) { history.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; } };
  await loadHistory();
  document.getElementById('close-result').addEventListener('click', () => { document.getElementById('result-modal').hidden = true; });
  async function openExam(id) { const exam = availableExams.find(item => item.id === id); if (!exam) return; const modal = document.getElementById('exam-modal'); modal.hidden = false; document.getElementById('modal-title').textContent = exam.title; document.getElementById('question-list').innerHTML = exam.questions.map((question, index) => `<div class="question-block"><h3>${index + 1}. ${escapeHtml(question.text)}</h3>${question.options.map((option, optionIndex) => `<label class="option"><input type="radio" name="q${index}" value="${optionIndex}"> <span>${escapeHtml(option)}</span></label>`).join('')}</div>`).join(''); let seconds = exam.duration * 60; const timer = document.getElementById('timer'); const displayTime = () => { timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }; displayTime(); const interval = setInterval(() => { seconds -= 1; displayTime(); if (seconds <= 0) { clearInterval(interval); submitExam(exam, true); } }, 1000); const close = () => { clearInterval(interval); modal.hidden = true; }; document.getElementById('close-modal').onclick = close; document.getElementById('submit-exam').onclick = () => { clearInterval(interval); submitExam(exam, false); }; async function submitExam(activeExam, automatic) { const answers = activeExam.questions.map((_, index) => { const choice = document.querySelector(`input[name="q${index}"]:checked`); return choice ? Number(choice.value) : -1; }); try { const result = await api('/api/submissions', { method: 'POST', body: JSON.stringify({ examId: activeExam.id, answers, automatic }) }); modal.hidden = true; document.getElementById('result-score').textContent = `${result.score}/${result.total}`; document.getElementById('result-percent').textContent = `${Math.round((result.score / result.total) * 100)}%`; document.getElementById('result-message').textContent = automatic ? 'Time expired. Your result has been saved to Previous exams.' : 'Your result has been saved to Previous exams.'; document.getElementById('result-modal').hidden = false; await loadHistory(); } catch (error) { showToast(error.message); } } }
}

if (document.body.classList.contains('signup-page')) initSignup();
else if (document.body.classList.contains('auth-page')) initLogin();
if (document.body.dataset.page === 'teacher') initTeacher();
if (document.body.dataset.page === 'student') initStudent();
