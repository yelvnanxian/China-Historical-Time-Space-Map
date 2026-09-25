[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](40.5,79,43.5,83);
node[natural=peak][~"^name(:.*)?$"~"."](40.5,79,43.5,83);
);
out meta geom;
