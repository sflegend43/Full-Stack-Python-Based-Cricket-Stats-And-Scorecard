import os
pages = ['login.html', 'signup.html']

for page in pages:
    if not os.path.exists(page): continue
    with open(page, 'r', encoding='utf-8') as f:
        content = f.read()
    
    admin_content = content.replace('"index.html"', '"admin_index.html"').replace('"signup.html"', '"admin_signup.html"').replace('"login.html"', '"admin_login.html"')
    
    with open(f'admin_{page}', 'w', encoding='utf-8') as f:
        f.write(admin_content)
