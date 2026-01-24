#!/usr/bin/env python3
"""
Script to iterate through folders and create a formatted text file for LLM consumption.
Includes filenames and file contents in a structured format.
HARDCODED PATH VERSION
"""

import os
import sys
from pathlib import Path

# ===== HARDCODED CONFIGURATION =====
ROOT_DIR = r"C:\Users\jadha\Desktop\graphics.h-online-compiler\VScodeExtension\src"
OUTPUT_FILE = r"C:\Users\jadha\Desktop\graphics.h-online-compiler\llm.txt"
MAX_DEPTH = None  # Set to a number like 3 to limit depth, or None for unlimited
# ===================================

def should_skip(path, exclude_patterns=None):
    """Check if path should be skipped based on common patterns."""
    if exclude_patterns is None:
        exclude_patterns = [
            '__pycache__', '.git', '.svn', 'node_modules', 
            '.venv', 'venv', '.env', '.DS_Store', '.idea',
            'dist', 'build', '*.pyc', '*.pyo', '*.so', '*.dll'
        ]
    
    name = os.path.basename(path)
    
    # Check for exact matches
    if name in exclude_patterns:
        return True
    
    # Check for pattern matches
    for pattern in exclude_patterns:
        if pattern.startswith('*.') and name.endswith(pattern[1:]):
            return True
    
    return False

def is_text_file(filepath, max_size_mb=1):
    """Check if file is likely a text file and not too large."""
    try:
        # Skip files larger than max_size_mb
        if os.path.getsize(filepath) > max_size_mb * 1024 * 1024:
            return False
        
        # Try to read as text
        with open(filepath, 'r', encoding='utf-8') as f:
            f.read(1024)  # Read first 1KB to check
        return True
    except (UnicodeDecodeError, PermissionError, OSError):
        return False

def collect_files(root_dir, exclude_patterns=None, max_depth=None):
    """Recursively collect all text files from directory."""
    files_data = []
    root_path = Path(root_dir).resolve()
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Calculate current depth
        current_path = Path(dirpath).resolve()
        try:
            depth = len(current_path.relative_to(root_path).parts)
        except ValueError:
            depth = 0
        
        # Stop if max depth reached
        if max_depth is not None and depth >= max_depth:
            dirnames.clear()
            continue
        
        # Filter out excluded directories
        dirnames[:] = [d for d in dirnames if not should_skip(os.path.join(dirpath, d), exclude_patterns)]
        
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            
            if should_skip(filepath, exclude_patterns):
                continue
            
            if is_text_file(filepath):
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Get relative path for cleaner output
                    rel_path = os.path.relpath(filepath, root_dir)
                    files_data.append((rel_path, content))
                except Exception as e:
                    print(f"Warning: Could not read {filepath}: {e}", file=sys.stderr)
    
    return files_data

def create_llm_text(root_dir, output_file, exclude_patterns=None, max_depth=None):
    """Create formatted text file for LLM consumption."""
    print(f"Scanning directory: {root_dir}")
    files_data = collect_files(root_dir, exclude_patterns, max_depth)
    
    print(f"Found {len(files_data)} text files")
    
    with open(output_file, 'w', encoding='utf-8') as out:
        out.write(f"# Directory Structure Export\n")
        out.write(f"# Root: {os.path.abspath(root_dir)}\n")
        out.write(f"# Total files: {len(files_data)}\n")
        out.write(f"{'=' * 80}\n\n")
        
        for rel_path, content in sorted(files_data):
            out.write(f"\n{'=' * 80}\n")
            out.write(f"FILE: {rel_path}\n")
            out.write(f"{'=' * 80}\n\n")
            out.write(content)
            out.write(f"\n\n{'=' * 80}\n")
            out.write(f"END OF FILE: {rel_path}\n")
            out.write(f"{'=' * 80}\n\n")
    
    print(f"Output written to: {output_file}")
    print(f"File size: {os.path.getsize(output_file) / 1024:.2f} KB")

def main():
    """Main function using hardcoded configuration."""
    
    if not os.path.isdir(ROOT_DIR):
        print(f"Error: '{ROOT_DIR}' is not a valid directory")
        sys.exit(1)
    
    # You can customize exclude patterns here
    exclude_patterns = [
        '__pycache__', '.git', '.svn', 'node_modules', 
        '.venv', 'venv', '.env', '.DS_Store', '.idea',
        'dist', 'build', '*.pyc', '*.pyo', '*.so', '*.dll',
        '*.exe', '*.jpg', '*.png', '*.gif', '*.ico',
        '*.min.js', '*.min.css'
    ]
    
    create_llm_text(ROOT_DIR, OUTPUT_FILE, exclude_patterns, MAX_DEPTH)

if __name__ == "__main__":
    main()