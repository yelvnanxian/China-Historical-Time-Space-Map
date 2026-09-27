[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](28,105,31,109);
node[natural=peak][~"^name(:.*)?$"~"."](28,105,31,109);
);
out meta geom;
