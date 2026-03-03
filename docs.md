# Documentation Generation Guide

## System Architecture

The graphics.h documentation system has three core components:

1. **docs.html** (templates/) - Main Single Page Application (SPA)
   - Contains all documentation content in JavaScript objects
   - Provides interactive UI with sidebar, search, and syntax highlighting
   - Serves as the primary content source

2. **base.py** (utilities/ module) - Code generation utility
   - Extracts content from docs.html
   - Generates static HTML pages on-demand
   - Supports multiple output formats

3. **Static Pages** (templates/docs/) - SEO-optimized pages
   - 15 currently generated pages across overview, lifecycle, and drawing categories
   - Each page is a self-contained HTML file for search engine crawling
   - 32-96KB per page (significantly reduced from original 1.3MB)

---

## How Documentation is Structured

### docs.html Content Organization

All documentation content is stored in `templates/docs.html` as JavaScript objects:

```javascript
// NAVIGATION object - Defines page hierarchy
const NAVIGATION = {
    overview: [
        { id: 'init', label: 'initgraph', path: 'overview/init.html' },
        { id: 'circle', label: 'circle', path: 'overview/circle.html' },
        // ... more pages
    ],
    lifecycle: [ /* pages */ ],
    drawing: [ /* pages */ ],
    // ... other categories
};

// CONTENT object - Contains page content as template literals
const CONTENT = {
    init: `
        <h1>initgraph()</h1>
        <p>Description...</p>
        <h2>Syntax</h2>
        <pre><code>void initgraph(int *graphdriver, int *graphmode, char *pathtodriver);</code></pre>
        <!-- Full page content -->
    `,
    circle: `...`,
    // ... all other pages
};
```

### File Organization

```
templates/
├── docs.html              # SPA with NAVIGATION and CONTENT objects
├── index.html             # Homepage
├── docs/                  # Generated static pages (15 files)
│   ├── index.html        # Docs homepage
│   ├── overview/
│   │   ├── init.html
│   │   ├── circle.html
│   │   └── ... (6+ more overview pages)
│   ├── lifecycle/
│   │   ├── initgraph.html
│   │   └── ... (4+ more lifecycle pages)
│   └── drawing/
│       ├── line.html
│       ├── rectangle.html
│       └── ... (3+ more drawing pages)
```

---

## Generation Workflow

### Method 1: Using base.py (Recommended)

#### Extracting Page Data

Use the `DocExtractor` class to pull content from docs.html:

```python
from base import DocExtractor

extractor = DocExtractor('templates/docs.html')

# Get all navigation links
nav_links = extractor.get_nav_links()
# Returns: [('init', 'overview/init.html', 'initgraph'), ...]

# Get all page content
content = extractor.get_content_dict()
# Returns: {'init': '<h1>initgraph()...</h1>', 'circle': '...', ...}

# Get metadata for specific page
metadata = extractor.get_page_metadata('circle')
# Returns: {'page_id': 'circle', 'title': 'circle', 'description': '...'}
```

#### Generating Pages

Use the `DocGenerator` class to create HTML pages:

```python
from base import DocGenerator

generator = DocGenerator('templates/docs.html')

# Extract data for a specific page
data = generator.extract_page_data('circle')
# Returns: {
#     'page_id': 'circle',
#     'title': 'circle()',
#     'description': '...',
#     'content': '<h1>circle()...</h1>',
#     'nav_links': [...],
#     'nav_groups': {'overview': [...], ...}
# }

# Generate a single page with template
generator.generate_page('circle', template_path='templates/base_template.html')
# Creates: templates/docs/overview/circle.html

# Generate all pages
generator.generate_all(template_path='templates/base_template.html')
# Creates: 15 HTML files
```

### Method 2: Manual HTML Formatting

Extract page data and create custom HTML:

```python
from base import DocGenerator

generator = DocGenerator('templates/docs.html')
data = generator.extract_page_data('circle')

# Build custom HTML
html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>{data['title']}</title>
    <meta name="description" content="{data['description']}">
    <link rel="stylesheet" href="../style.css">
</head>
<body>
    <nav><!-- Navigation from data['nav_groups'] --></nav>
    <main>
        {data['content']}
    </main>
</body>
</html>
"""

# Save to file
with open('templates/docs/overview/circle.html', 'w') as f:
    f.write(html)
```

---

## base.py API Reference

### DocExtractor Class

```python
extractor = DocExtractor(docs_file_path)

# Methods
extractor.get_nav_links()           # → List[(page_id, path, label)]
extractor.get_content_dict()        # → Dict[page_id, html_content]
extractor.get_page_metadata(page_id)  # → Dict with title, description, etc.
extractor.render_html_with_jinja2(html, template_path)  # → Rendered HTML
```

### DocGenerator Class

