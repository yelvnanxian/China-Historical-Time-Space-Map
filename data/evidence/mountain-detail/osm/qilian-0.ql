[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](36,94,39,98);
node[natural=peak][~"^name(:.*)?$"~"."](36,94,39,98);
);
out meta geom;
