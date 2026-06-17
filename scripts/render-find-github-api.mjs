import fs from "node:fs";
const t = fs.readFileSync(
  "C:/Users/Relanto/.cursor/projects/c-Users-Relanto-OneDrive-Relanto-Desktop-Compliance-Agent/agent-tools/d26a705d-2eb2-4866-9f75-7cb02c668d72.txt",
  "utf8",
);
const hits = [...t.matchAll(/"(\/[^"]*github[^"]*)"/gi)].map((m) => m[1]);
console.log([...new Set(hits)].join("\n"));
