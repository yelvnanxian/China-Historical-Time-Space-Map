[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](43.5,79,45.5,83);
node[natural=peak][~"^name(:.*)?$"~"."](43.5,79,45.5,83);
);
out meta geom;
