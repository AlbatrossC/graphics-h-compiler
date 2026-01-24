#include <graphics.h>
#include <conio.h>

int main()
{
    int gd=DETECT,gm,cx,cy;
    initgraph(&gd,&gm,"");

    cx = getmaxx()/2;
    cy = getmaxy()/2;

    setfillstyle(1,YELLOW);
    fillellipse(cx-200,cy-40,80,80);

    setcolor(BLACK);
    setfillstyle(1,BLACK);
    fillellipse(cx-230,cy-60,8,12);
    fillellipse(cx-170,cy-60,8,12);
    arc(cx-200,cy-30,200,340,30);

    setcolor(CYAN);
    setfillstyle(1,CYAN);
    fillellipse(cx,cy-40,50,50);

    setcolor(LIGHTGREEN);
    setfillstyle(1,LIGHTGREEN);
    bar(cx+120,cy-90,cx+260,cy+50);

    setcolor(LIGHTGREEN);
    settextstyle(3,0,3);
    outtextxy(cx-200,cy+100,"graphics.h WORKS IN BROWSER");

    getch();
    closegraph();
}
