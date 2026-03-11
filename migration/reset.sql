PRAGMA foreign_keys = OFF;
DELETE FROM files;
DELETE FROM folders;
DELETE FROM users;
DELETE FROM sqlite_sequence WHERE name='users';
PRAGMA foreign_keys = ON;
