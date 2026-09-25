[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](39,98,40.5,102);
node[natural=peak][~"^name(:.*)?$"~"."](39,98,40.5,102);
);
out meta geom;
