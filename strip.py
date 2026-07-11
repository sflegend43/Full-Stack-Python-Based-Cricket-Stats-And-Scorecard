import glob, re
files = [f for f in glob.glob('*.html') if not f.startswith('admin_') and f not in ('login.html', 'signup.html')]
for f in files:
    content = open(f, 'r', encoding='utf-8').read()
    # Remove admin-only buttons and divs
    content = re.sub(r'<button[^>]*class="[^"]*admin-only[^"]*"[^>]*>.*?</button>', '', content, flags=re.DOTALL)
    content = re.sub(r'<div[^>]*class="[^"]*admin-only[^"]*"[^>]*>.*?</div>', '', content, flags=re.DOTALL)
    open(f, 'w', encoding='utf-8').write(content)
