import os
pages = ['index.html', 'tournaments.html', 'matches.html', 'teams.html', 'players.html', 'rankings.html', 'stats.html', 'stats_ai.html', 'match_entry.html']

for page in pages:
    if not os.path.exists(page): continue
    with open(page, 'r', encoding='utf-8') as f:
        content = f.read()
    
    admin_content = content
    for p in pages:
        admin_content = admin_content.replace(f'"{p}"', f'"admin_{p}"')
    
    with open(f'admin_{page}', 'w', encoding='utf-8') as f:
        f.write(admin_content)
