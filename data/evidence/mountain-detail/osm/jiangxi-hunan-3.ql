[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](28,115,30,117);
node[natural=peak][~"^name(:.*)?$"~"."](28,115,30,117);
);
out meta geom;
