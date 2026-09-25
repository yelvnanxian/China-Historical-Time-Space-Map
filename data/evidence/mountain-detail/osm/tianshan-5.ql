[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](43.5,83,45.5,87);
node[natural=peak][~"^name(:.*)?$"~"."](43.5,83,45.5,87);
);
out meta geom;
