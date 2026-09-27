[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](28,111,30,115);
node[natural=peak][~"^name(:.*)?$"~"."](28,111,30,115);
);
out meta geom;
