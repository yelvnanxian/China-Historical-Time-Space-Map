[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](39,94,40.5,98);
node[natural=peak][~"^name(:.*)?$"~"."](39,94,40.5,98);
);
out meta geom;
