[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](32,108,35,112);
node[natural=peak][~"^name(:.*)?$"~"."](32,108,35,112);
);
out meta geom;
