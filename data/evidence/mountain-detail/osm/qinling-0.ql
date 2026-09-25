[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](32,104,35,108);
node[natural=peak][~"^name(:.*)?$"~"."](32,104,35,108);
);
out meta geom;
