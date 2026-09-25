[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](34.5,111,37.5,115);
node[natural=peak][~"^name(:.*)?$"~"."](34.5,111,37.5,115);
);
out meta geom;
