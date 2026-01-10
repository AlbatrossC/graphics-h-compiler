#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  graphics.h System-Wide Installer"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status messages
print_status() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to cleanup on error
cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        cd ~
        rm -rf "$TEMP_DIR"
        print_status "Cleaned up temporary files"
    fi
}

# Set trap for cleanup on error
trap cleanup EXIT

# Check if running as root for system-wide installation
if [ "$EUID" -eq 0 ]; then 
    print_error "Please do not run this script as root. It will use sudo when needed."
    exit 1
fi

# Check if sudo is available
if ! command -v sudo &> /dev/null; then
    print_error "sudo is required but not installed. Please install sudo first."
    exit 1
fi

# Check for required commands
for cmd in wget dpkg apt; do
    if ! command -v $cmd &> /dev/null; then
        print_error "Required command '$cmd' not found. Please install it first."
        exit 1
    fi
done

# 1. Install dependencies
echo ""
echo "[1/6] Installing required packages..."

if ! sudo dpkg --add-architecture i386 2>/dev/null; then
    print_warning "Could not add i386 architecture (may already be added)"
fi

if ! sudo apt update; then
    print_error "Failed to update package lists"
    exit 1
fi

if ! sudo apt install -y \
  gcc-mingw-w64-i686 \
  g++-mingw-w64-i686 \
  wine32 \
  wine \
  wget \
  ca-certificates; then
    print_error "Failed to install required packages"
    exit 1
fi

print_status "Dependencies installed"

# 2. Create system-wide directories
echo ""
echo "[2/6] Creating system-wide directories..."

if ! sudo mkdir -p /usr/local/include/graphics_h; then
    print_error "Failed to create /usr/local/include/graphics_h"
    exit 1
fi

if ! sudo mkdir -p /usr/local/lib/graphics_h; then
    print_error "Failed to create /usr/local/lib/graphics_h"
    exit 1
fi

print_status "Directories created"

# 3. Download headers and library
echo ""
echo "[3/6] Downloading graphics.h, winbgim.h, libbgi.a..."

# Create temp directory
TEMP_DIR=$(mktemp -d)
if [ ! -d "$TEMP_DIR" ]; then
    print_error "Failed to create temporary directory"
    exit 1
fi

cd "$TEMP_DIR" || {
    print_error "Failed to change to temporary directory"
    exit 1
}

# Download files from your GitHub repository (raw content)
GITHUB_RAW_BASE="https://raw.githubusercontent.com/AlbatrossC/graphics.h-online-compiler/main/graphics"

if ! wget -q "${GITHUB_RAW_BASE}/graphics.h" -O graphics.h; then
    print_error "Failed to download graphics.h"
    exit 1
fi

if ! wget -q "${GITHUB_RAW_BASE}/winbgim.h" -O winbgim.h; then
    print_error "Failed to download winbgim.h"
    exit 1
fi

if ! wget -q "${GITHUB_RAW_BASE}/libbgi.a" -O libbgi.a; then
    print_error "Failed to download libbgi.a"
    exit 1
fi

# Verify files were downloaded and are not empty
if [ ! -s graphics.h ]; then
    print_error "graphics.h is missing or empty"
    exit 1
fi

if [ ! -s winbgim.h ]; then
    print_error "winbgim.h is missing or empty"
    exit 1
fi

if [ ! -s libbgi.a ]; then
    print_error "libbgi.a is missing or empty"
    exit 1
fi

print_status "Files downloaded successfully"

# 4. Fix const-correctness in graphics.h
echo ""
echo "[4/6] Patching graphics.h for modern C++ (const-correctness)..."

# Create backup
cp graphics.h graphics.h.backup

# Fix initgraph
sed -i 's/void initgraph( int \*graphdriver, int \*graphmode, char \*pathtodriver )/void initgraph( int *graphdriver, int *graphmode, const char *pathtodriver )/g' graphics.h
sed -i 's/void initgraph(int\*, int\*, char\*)/void initgraph(int*, int*, const char*)/g' graphics.h
sed -i 's/void initgraph(int \*, int \*, char \*)/void initgraph(int *, int *, const char *)/g' graphics.h

# Fix outtext functions
sed -i 's/void outtext(char \*textstring)/void outtext(const char *textstring)/g' graphics.h
sed -i 's/void outtext(char\*)/void outtext(const char*)/g' graphics.h

sed -i 's/void outtextxy(int x, int y, char \*textstring)/void outtextxy(int x, int y, const char *textstring)/g' graphics.h
sed -i 's/void outtextxy(int, int, char\*)/void outtextxy(int, int, const char*)/g' graphics.h

