[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](36,102,39,103);
node[natural=peak][~"^name(:.*)?$"~"."](36,102,39,103);
);
out meta geom;
