[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](30,118,31,122);
node[natural=peak][~"^name(:.*)?$"~"."](30,118,31,122);
);
out meta geom;
