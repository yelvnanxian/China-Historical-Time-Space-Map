[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](27,116,28,120);
node[natural=peak][~"^name(:.*)?$"~"."](27,116,28,120);
);
out meta geom;
