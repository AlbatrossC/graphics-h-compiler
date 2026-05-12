DOCS_SLUG_TO_TEMPLATE = {
    'what-is-graphicsh': 'docs/getting-started/what-is-graphicsh.html',
    'what-is-graphics': 'docs/getting-started/what-is-graphicsh.html',  # alias
    'where-to-run': 'docs/getting-started/where-to-run.html',
    'hello-graphics': 'docs/getting-started/hello-graphics.html',
    'graphics-initialization': 'docs/initialization/graphics-initialization.html',
    'drivers-and-modes': 'docs/drivers/drivers-and-modes.html',
    'line-and-movement': 'docs/drawing/line-and-movement.html',
    'circle': 'docs/drawing/circle.html',
    'rectangle': 'docs/drawing/rectangle.html',
    'bar': 'docs/drawing/bar.html',
    'bar3d': 'docs/drawing/bar3d.html',
    'arc': 'docs/drawing/arc.html',
    'ellipse': 'docs/drawing/ellipse.html',
    'pieslice': 'docs/drawing/pieslice.html',
    'sector': 'docs/drawing/sector.html',
    'polygons-and-fill': 'docs/polygons/polygons-and-fill.html',
    'colors-and-palette': 'docs/colors/colors-and-palette.html',
    'fill-and-patterns': 'docs/fill/fill-and-patterns.html',
    'viewport-and-screen': 'docs/viewport/viewport-and-screen.html',
    'text-and-fonts': 'docs/text/text-and-fonts.html',
    'image-handling': 'docs/image/image-handling.html',
    'advanced-functions': 'docs/advanced/advanced-functions.html',
    'error-codes': 'docs/errors/error-codes.html',
}

DEFAULT_DOCS_SLUG = 'what-is-graphicsh'
DOCS_SITE_TITLE = 'graphics.h online compiler docs'

# Aliases that should redirect to their canonical slug
DOCS_CANONICAL_SLUGS = {
    'what-is-graphics': 'what-is-graphicsh',
}

# Ordered list of canonical slugs for prev/next navigation
DOCS_ORDERED_SLUGS = [
    'what-is-graphicsh',
    'where-to-run',
    'hello-graphics',
    'graphics-initialization',
    'drivers-and-modes',
    'line-and-movement',
    'circle',
    'rectangle',
    'bar',
    'bar3d',
    'arc',
    'ellipse',
    'pieslice',
    'sector',
    'polygons-and-fill',
    'colors-and-palette',
    'fill-and-patterns',
    'viewport-and-screen',
    'text-and-fonts',
    'image-handling',
    'advanced-functions',
    'error-codes',
]

DOCS_SLUG_TO_TITLE = {
    'what-is-graphicsh': 'What is graphics.h?',
    'what-is-graphics': 'What is graphics.h?',
    'where-to-run': 'Where to Run graphics.h Programs',
    'hello-graphics': 'Hello Graphics — Your First Program',
    'graphics-initialization': 'Graphics Initialization (initgraph, detectgraph)',
    'drivers-and-modes': 'Drivers & Modes in graphics.h',
    'line-and-movement': 'line() and Cursor Movement Functions',
    'circle': 'circle() — Draw Circles in graphics.h',
    'rectangle': 'rectangle() — Draw Rectangles in graphics.h',
    'bar': 'bar() — Filled Rectangles in graphics.h',
    'bar3d': 'bar3d() — 3D Bars in graphics.h',
    'arc': 'arc() — Draw Arcs in graphics.h',
    'ellipse': 'ellipse() — Draw Ellipses in graphics.h',
    'pieslice': 'pieslice() — Filled Pie Slices in graphics.h',
    'sector': 'sector() — Ellipse Sectors in graphics.h',
    'polygons-and-fill': 'Polygons and Fill — drawpoly, fillpoly, floodfill',
    'colors-and-palette': 'Colors and Palette in graphics.h',
    'fill-and-patterns': 'Fill Styles and Patterns in graphics.h',
    'viewport-and-screen': 'Viewport and Screen Functions in graphics.h',
    'text-and-fonts': 'Text and Font Functions in graphics.h',
    'image-handling': 'Image and Pixel Operations in graphics.h',
    'advanced-functions': 'Advanced graphics.h Functions',
    'error-codes': 'Error Codes and Debugging in graphics.h',
}

