#include <graphics.h>
#include <conio.h>
#include <dos.h>
#include <stdlib.h>

void main()
{
    int gd = DETECT, gm;
    int x = 320, y = 240;
    int dx = 5, dy = 5;
    int radius = 20;
    int color = WHITE;
    
    initgraph(&gd, &gm, "C:\\TURBOC3\\BGI");
    
    settextstyle(DEFAULT_FONT, HORIZ_DIR, 2);
    outtextxy(150, 10, "Bouncing Ball Demo");
    settextstyle(DEFAULT_FONT, HORIZ_DIR, 1);
    outtextxy(180, 35, "Press any key to exit");
    
    // Draw border
    rectangle(10, 50, 630, 470);
    
    while(!kbhit())
    {
        // Clear previous ball
        setcolor(BLACK);
        circle(x, y, radius);
        setfillstyle(SOLID_FILL, BLACK);
        floodfill(x, y, BLACK);
        
        // Update position
        x += dx;
        y += dy;
        
        // Bounce off walls
        if(x - radius <= 10 || x + radius >= 630)
        {
            dx = -dx;
            color = random(15) + 1;
        }
        
        if(y - radius <= 50 || y + radius >= 470)
        {
            dy = -dy;
            color = random(15) + 1;
        }
        
        // Draw new ball
        setcolor(color);
        circle(x, y, radius);
        setfillstyle(SOLID_FILL, color);
        floodfill(x, y, color);
        
        delay(20);
    }
    
    closegraph();
}