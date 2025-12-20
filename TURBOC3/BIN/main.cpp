#include <graphics.h>
#include <conio.h>

int main()
{
    int gd = DETECT, gm;

    initgraph(&gd, &gm, "C:\\BGI");

    if (graphresult() != grOk)
    {
        closegraph();
        return 1;
    }

    circle(200, 200, 100);
    outtextxy(150, 300, "graphics.h works!");

    getch();
    closegraph();
    return 0;
}
