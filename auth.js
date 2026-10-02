// auth.js — CricketStats Pro | Login & Signup
const API = 'http://localhost:5001';

function showAuthError(msg) {
    const el = document.getElementById('flash-message');
    if (!el) return;
    el.className = 'flash flash-error';
    el.textContent = msg;
    el.style.display = 'block';
}

function showAuthSuccess(msg) {
    const el = document.getElementById('flash-message');
    if (!el) return;
    el.className = 'flash flash-success';
    el.textContent = msg;
    el.style.display = 'block';
}

function storeSession(user) {
    localStorage.setItem('cricketUser', JSON.stringify(user));
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('login-btn');
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
            try {
                const res = await fetch(`${API}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) {
                    showAuthError(data.error || 'Login failed');
                    return;
                }
                storeSession(data.user);
                window.location.href = 'index.html';
            } catch {
                showAuthError('Cannot reach server. Is it running on port 5001?');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Login to Dashboard'; }
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('signup-btn');
            const fullname = (document.getElementById('fullname') || {}).value?.trim() || '';
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const roleEl = document.getElementById('role-select') || document.getElementById('role');
            const role = roleEl ? roleEl.value : 'user';
            const adminKey = (document.getElementById('adminKey') || {}).value || '';
            if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
            try {
                const res = await fetch(`${API}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullname, email, password, adminKey: role === 'admin' ? adminKey : '' })
                });
                const data = await res.json();
                if (!res.ok) {
                    showAuthError(data.error || 'Signup failed');
                    return;
                }
                storeSession(data.user);
                showAuthSuccess('Account created. Redirecting…');
                setTimeout(() => { window.location.href = 'index.html'; }, 600);
            } catch {
                showAuthError('Cannot reach server. Is it running on port 5001?');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
            }
        });
    }
});
