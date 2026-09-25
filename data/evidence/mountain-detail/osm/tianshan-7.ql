[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](43.5,91,45.5,92);
node[natural=peak][~"^name(:.*)?$"~"."](43.5,91,45.5,92);
);
out meta geom;
