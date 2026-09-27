[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](31,109,32,110);
node[natural=peak][~"^name(:.*)?$"~"."](31,109,32,110);
);
out meta geom;
