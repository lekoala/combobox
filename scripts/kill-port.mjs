/** Stop listeners on the local dev/test server port (PORT || 4173). */
import { execFileSync } from "node:child_process";

const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

function findListeningPids() {
  if (process.platform === "win32") {
    const lines = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" }).split(/\r?\n/);
    const pids = new Set();
    for (const line of lines) {
      const [protocol, local, , state, id] = line.trim().split(/\s+/);
      const pid = Number(id);
      if (protocol === "TCP" && local === `127.0.0.1:${port}` && state === "LISTENING" && pid > 0) {
        pids.add(pid);
      }
    }
    return [...pids];
  }
  try {
    return [
      ...new Set(
        execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
          encoding: "utf8",
        })
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(Number),
      ),
    ];
  } catch (error) {
    // lsof reports no matches with exit status 1.
    if (error.status === 1 && !String(error.stderr || "").trim()) return [];
    throw error;
  }
}

const pids = findListeningPids();
for (const pid of pids) {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/F"], { encoding: "utf8" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}
console.log(pids.length ? `killed on port ${port}: ${pids.join(", ")}` : `port ${port} is free`);