DOCS_SLUG_TO_DESCRIPTION = {
    'what-is-graphicsh': (
        'Learn what graphics.h is and why it is still taught in Indian colleges. '
        'Understand the Borland Graphics Interface (BGI), its limitations, and which modern '
        'alternatives like SDL, SFML, and OpenGL you should use for real-world development.'
    ),
    'where-to-run': (
        'Find the best way to run graphics.h programs in 2024. Compare the graphics.h online '
        'compiler, VS Code extension, Turbo C with DOSBox, and Ubuntu/Linux setup options — '
        'with step-by-step instructions for each environment.'
    ),
    'hello-graphics': (
        'Write and run your first graphics.h program step by step. This beginner tutorial '
        'explains every line of code in a Hello World graphics program, shows the DOS output, '
        'and lets you run it directly in the browser using our online compiler.'
    ),
    'graphics-initialization': (
        'Master graphics.h initialization with initgraph(), detectgraph(), graphresult(), '
        'grapherrormsg(), closegraph(), and restorecrtmode(). Includes complete code examples, '
        'parameter tables, common errors, and how to handle initialization failures.'
    ),
    'drivers-and-modes': (
        'Understand graphics.h drivers and graphics modes. Learn what DETECT, VGA, EGALO, '
        'and other BGI driver constants mean, how getmaxx() and getmaxy() work, and how '
        'to properly initialize and close the graphics window in Turbo C programs.'
    ),
    'line-and-movement': (
        'Learn all graphics.h line drawing and cursor movement functions: line(), lineto(), '
        'linerel(), moveto(), moverel(), and getx()/gety(). Includes syntax, parameters, '
        'practical examples, and a full runnable program with DOS output.'
    ),
    'circle': (
        'Learn how to draw circles in graphics.h using the circle() function. Covers syntax, '
        'all parameters (x, y, radius), color, filled vs outline circles, common use cases, '
        'and a complete runnable example program with step-by-step explanation.'
    ),
    'rectangle': (
        'Draw rectangles in graphics.h with the rectangle() function. Covers syntax, '
        'parameters (left, top, right, bottom), difference between rectangle() and bar(), '
        'line styles, and practical examples with complete runnable Turbo C programs.'
    ),
    'bar': (
        'Use bar() in graphics.h to draw solid filled rectangles. Learn the syntax, '
        'parameters, how to set fill color and pattern with setfillstyle(), and the key '
        'differences between bar() and rectangle(). Includes complete example programs.'
    ),
    'bar3d': (
        'Draw 3D bar charts in graphics.h using bar3d(). Covers all six parameters including '
        'depth and topflag, how to create bar chart visualizations, fill styles, and '
        'complete runnable example programs for Turbo C.'
    ),
    'arc': (
        'Draw arcs in graphics.h with the arc() function. Learn the syntax, start/end angle '
        'system, radius and center parameters, getarccoords() usage, and practical examples '
        'of arc-based shapes. Includes a complete runnable program.'
    ),
    'ellipse': (
        'Draw ellipses in graphics.h using ellipse(). Covers x/y center, start/end angles, '
        'x-radius and y-radius parameters, how to draw full ellipses vs partial arcs, '
        'and complete example programs you can run directly in the browser.'
    ),
    'pieslice': (
        'Draw filled pie slices in graphics.h using pieslice(). Learn the center coordinates, '
        'start and end angles, radius parameter, and how to use setfillstyle() to control '
        'fill patterns. Includes pie chart examples and complete runnable programs.'
    ),
    'sector': (
        'Draw elliptical sector slices in graphics.h with sector(). Understand all five '
        'parameters (x, y, stangle, endangle, xradius, yradius), the difference from '
        'pieslice(), and see complete runnable example programs.'
    ),
    'polygons-and-fill': (
        'Learn polygon drawing and fill operations in graphics.h: drawpoly(), fillpoly(), '
        'and floodfill(). Covers the points array format, fill styles with setfillstyle(), '
        'boundary color rules, and complete examples for triangles, pentagons, and star shapes.'
    ),
    'colors-and-palette': (
        'Master colors in graphics.h — all 16 color constants (BLACK, WHITE, RED, etc.), '
        'setcolor(), setbkcolor(), getcolor(), getbkcolor(), getmaxcolor(), and palette '
        'functions like setpalette() and setallpalette(). Complete reference with examples.'
    ),
    'fill-and-patterns': (
        'Learn fill styles and patterns in graphics.h using setfillstyle() and setfillpattern(). '
        'Covers all 12 predefined fill patterns, custom 8x8 bit patterns, getfillsettings(), '
        'and practical examples of shaded and patterned shapes.'
    ),
    'viewport-and-screen': (
        'Understand viewport functions in graphics.h: setviewport(), clearviewport(), '
        'getviewsettings(), cleardevice(), and page flipping with setactivepage() and '
        'setvisualpage(). Covers coordinate clipping and screen management with examples.'
    ),
    'text-and-fonts': (
        'Render text in graphics.h using outtext(), outtextxy(), settextstyle(), and '
        'settextjustify(). Learn all font types (DEFAULT_FONT, TRIPLEX_FONT, etc.), '
        'direction, size multipliers, textheight(), textwidth(), and complete examples.'
    ),
    'image-handling': (
        'Work with images and pixels in graphics.h: putpixel(), getpixel(), imagesize(), '
        'getimage(), and putimage(). Learn copy modes (COPY_PUT, XOR_PUT, etc.), how to '
        'capture and move screen regions, and complete image operation examples.'
    ),
    'advanced-functions': (
        'Explore advanced graphics.h functions: cleardevice(), setwritemode(), '
        'graphgetmem(), graphfreemem(), setgraphbufsize(), getarccoords(), and animation '
        'techniques. Includes memory management tips and complete runnable examples.'
    ),
    'error-codes': (
        'Understand graphics.h error codes and how to debug initialization and drawing issues. '
        'Covers all grXxx constants (grOk, grNoInitGraph, grNotDetected, etc.), '
        'graphresult(), grapherrormsg(), and a complete error-handling example program.'
    ),
}

