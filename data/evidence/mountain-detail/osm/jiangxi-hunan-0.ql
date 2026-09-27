[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](25,111,28,115);
node[natural=peak][~"^name(:.*)?$"~"."](25,111,28,115);
);
out meta geom;
