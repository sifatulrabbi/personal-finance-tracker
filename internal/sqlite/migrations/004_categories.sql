CREATE TABLE categories (
 id TEXT PRIMARY KEY,
 type TEXT NOT NULL CHECK(type IN ('income','expense')),
 name TEXT NOT NULL,
 UNIQUE(type,name)
);
INSERT INTO categories VALUES ('others-income','income','Others'),('others-expense','expense','Others');
