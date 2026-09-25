[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](28,101,31,104);
node[natural=peak][~"^name(:.*)?$"~"."](28,101,31,104);
);
out meta geom;
