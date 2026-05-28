#include <graphics.h>
#include <conio.h>
#include <dos.h>
#include <stdlib.h>

#define BALLS 4

void main()
{
    int gd = DETECT, gm;
    int i;

    int x[BALLS], y[BALLS];
    int dx[BALLS], dy[BALLS];
    int radius = 12;
    int color[BALLS];

    initgraph(&gd, &gm, "C:\\TURBOC3\\BGI");

    settextstyle(DEFAULT_FONT,HORIZ_DIR,2);
    outtextxy(180,10,"Turbo C Physics Demo");

    rectangle(10,50,630,470);

    randomize();

    for(i=0;i<BALLS;i++)
    {
        x[i] = random(600)+20;
        y[i] = random(350)+80;
        dx[i] = random(6)+2;
        dy[i] = random(6)+2;
        color[i] = random(15)+1;
    }

    while(!kbhit())
    {
        for(i=0;i<BALLS;i++)
        {
            /* erase old ball */
            setcolor(BLACK);
            setfillstyle(SOLID_FILL,BLACK);
            fillellipse(x[i],y[i],radius,radius);

            x[i]+=dx[i];
            y[i]+=dy[i];

            /* wall collision */
            if(x[i]-radius<=10 || x[i]+radius>=630)
            {
                dx[i]=-dx[i];
                color[i]=random(15)+1;

                /* spark effect */
                setcolor(color[i]);
                line(x[i],y[i],x[i]+random(30)-15,y[i]+random(30)-15);
            }

            if(y[i]-radius<=50 || y[i]+radius>=470)
            {
                dy[i]=-dy[i];
                color[i]=random(15)+1;

                /* spark effect */
                setcolor(color[i]);
                line(x[i],y[i],x[i]+random(30)-15,y[i]+random(30)-15);
            }

            /* draw ball */
            setcolor(color[i]);
            setfillstyle(SOLID_FILL,color[i]);
            fillellipse(x[i],y[i],radius,radius);
        }

        delay(15);
    }

    closegraph();
}