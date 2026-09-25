[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](40.5,83,43.5,87);
node[natural=peak][~"^name(:.*)?$"~"."](40.5,83,43.5,87);
);
out meta geom;
