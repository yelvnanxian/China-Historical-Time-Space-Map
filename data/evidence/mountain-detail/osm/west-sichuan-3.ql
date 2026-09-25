[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](31,101,34,104);
node[natural=peak][~"^name(:.*)?$"~"."](31,101,34,104);
);
out meta geom;
