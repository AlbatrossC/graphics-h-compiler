// Simple Shapes

#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");

    rectangle(50, 50, 200, 150);
    circle(300, 100, 50);
    line(50, 200, 350, 200);

    outtextxy(50, 230, "Rectangle, Circle & Line");

    getch();
    closegraph();
    return 0;
}
