[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](39,102,40.5,103);
node[natural=peak][~"^name(:.*)?$"~"."](39,102,40.5,103);
);
out meta geom;
