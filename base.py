"""
Base utility module for doc generation and content management.
Use this to generate individual documentation files however you need.
No forced build pipeline - use as needed.
"""

import re
import json
from pathlib import Path
from typing import Dict, Tuple, Optional


class DocExtractor:
    """Extract content, navigation, and metadata from docs.html"""
    
    def __init__(self, docs_path: str = 'templates/docs.html'):
        self.docs_path = docs_path
        with open(docs_path, 'r', encoding='utf-8') as f:
            self.content = f.read()
    
    def get_nav_links(self) -> list:
        """Extract NAVIGATION links from docs.html"""
        link_pattern = r"{ id: '([\w-]+)', path: '([\w\-/]+)', label: '(.*?)' }"
        return re.findall(link_pattern, self.content)
    
    def get_content_dict(self) -> Dict[str, str]:
        """Extract CONTENT template literals from docs.html"""
        content_pattern = r"'([\w-]+)':\s*`(.*?)`(?=\s*,|\s*})"
        matches = re.findall(content_pattern, self.content, flags=re.DOTALL)
        return {key: val.strip() for key, val in matches}
    
    def get_page_metadata(self, page_id: str) -> Dict[str, str]:
        """Get title and description for a page"""
        metadata_map = {
            'intro': {'title': 'Introduction', 'description': 'Master the art of BGI graphics.'},
            'getting-started': {'title': 'Getting Started', 'description': 'Set up your first graphics program.'},
            'constants': {'title': 'Constants', 'description': 'Comprehensive list of constants.'},
            'examples': {'title': 'Examples', 'description': 'Practical code examples.'},
            'faq': {'title': 'FAQ', 'description': 'Answers to common questions.'},
            'circle': {'title': 'circle()', 'description': 'Draw a circular boundary.'},
            'line': {'title': 'line()', 'description': 'Draw a straight line.'},
            'arc': {'title': 'arc()', 'description': 'Draw a circular arc.'},
            'rectangle': {'title': 'rectangle()', 'description': 'Draw a rectangular outline.'},
            'ellipse': {'title': 'ellipse()', 'description': 'Draw an elliptical arc.'},
            'putpixel': {'title': 'putpixel()', 'description': 'Color individual pixels.'},
            'initgraph': {'title': 'initgraph()', 'description': 'Initialize graphics system.'},
            'closegraph': {'title': 'closegraph()', 'description': 'Exit graphics mode.'},
            'detectgraph': {'title': 'detectgraph()', 'description': 'Detect graphics driver.'},
        }
        return metadata_map.get(page_id, {'title': page_id, 'description': f'Documentation for {page_id}'})
    
    def render_html_with_jinja2(self, page_id: str, content_html: str, template_path: str = 'templates/base.html') -> Optional[str]:
        """
        Render a page using a custom Jinja2 template.
        You must create your own template file with {{ title }}, {{ description }}, {{ content }} variables.
        """
        try:
            from jinja2 import Environment, FileSystemLoader
            env = Environment(loader=FileSystemLoader('.'))
            template = env.get_template(template_path)
            metadata = self.get_page_metadata(page_id)
            return template.render(
                title=metadata['title'],
                description=metadata['description'],
                content=content_html
            )
        except ImportError:
            print("Jinja2 not installed. Install with: pip install jinja2")
            return None
        except Exception as e:
            print(f"Template error: {e}")
            return None


class DocGenerator:
    """Generate individual documentation pages"""
    
    CATEGORY_MAP = {
        'getting-started': 'overview', 'constants': 'overview', 'examples': 'overview', 'faq': 'overview',
        'initgraph': 'lifecycle', 'closegraph': 'lifecycle', 'detectgraph': 'lifecycle',
        'line': 'drawing', 'circle': 'drawing', 'rectangle': 'drawing', 'arc': 'drawing',
        'ellipse': 'drawing', 'putpixel': 'drawing', 'drawpoly': 'drawing',
    }
    
    def __init__(self, output_dir: str = 'templates/docs'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.extractor = DocExtractor()
    
    def extract_page_data(self, page_id: str) -> Optional[Dict]:
        """
        Extract raw page data (content, metadata, navigation).
        Use this to format pages however you want.
        
        Returns:
            Dict with 'content', 'title', 'description', 'nav_links' or None if not found
        """
        content_dict = self.extractor.get_content_dict()
        
        if page_id not in content_dict:
            print(f"⚠️  Page '{page_id}' not found in docs.html")
            return None
        
        metadata = self.extractor.get_page_metadata(page_id)
        nav_links = self.extractor.get_nav_links()
        
        return {
            'page_id': page_id,
            'content': content_dict[page_id],
            'title': metadata['title'],
            'description': metadata['description'],
            'nav_links': nav_links,
            'nav_groups': self._organize_nav_links(nav_links)
        }
    
    def _organize_nav_links(self, nav_links: list) -> Dict[str, list]:
        """Organize navigation links by category"""
        groups = {}
        for page_id, path, label in nav_links:
            category = self.CATEGORY_MAP.get(page_id, 'other')
            if category not in groups:
                groups[category] = []
            groups[category].append({'id': page_id, 'path': path, 'label': label})
        return groups
    
    def generate_page(self, page_id: str, output_path: Optional[str] = None, template_path: Optional[str] = None) -> bool:
        """
        Generate a single documentation page.
        
        Args:
            page_id: The page identifier (e.g., 'circle', 'getting-started')
            output_path: Custom output path (optional, auto-determined if not provided)
            template_path: Path to Jinja2 template (optional, if using manual template)
        
        Returns:
            True if successful, False otherwise
        """
        page_data = self.extract_page_data(page_id)
        if not page_data:
            return False
        
        # Determine output path
        if not output_path:
            rel_path = page_id
            category = self.CATEGORY_MAP.get(page_id)
            if category:
                rel_path = f"{category}/{page_id}"
            rel_path = f"{rel_path}.html"
            output_path = self.output_dir / rel_path
        else:
            output_path = Path(output_path)
        
        # Create directories
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Render HTML using template if provided
        if template_path:
            rendered_html = self.extractor.render_html_with_jinja2(page_id, page_data['content'], template_path)
            if not rendered_html:
                return False
        else:
            # Return raw data for manual formatting
            print(f"⚠️  No template provided. Use template_path parameter or extract_page_data() for manual formatting.")
            return False
        
        # Write file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(rendered_html)
        
        print(f"✓ Generated: {output_path}")
        return True
    
    def generate_all(self, template_path: Optional[str] = None) -> int:
        """
        Generate all pages from docs.html.
        
        Args:
            template_path: Path to Jinja2 template (required for generation without manual formatting)
        
        Returns:
            Count of generated pages.
        """
        if not template_path:
            print("⚠️  No template_path provided. Use extract_page_data() for manual formatting.")
            return 0
        
        nav_links = self.extractor.get_nav_links()
        count = 0
        
        for page_id, path, label in nav_links:
            if self.generate_page(page_id, template_path=template_path):
                count += 1
        
        print(f"\n✅ Generated {count} pages")
        return count


# Usage examples (uncomment to use):
# 
# extractor = DocExtractor()
# nav_links = extractor.get_nav_links()
# content = extractor.get_content_dict()
# 
# # Generate single page
# generator = DocGenerator()
# generator.generate_page('circle')
# 
# # Generate all pages
# generator.generate_all()
