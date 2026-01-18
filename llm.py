import os

ROOT_DIR = "VScodeExtension/src"          # change this to your folder path
OUTPUT_FILE = "dump.txt"  # output file for LLM

# File extensions to INCLUDE (set to None to include all)
INCLUDE_EXTENSIONS = None
# Example:
# INCLUDE_EXTENSIONS = {".py", ".ts", ".js", ".cpp", ".h"}

# Directories to IGNORE
IGNORE_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".venv",
    ".idea",
    ".vscode"
}

def should_include_file(filename):
    if INCLUDE_EXTENSIONS is None:
        return True
    return os.path.splitext(filename)[1] in INCLUDE_EXTENSIONS


with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
    for root, dirs, files in os.walk(ROOT_DIR):
        # Remove ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file in files:
            if not should_include_file(file):
                continue

            file_path = os.path.join(root, file)

            out.write("\n" + "=" * 80 + "\n")
            out.write(f"FILE: {file_path}\n")
            out.write("=" * 80 + "\n\n")

            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    out.write(f.read())
            except Exception as e:
                out.write(f"[ERROR READING FILE]: {e}")

            out.write("\n\n")

print(f"✔ All files written to {OUTPUT_FILE}")
