with open('c:\\Users\\rikit\\blindspot-tracker-app\\script.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = '<div class="forge-tips"><strong>Listening notes</strong><ul><li>If the scene still feels flat, listen again at the same level.</li><li>Use "increase vividness" until it feels real.</li><li>Only mark max vividness when you feel the image vividly.</li></ul></div>`'
new = '<div class="forge-tips"><strong>Memory technique: Build vividness gradually</strong><ul><li><strong>Level 1:</strong> See the basic scene structure</li><li><strong>Level 2:</strong> Add sensory details (sounds, smells, textures)</li><li><strong>Level 3:</strong> Feel like you\'re inside the scene</li></ul></div>`; state.firstVisit.mode5Listening = false'

if old in content:
    content = content.replace(old, new)
    with open('c:\\Users\\rikit\\blindspot-tracker-app\\script.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS: Listening stage tips updated")
else:
    print("ERROR: Old string not found")
