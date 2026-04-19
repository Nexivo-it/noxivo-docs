import os
import re

def get_all_md_files(directory):
    md_files = {}
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.md'):
                rel_path = os.path.relpath(os.path.join(root, file), directory)
                md_files[file] = rel_path
    return md_files

def audit_links(directory, fix=False):
    md_files_map = get_all_md_files(directory)
    broken_links = []
    
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.md'):
                file_path = os.path.join(root, file)
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original_content = content
                # Find all wikilinks [[file.md]]
                links = re.findall(r'\[\[(.*?)\]\]', content)
                for link in links:
                    clean_link = link.split('|')[0].split('#')[0].strip()
                    if not clean_link: continue
                        
                    target_file = clean_link
                    if not target_file.endswith('.md') and '.' not in target_file:
                        target_file += '.md'
                    
                    # Check if it was an absolute path
                    if "/voicetree-14-4/" in clean_link:
                        basename = os.path.basename(clean_link)
                        if basename in md_files_map:
                            if fix:
                                content = content.replace(f'[[{link}]]', f'[[{basename}]]')
                                print(f"Fixed absolute path link in {file}: [[{link}]] -> [[{basename}]]")
                                continue
                            broken_links.append({'source': file_path, 'target': link, 'suggest': basename})
                            continue

                    # Check if it was a path-based link that should be flat
                    if '/' in clean_link and not clean_link.startswith('/'):
                        basename = os.path.basename(clean_link)
                        if basename in md_files_map:
                            if fix:
                                content = content.replace(f'[[{link}]]', f'[[{basename}]]')
                                print(f"Fixed path-based link in {file}: [[{link}]] -> [[{basename}]]")
                                continue
                            broken_links.append({'source': file_path, 'target': link, 'suggest': basename})
                            continue

                    # Handle missing index.md -> welcome_to_voicetree.md
                    if clean_link == "index.md" or clean_link == "index":
                        if fix:
                            content = content.replace(f'[[{link}]]', '[[welcome_to_voicetree.md]]')
                            print(f"Fixed index link in {file}: [[{link}]] -> [[welcome_to_voicetree.md]]")
                            continue
                        broken_links.append({'source': file_path, 'target': link, 'suggest': "welcome_to_voicetree.md"})
                        continue

                    # Final check
                    if target_file not in md_files_map and os.path.basename(target_file) not in md_files_map:
                        broken_links.append({'source': file_path, 'target': link, 'suggest': None})

                if fix and content != original_content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                            
    return broken_links

if __name__ == "__main__":
    import sys
    fix_mode = "--fix" in sys.argv
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    voicetree_dir = os.path.join(repo_root, "voicetree-14-4")
    print(f"Auditing links in {voicetree_dir} (Fix: {fix_mode})...")
    broken = audit_links(voicetree_dir, fix=fix_mode)
    
    remaining = [b for b in broken if b['suggest'] is None]
    if not remaining:
        print("✅ No (unresolved) broken wikilinks found!")
    else:
        print(f"❌ Found {len(remaining)} broken wikilinks without suggestions:")
        for b in remaining:
            print(f"  - {os.path.relpath(b['source'], voicetree_dir)} -> {b['target']}")
