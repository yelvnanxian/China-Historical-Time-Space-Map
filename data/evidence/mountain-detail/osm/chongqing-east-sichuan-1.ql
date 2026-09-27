[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](28,109,31,110);
node[natural=peak][~"^name(:.*)?$"~"."](28,109,31,110);
);
out meta geom;
