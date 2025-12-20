// Filled Shapes & Colors

#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");

    setcolor(RED);
    rectangle(50, 50, 200, 150);
    setfillstyle(SOLID_FILL, BLUE);
    floodfill(60, 60, RED);

    setcolor(GREEN);
    circle(300, 100, 50);
    setfillstyle(SOLID_FILL, YELLOW);
    floodfill(300, 100, GREEN);

    getch();
    closegraph();
    return 0;
}
