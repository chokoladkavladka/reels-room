document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('error');
  errorEl.hidden = true;
  const body = {
    username: document.getElementById('username').value,
    display_name: document.getElementById('display_name').value,
    pin: document.getElementById('pin').value,
  };
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = data.error || 'Что-то пошло не так';
    errorEl.hidden = false;
    return;
  }
  window.location.href = '/dashboard.html';
});
