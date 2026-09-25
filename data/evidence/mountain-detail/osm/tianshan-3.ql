[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](40.5,91,43.5,92);
node[natural=peak][~"^name(:.*)?$"~"."](40.5,91,43.5,92);
);
out meta geom;
