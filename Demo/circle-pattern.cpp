#include <graphics.h>
#include <conio.h>
#include <math.h>

void main()
{
    int gd = DETECT, gm;
    int cx, cy, radius;
    int i, angle;
    float x, y;
    
    initgraph(&gd, &gm, "C:\\TURBOC3\\BGI");
    
    cx = getmaxx() / 2;
    cy = getmaxy() / 2;
    
    settextstyle(DEFAULT_FONT, HORIZ_DIR, 2);
    outtextxy(200, 20, "Circle Pattern");
    settextstyle(DEFAULT_FONT, HORIZ_DIR, 1);
    outtextxy(180, 45, "Press any key to exit");
    
    // Draw main circle
    setcolor(WHITE);
    circle(cx, cy, 150);
    
    // Draw rotating circles
    radius = 30;
    
    for(i = 0; i < 12; i++)
    {
        angle = i * 30;
        x = cx + 150 * cos(angle * 3.14159 / 180);
        y = cy + 150 * sin(angle * 3.14159 / 180);
        
        setcolor(i + 1);
        circle((int)x, (int)y, radius);
        setfillstyle(SOLID_FILL, i + 1);
        floodfill((int)x, (int)y, i + 1);
    }
    
    // Draw center circle
    setcolor(YELLOW);
    circle(cx, cy, 40);
    setfillstyle(SOLID_FILL, YELLOW);
    floodfill(cx, cy, YELLOW);
    
    // Draw lines connecting circles
    setcolor(LIGHTGRAY);
    for(i = 0; i < 12; i++)
    {
        angle = i * 30;
        x = cx + 150 * cos(angle * 3.14159 / 180);
        y = cy + 150 * sin(angle * 3.14159 / 180);
        line(cx, cy, (int)x, (int)y);
    }
    
    getch();
    closegraph();
}