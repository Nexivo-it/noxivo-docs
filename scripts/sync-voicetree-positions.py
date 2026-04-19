import json
import os
import re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def update_file(file_path, x, y):
    if not os.path.exists(file_path):
        rel_path = os.path.relpath(file_path, REPO_ROOT)
        if os.path.exists(rel_path):
            file_path = rel_path
        else:
            print(f"File not found: {file_path}")
            return

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    frontmatter_match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)', content, re.DOTALL)
    
    if frontmatter_match:
        frontmatter = frontmatter_match.group(1)
        body = frontmatter_match.group(2)
        
        lines = frontmatter.splitlines()
        new_lines = []
        x_found = False
        y_found = False
        
        for line in lines:
            if line.strip().startswith('x:'):
                new_lines.append(f'x: {x}')
                x_found = True
            elif line.strip().startswith('y:'):
                new_lines.append(f'y: {y}')
                y_found = True
            else:
                new_lines.append(line)
        
        if not x_found:
            new_lines.append(f'x: {x}')
        if not y_found:
            new_lines.append(f'y: {y}')
            
        new_frontmatter = '\n'.join(new_lines)
        new_content = f'---\n{new_frontmatter}\n---\n{body}'
    else:
        new_content = f'---\nx: {x}\ny: {y}\n---\n{content}'

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {file_path}")

def main():
    json_path = '.voicetree/positions.json'
    if not os.path.exists(json_path):
        print(f"JSON not found: {json_path}")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        positions = json.load(f)

    for file_path, pos in positions.items():
        update_file(file_path, pos['x'], pos['y'])

if __name__ == '__main__':
    main()
