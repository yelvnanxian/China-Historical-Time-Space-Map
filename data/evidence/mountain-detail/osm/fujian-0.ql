[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](24,116,27,120);
node[natural=peak][~"^name(:.*)?$"~"."](24,116,27,120);
);
out meta geom;
