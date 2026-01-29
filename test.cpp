#include <graphics.h>
#include <stdio.h>
#include <math.h>

int main() {
    int x1, y1, x2, y2;
    int gd = DETECT, gm;

    printf("Enter x1 y1 x2 y2: ");
    scanf("%d %d %d %d", &x1, &y1, &x2, &y2);

    initgraph(&gd, &gm, "");

    float dx = x2 - x1;
    float dy = y2 - y1;
    float steps = abs(dx) > abs(dy) ? abs(dx) : abs(dy);

    float xinc = dx / steps;
    float yinc = dy / steps;

    float x = x1, y = y1;

    for (int i = 0; i <= steps; i++) {
        putpixel((int)x, (int)y, WHITE);
        x += xinc;
        y += yinc;
        delay(10);
    }

    getch();
    closegraph();
    return 0;
}
