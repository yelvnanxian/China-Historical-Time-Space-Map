[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"](27,118,30,122);
node[natural=peak][~"^name(:.*)?$"~"."](27,118,30,122);
);
out meta geom;
