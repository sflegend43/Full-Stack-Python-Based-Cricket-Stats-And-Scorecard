// auth.js — CricketStats Pro | Authentication Logic

const API = 'http://localhost:5001';

// ─── Shared flash helper ───
function showFlash(msg, type = 'error') {
    const el = document.getElementById('flash-message');
    if (!el) return;
    el.textContent = msg;
    el.className = type;
    el.style.display = 'block';
    setTimeout(() => {
        el.style.display = 'none';
        el.className = '';
    }, 4000);
}

// ─── Login ───
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        btn.textContent = '⏳ Signing in…';
        btn.disabled = true;

        const email    = loginForm.email.value.trim();
        const password = loginForm.password.value.trim();

        try {
            const res = await fetch(`${API}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (!res.ok) {
                showFlash(data.error || 'Login failed', 'error');
            } else {
                localStorage.setItem('cricketUser', JSON.stringify(data.user));
                window.location.href = 'index.html';
            }
        } catch {
            showFlash('Server unreachable. Make sure app.py is running.', 'error');
        } finally {
            btn.textContent = '🚀 Login to Dashboard';
            btn.disabled = false;
        }
    });
}

// ─── Signup ───
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('signup-btn');
        btn.textContent = '⏳ Creating Account…';
        btn.disabled = true;

        const fullname = signupForm.fullname.value.trim();
        const email    = signupForm.email.value.trim();
        const password = signupForm.password.value.trim();
        
        let payload = { fullname, email, password };
        
        if (signupForm.role) {
            payload.role = signupForm.role.value;
            if (payload.role === 'admin') {
                payload.adminKey = signupForm.adminKey.value.trim();
            }
        }

        try {
            const res = await fetch(`${API}/api/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (!res.ok) {
                showFlash(data.error || 'Signup failed', 'error');
            } else {
                showFlash('Account created! Redirecting to login…', 'success');
                setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            }
        } catch {
            showFlash('Server unreachable. Make sure app.py is running.', 'error');
        } finally {
            btn.textContent = '✅ Create Account';
            btn.disabled = false;
        }
    });
}
