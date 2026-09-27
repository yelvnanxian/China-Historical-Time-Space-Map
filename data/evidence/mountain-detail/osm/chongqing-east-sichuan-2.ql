[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](31,105,32,109);
node[natural=peak][~"^name(:.*)?$"~"."](31,105,32,109);
);
out meta geom;
