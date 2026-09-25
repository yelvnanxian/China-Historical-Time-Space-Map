[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](43.5,87,45.5,91);
node[natural=peak][~"^name(:.*)?$"~"."](43.5,87,45.5,91);
);
out meta geom;
