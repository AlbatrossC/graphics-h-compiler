//  Simple Shooter Game using BGI Graphics in C++

#include <graphics.h>
#include <conio.h>
#include <dos.h>
#include <stdlib.h>
#include <stdio.h>

void main() {
    int gd = DETECT, gm;

    int playerX = 320;
    int bulletX = 0, bulletY = -1;
    int enemyX, enemyY = 0;
    int score = 0;
    char text[20];
    char ch;

    initgraph(&gd, &gm, "");

    settextstyle(DEFAULT_FONT, HORIZ_DIR, 2);
    outtextxy(180, 120, "SIMPLE SHOOTER");
    outtextxy(140, 180, "A / D  : Move");
    outtextxy(140, 210, "SPACE  : Shoot");
    outtextxy(140, 240, "ESC    : Exit");
    outtextxy(120, 300, "Press any key to start");
    getch();
    cleardevice();

    randomize();
    enemyX = rand() % (getmaxx() - 60) + 30;

    while (1) {
        cleardevice();

        rectangle(playerX - 20, 430, playerX + 20, 460);

        setcolor(RED);
        circle(enemyX, enemyY, 18);
        enemyY += 4;

        if (enemyY > getmaxy()) {
            enemyY = 0;
            enemyX = rand() % (getmaxx() - 60) + 30;
        }

        if (bulletY >= 0) {
            setcolor(YELLOW);
            line(bulletX, bulletY, bulletX, bulletY - 12);
            bulletY -= 12;
        }

        if (bulletY < 0)
            bulletY = -1;

        if (bulletY >= 0 &&
            bulletX > enemyX - 30 &&
            bulletX < enemyX + 30 &&
            bulletY > enemyY - 30 &&
            bulletY < enemyY + 30) {

            score++;
            enemyY = 0;
            enemyX = rand() % (getmaxx() - 60) + 30;
            bulletY = -1;
        }

        sprintf(text, "Score: %d", score);
        setcolor(WHITE);
        outtextxy(10, 10, text);

        if (kbhit()) {
            ch = getch();

            if (ch == 27)
                break;
            if (ch == 'a' || ch == 'A')
                playerX -= 12;
            if (ch == 'd' || ch == 'D')
                playerX += 12;
            if (ch == ' ' && bulletY == -1) {
                bulletX = playerX;
                bulletY = 420;
            }
        }

        if (playerX < 30) playerX = 30;
        if (playerX > getmaxx() - 30) playerX = getmaxx() - 30;

        delay(30);
    }

    closegraph();
}
