[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](36,98,39,102);
node[natural=peak][~"^name(:.*)?$"~"."](36,98,39,102);
);
out meta geom;
