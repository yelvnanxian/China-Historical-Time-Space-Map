[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](28,97,31,101);
node[natural=peak][~"^name(:.*)?$"~"."](28,97,31,101);
);
out meta geom;
