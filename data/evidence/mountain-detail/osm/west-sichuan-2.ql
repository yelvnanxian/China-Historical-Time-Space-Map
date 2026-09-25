[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](31,97,34,101);
node[natural=peak][~"^name(:.*)?$"~"."](31,97,34,101);
);
out meta geom;
