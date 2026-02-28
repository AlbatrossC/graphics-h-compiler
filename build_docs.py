import re
import os
import json

docs_path = 'c:/Users/jadha/Desktop/graphics.h-online-compiler/templates/docs.html'
with open(docs_path, 'r', encoding='utf-8') as f:
    docs_html = f.read()

# 1. Extract the standard shell (prefix and suffix)
pattern = r'(<div id="content-area">)(.*?)(</div>\s*</main>)'
match = re.search(pattern, docs_html, flags=re.DOTALL)
if not match:
    print("Could not find content-area in docs.html")
    exit(1)

prefix = docs_html[:match.start(2)]
suffix = docs_html[match.end(2):]

# 2. Extract NAVIGATION using a simple regex (since it's a JS object literal)
# We want the paths and IDs to know where to save each file.
nav_pattern = r"const NAVIGATION = (\{.*?\});"
nav_match = re.search(nav_pattern, docs_html, flags=re.DOTALL)
if not nav_match:
    print("Could not find NAVIGATION object in docs.html")
    exit(1)

# Clean up JS-like object to be somewhat JSON-compatible for parsing
# (Removing trailing commas and unquoted keys if necessary, or just use regex for links)
nav_links = []
link_pattern = r"{ id: '([\w-]+)', path: '([\w\-/]+)', label: '(.*?)' }"
nav_links = re.findall(link_pattern, nav_match.group(1))

# 3. Extract CONTENT pages
content_pattern = r"'([\w-]+)':\s*`(.*?)`"
content_matches = re.findall(content_pattern, docs_html, flags=re.DOTALL)
content_dict = {key: val for key, val in content_matches}

output_base = 'c:/Users/jadha/Desktop/graphics.h-online-compiler/templates/docs'
os.makedirs(output_base, exist_ok=True)

# 4. Generate pages based on navigation paths
for page_id, path, label in nav_links:
    if page_id not in content_dict:
        print(f"Skipping {page_id}, no content found.")
        continue
    
    # Determine the relative path from output_base
    # Path starts with /docs/ or is just /docs
    rel_path = path.replace('/docs', '').strip('/')
    if not rel_path:
        rel_path = 'index.html'
    else:
        rel_path = rel_path + '.html'
    
    target_path = os.path.join(output_base, rel_path)
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    
    full_html = prefix + content_dict[page_id] + suffix
    
    # Update Page Title
    full_html = full_html.replace('<title>Documentation — graphics.h Online Compiler</title>', 
                                  f'<title>{label} — graphics.h Online Compiler</title>')
    
    with open(target_path, 'w', encoding='utf-8') as f:
        f.write(full_html)
    print(f"Generated: {target_path}")

print("\nDocumentation build complete.")