# Fix settextstyle if present
sed -i 's/void settextstyle(int font, int direction, int charsize, char\*)/void settextstyle(int font, int direction, int charsize, const char*)/g' graphics.h
sed -i 's/void settextstyle(int, int, int, char\*)/void settextstyle(int, int, int, const char*)/g' graphics.h

# Additional common string functions that might need fixing
sed -i 's/char \*getdrivername/const char *getdrivername/g' graphics.h
sed -i 's/char\* getdrivername/const char* getdrivername/g' graphics.h

print_status "graphics.h patched for const-correctness"

# 5. Install files system-wide
echo ""
echo "[5/6] Installing files system-wide..."

if ! sudo cp graphics.h /usr/local/include/graphics_h/; then
    print_error "Failed to copy graphics.h"
    exit 1
fi

if ! sudo cp winbgim.h /usr/local/include/graphics_h/; then
    print_error "Failed to copy winbgim.h"
    exit 1
fi

if ! sudo cp libbgi.a /usr/local/lib/graphics_h/; then
    print_error "Failed to copy libbgi.a"
    exit 1
fi

# Verify installation
if [ ! -f /usr/local/include/graphics_h/graphics.h ]; then
    print_error "Installation verification failed: graphics.h not found"
    exit 1
fi

if [ ! -f /usr/local/include/graphics_h/winbgim.h ]; then
    print_error "Installation verification failed: winbgim.h not found"
    exit 1
fi

if [ ! -f /usr/local/lib/graphics_h/libbgi.a ]; then
    print_error "Installation verification failed: libbgi.a not found"
    exit 1
fi

print_status "Files installed to /usr/local/include/graphics_h and /usr/local/lib/graphics_h"

# 6. Create compilation wrapper script
echo ""
echo "[6/6] Creating 'graphics.h' command wrapper..."

if ! sudo tee /usr/local/bin/graphics.h > /dev/null << 'WRAPPER_EOF'
#!/usr/bin/env bash

# graphics.h compilation wrapper
# Usage: graphics.h filename.cpp

if [ $# -eq 0 ]; then
    echo "Usage: graphics.h <source_file.cpp> [output_name]"
    echo ""
    echo "Examples:"
    echo "  graphics.h program.cpp          # Compiles and runs program.exe"
    echo "  graphics.h program.cpp myapp    # Compiles and runs myapp.exe"
    exit 1
fi

SOURCE_FILE="$1"
OUTPUT_NAME="${2:-$(basename "${SOURCE_FILE%.*}")}"

# Add .exe extension if not present
if [[ ! "$OUTPUT_NAME" =~ \.exe$ ]]; then
    OUTPUT_NAME="${OUTPUT_NAME}.exe"
fi

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: Source file '$SOURCE_FILE' not found"
    exit 1
fi

echo "Compiling $SOURCE_FILE -> $OUTPUT_NAME"
echo ""

if ! i686-w64-mingw32-g++ "$SOURCE_FILE" \
  -I /usr/local/include/graphics_h \
  -L /usr/local/lib/graphics_h \
  -lbgi -lgdi32 -lcomdlg32 -luuid -loleaut32 -lole32 \
  -static-libgcc -static-libstdc++ \
  -o "$OUTPUT_NAME"; then
    echo ""
    echo "Compilation failed"
    exit 1
fi

echo ""
echo "Compilation successful: $OUTPUT_NAME"
echo ""
echo "Running with wine..."
echo ""

wine "$OUTPUT_NAME"
WRAPPER_EOF
then
    print_error "Failed to create wrapper script"
    exit 1
fi

if ! sudo chmod +x /usr/local/bin/graphics.h; then
    print_error "Failed to make wrapper script executable"
    exit 1
fi

print_status "Wrapper script created at /usr/local/bin/graphics.h"

# Cleanup
cd ~
rm -rf "$TEMP_DIR"
TEMP_DIR=""  # Prevent cleanup trap from trying again

# Configure Wine for optimal graphics.h performance (32-bit, reduce flickering)
echo ""
echo "Configuring Wine for graphics.h..."

# Set Wine to 32-bit mode
export WINEARCH=win32
export WINEPREFIX="$HOME/.wine32_graphics"

# Initialize Wine prefix (this will be quick if already done)
if wineboot -u 2>/dev/null; then
    print_status "Wine configured for 32-bit Windows programs"
else
    print_warning "Wine configuration encountered issues, but continuing..."
fi

# Final instructions
echo ""
echo "=========================================="
echo "  Installation Complete!"
echo "=========================================="
echo ""
echo "Usage:"
echo "  1. Write your graphics.h program (e.g., program.cpp)"
echo "  2. Compile with: graphics.h program.cpp"
echo "  3. Run with: wine program.exe"
echo ""
echo "Example:"
echo "  graphics.h myanimation.cpp"
echo "  wine myanimation.exe"
echo ""
print_status "System ready for graphics.h programming!"
echo ""