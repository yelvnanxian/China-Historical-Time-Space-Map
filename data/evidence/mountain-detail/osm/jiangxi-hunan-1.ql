[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](25,115,28,117);
node[natural=peak][~"^name(:.*)?$"~"."](25,115,28,117);
);
out meta geom;