# ── Blog / Tutorial data ─────────────────────────────────────────────────────

TUTORIALS_ORDERED = [
    'draw-house-graphics-h',
    'graphics-h-animation',
    'graphics-h-patterns',
]

TUTORIALS_DATA = {
    'draw-house-graphics-h': {
        'title': 'How to Draw a House Using graphics.h in C',
        'description': (
            'Step-by-step tutorial to draw a house using graphics.h in Turbo C. '
            'Covers rectangle() for walls, triangle with line() for roof, circle() '
            'for sun, and floodfill() for colors. Includes complete runnable source code.'
        ),
        'template': 'tutorials/draw-house-graphics-h.html',
        'category': 'Beginner Project',
        'read_time': '8 min read',
    },
    'graphics-h-animation': {
        'title': 'Animation in graphics.h — Moving Objects with delay()',
        'description': (
            'Learn how to create simple animations in graphics.h using cleardevice(), '
            'delay(), and setvisualpage(). Build a bouncing ball and a moving car '
            'animation with complete Turbo C source code you can run online.'
        ),
        'template': 'tutorials/graphics-h-animation.html',
        'category': 'Intermediate',
        'read_time': '10 min read',
    },
    'graphics-h-patterns': {
        'title': 'Drawing Patterns and Designs with graphics.h',
        'description': (
            'Create geometric patterns and designs using graphics.h loops and drawing '
            'functions. Build checkerboards, spirals, star patterns, and color gradients '
            'using circle(), line(), and setcolor() with complete C code examples.'
        ),
        'template': 'tutorials/graphics-h-patterns.html',
        'category': 'Beginner Project',
        'read_time': '7 min read',
    },
}
