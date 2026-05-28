#include <graphics.h>
#include <conio.h>
#include <stdio.h>

int main() {
    int gd = DETECT, gm;
    int radius;

    printf("Enter radius: ");
    scanf("%d", &radius);

    initgraph(&gd, &gm, "");

    circle(300, 200, radius);

    getch();
    closegraph();
    return 0;
}