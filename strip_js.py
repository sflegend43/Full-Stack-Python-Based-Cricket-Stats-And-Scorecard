import glob, re
files = [f for f in glob.glob('*.js') if not f.startswith('admin_') and f not in ('auth.js', 'logic.js', 'parallax.js')]
for f in files:
    content = open(f, 'r', encoding='utf-8').read()
    content = re.sub(r'<button[^>]*class="[^"]*admin-only[^"]*"[^>]*>.*?</button>', '', content, flags=re.DOTALL)
    content = re.sub(r'<div[^>]*class="[^"]*admin-only[^"]*"[^>]*>.*?</div>', '', content, flags=re.DOTALL)
    open(f, 'w', encoding='utf-8').write(content)