```python
generator = DocGenerator(docs_file_path)

# Methods
generator.extract_page_data(page_id)              # → Dict with all page data
generator.generate_page(page_id, template_path)  # → Bool (success)
generator.generate_all(template_path)            # → Int (count)
generator._organize_nav_links(nav_links)         # → Dict[category, links]
```

---

## Adding New Pages

To add documentation for a new function (e.g., `setcolor`):

### Step 1: Add Content to docs.html

Edit `templates/docs.html` and add to appropriate NAVIGATION group:

```javascript
const NAVIGATION = {
    setters: [
        { id: 'setcolor', label: 'setcolor', path: 'setters/setcolor.html' },
        // ... existing entries
    ]
};

const CONTENT = {
    setcolor: `
        <h1>setcolor()</h1>
        <p>Sets the current drawing color.</p>
        <h2>Syntax</h2>
        <pre><code>void setcolor(int color);</code></pre>
        <h2>Parameters</h2>
        <ul>
            <li><code>color</code> - Color value (0-15)</li>
        </ul>
        <h2>Example</h2>
        <pre><code>setcolor(RED);
circle(100, 100, 50);</code></pre>
    `,
    // ... existing entries
};
```

### Step 2: Update base.py CATEGORY_MAP (if new category)

If using a new category folder (e.g., setters):

```python
CATEGORY_MAP = {
    'setcolor': 'setters',  # Add this entry
    # ... existing mappings
}
```

### Step 3: Generate the Page

Using base.py:

```python
from base import DocGenerator

generator = DocGenerator('templates/docs.html')
generator.generate_page('setcolor', template_path='templates/base_template.html')
```

Or manually:

```python
data = generator.extract_page_data('setcolor')
# Use custom HTML template and save to templates/docs/setters/setcolor.html
```

---

## Why Static Pages?

Static HTML pages provide:

1. **SEO Optimization** - Search engines crawl and index static pages better
2. **Faster Load Times** - No JavaScript needed for initial page load
3. **Offline Access** - Pages work without JavaScript enabled
4. **Direct Links** - Users can link directly to specific function documentation

The SPA (docs.html) serves as:
- Interactive content viewer for on-site navigation
- Fallback for dynamic content loading
- Primary edit/update source

---

## Workflow Summary

```
Editing Documentation
        ↓
Update NAVIGATION and CONTENT in docs.html
        ↓
Run DocGenerator.extract_page_data(page_id)
        ↓
Format with template or manual HTML
        ↓
Save to templates/docs/{category}/{page_id}.html
        ↓
Static page is now live and SEO-optimized
```

---

## Example: Generating All Missing Function Pages

```python
from base import DocGenerator

generator = DocGenerator('templates/docs.html')

# Get all pages that need generation
nav_links = generator.extractor.get_nav_links()

for page_id, path, label in nav_links:
    # Extract data
    data = generator.extract_page_data(page_id)
    
    # Generate with template
    if not generator.generate_page(page_id, template_path='templates/base_template.html'):
        print(f"Failed to generate {page_id}")
    else:
        print(f"Generated {label}")
```

---

## Troubleshooting

**Issue**: Empty page generated
- **Solution**: Check that page_id exists in docs.html NAVIGATION and CONTENT objects

**Issue**: Missing navigation links
- **Solution**: Verify CATEGORY_MAP has entry for the page_id, or the nav_links list includes it

**Issue**: Template not found
- **Solution**: Ensure template_path points to valid Jinja2 template with {{ title }}, {{ content }}, {{ description }} variables

**Issue**: File not created
- **Solution**: Check that target directory exists (e.g., templates/docs/overview/) and base.py has write permissions

---

## Current Status

- **Total Pages Generated**: 15
- **Categories**: overview (6), lifecycle (4), drawing (5)
- **Content Source**: templates/docs.html
- **Utility Module**: base.py (DocExtractor + DocGenerator)
- **Build Pipeline**: None (on-demand generation via base.py)
- **Template Required**: Optional (manual formatting also supported)

---

## Quick Reference Commands

```bash
# Python console - Extract a single page
python -c "
from base import DocGenerator
gen = DocGenerator('templates/docs.html')
data = gen.extract_page_data('circle')
print(data['title'], data['description'])
"

# Generate single page with template
python -c "
from base import DocGenerator
gen = DocGenerator('templates/docs.html')
gen.generate_page('circle', template_path='templates/base_template.html')
"

# Generate all pages
python -c "
from base import DocGenerator
gen = DocGenerator('templates/docs.html')
gen.generate_all(template_path='templates/base_template.html')
"
```

---

**Last Updated**: After refactoring to remove build pipeline dependency
**Maintenance**: Update content in docs.html NAVIGATION + CONTENT objects, then regenerate pages as needed using base.py
