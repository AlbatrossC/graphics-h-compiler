import re
import os
from jinja2 import Environment, FileSystemLoader

# Configuration
docs_html_path = 'c:/Users/jadha/Desktop/graphics.h-online-compiler/templates/docs.html'
base_template_path = 'c:/Users/jadha/Desktop/graphics.h-online-compiler/templates'
output_base = 'c:/Users/jadha/Desktop/graphics.h-online-compiler/templates/docs'

os.makedirs(output_base, exist_ok=True)

# Step 1: Read docs.html to extract NAVIGATION and CONTENT
with open(docs_html_path, 'r', encoding='utf-8') as f:
    docs_html = f.read()

# Extract NAVIGATION links
nav_links = []
link_pattern = r"{ id: '([\w-]+)', path: '([\w\-/]+)', label: '(.*?)' }"
nav_links = re.findall(link_pattern, docs_html)

# Extract CONTENT pages (template literals)
content_pattern = r"'([\w-]+)':\s*`(.*?)`(?=\s*,|\s*})"
content_matches = re.findall(content_pattern, docs_html, flags=re.DOTALL)
content_dict = {key: val.strip() for key, val in content_matches}

# Step 2: Define metadata for each page
page_metadata = {
    'intro': {
        'title': 'Introduction',
        'description': 'Master the art of BGI graphics. Explore the graphics.h library from basics to complex rendering.',
    },
    'getting-started': {
        'title': 'Getting Started',
        'description': 'Set up your first graphics program in minutes with the BGI library.',
    },
    'constants': {
        'title': 'Constants & Types',
        'description': 'Comprehensive list of color constants, fill styles, font constants, and error codes.',
    },
    'examples': {
        'title': 'Code Examples',
        'description': 'Practical graphics programs demonstrating common usage patterns and techniques.',
    },
    'faq': {
        'title': 'FAQ',
        'description': 'History, relevance, and technical details about the Turbo C graphics library.',
    },
    'initgraph': {
        'title': 'initgraph()',
        'description': 'Initialize the graphics system by loading a graphics driver and setting graphics mode.',
    },
    'closegraph': {
        'title': 'closegraph()',
        'description': 'Exit the graphics system and restore text mode.',
    },
    'detectgraph': {
        'title': 'detectgraph()',
        'description': 'Query hardware to determine the best graphics driver and mode.',
    },
    'line': {
        'title': 'line()',
        'description': 'Draw a straight line between two specified points.',
    },
    'circle': {
        'title': 'circle()',
        'description': 'Draw a circular boundary with a defined radius at a specific center point.',
    },
    'rectangle': {
        'title': 'rectangle()',
        'description': 'Draw a rectangular outline with specified corner coordinates.',
    },
    'arc': {
        'title': 'arc()',
        'description': 'Draw a circular arc with defined start and end angles.',
    },
    'ellipse': {
        'title': 'ellipse()',
        'description': 'Draw an elliptical arc or complete oval shape on the screen.',
    },
    'putpixel': {
        'title': 'putpixel()',
        'description': 'Color individual dots on the screen with micro-level drawing control.',
    },
    'drawpoly': {
        'title': 'drawpoly()',
        'description': 'Draw a polygon outline from an array of coordinate points.',
    },
    'linerel': {
        'title': 'linerel()',
        'description': 'Draw a line relative to the current drawing position.',
    },
    'lineto': {
        'title': 'lineto()',
        'description': 'Draw a line from the current position to an absolute coordinate.',
    },
    'moveto': {
        'title': 'moveto()',
        'description': 'Move the current position pointer without drawing.',
    },
}

# Category mapping for folder organization
cat_map = {
    'getting-started': 'overview', 'constants': 'overview', 'examples': 'overview', 'faq': 'overview',
    'initgraph': 'lifecycle', 'closegraph': 'lifecycle', 'detectgraph': 'lifecycle',
    'line': 'drawing', 'circle': 'drawing', 'rectangle': 'drawing', 'arc': 'drawing',
    'ellipse': 'drawing', 'putpixel': 'drawing', 'drawpoly': 'drawing',
    'linerel': 'drawing', 'lineto': 'drawing', 'moveto': 'drawing',
}

# Step 3: Set up Jinja2 environment
env = Environment(loader=FileSystemLoader(base_template_path))
template = env.get_template('base.html')

# Step 4: Generate pages
generated_count = 0
for page_id, path, label in nav_links:
    if page_id not in content_dict:
        print(f"⚠️  Skipping {page_id}: no content found")
        continue
    
    # Determine output path
    rel_path = path.replace('/docs', '').strip('/')
    if not rel_path:
        rel_path = 'index.html'
    else:
        folder = cat_map.get(page_id, '')
        if folder:
            rel_path = f"{folder}/{rel_path}.html"
        else:
            rel_path = f"{rel_path}.html"
    
    target_path = os.path.join(output_base, rel_path)
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    
    # Get metadata for this page
    metadata = page_metadata.get(page_id, {'title': label, 'description': f'Documentation for {label}'})
    
    # Render template
    rendered_html = template.render(
        title=metadata['title'],
        description=metadata['description'],
        content=content_dict[page_id]
    )
    
    # Write to file
    with open(target_path, 'w', encoding='utf-8') as f:
        f.write(rendered_html)
    
    generated_count += 1
    print(f"✓ Generated: {target_path}")

print(f"\n✅ Documentation build complete. Generated {generated_count} pages.")
