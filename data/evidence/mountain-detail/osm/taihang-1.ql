[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](37.5,111,40.5,115);
node[natural=peak][~"^name(:.*)?$"~"."](37.5,111,40.5,115);
);
out meta geom;
