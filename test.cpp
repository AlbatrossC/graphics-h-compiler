#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");
    
    // Draw rectangle
    rectangle(100, 100, 300, 200);
    
    // Draw circle
    circle(200, 150, 40);
    
    // Draw line
    line(50, 250, 350, 250);
    
    getch();
    closegraph();
    return 0;
}