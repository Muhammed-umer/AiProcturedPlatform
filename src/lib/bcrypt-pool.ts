/**
 * bcrypt on background threads.
 *
 * bcryptjs is pure JavaScript. A single check takes about 75 ms of CPU, and
 * on the main thread a lab of 100 students signing in together measured an
 * 11-second queue with the whole server frozen for 9 seconds of it - every
 * student already writing stalled too. Here each check runs on one of a few
 * worker threads, so sign-ins proceed in parallel and the main thread stays
 * free to serve the exam.
 *
 * Falls back to the main thread if workers cannot be started, so sign-in
 * degrades rather than breaks.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import bcrypt from "bcryptjs";

type Job =
  | { op: "hash"; plain: string; rounds: number }
  | { op: "compare"; plain: string; hash: string };

interface Pending {
  resolve: (value: string | boolean) => void;
  reject: (err: Error) => void;
}

// Evaluated inside each worker. Plain CommonJS so it needs no build step;
// bcryptjs is resolved from the app's own node_modules.
const WORKER_SOURCE = `
const { parentPort } = require("node:worker_threads");
const bcrypt = require("bcryptjs");
parentPort.on("message", async ({ id, job }) => {
  try {
    const result = job.op === "hash"
      ? await bcrypt.hash(job.plain, job.rounds)
      : await bcrypt.compare(job.plain, job.hash);
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: String(err && err.message || err) });
  }
});
`;

class BcryptPool {
  private workers: Worker[] = [];
  private busy = new Map<Worker, number>();
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private broken = false;

  constructor(private size: number) {}

  private spawn(): Worker | null {
    try {
      const worker = new Worker(WORKER_SOURCE, { eval: true });
      worker.unref(); // never keep the process alive on its own
      worker.on("message", (msg: { id: number; result?: string | boolean; error?: string }) => {
        const job = this.pending.get(msg.id);
        if (!job) return;
        this.pending.delete(msg.id);
        this.busy.set(worker, (this.busy.get(worker) ?? 1) - 1);
        if (msg.error) job.reject(new Error(msg.error));
        else job.resolve(msg.result!);
      });
      worker.on("error", () => this.retire(worker));
      worker.on("exit", () => this.retire(worker));
      this.workers.push(worker);
      this.busy.set(worker, 0);
      return worker;
    } catch {
      this.broken = true;
      return null;
    }
  }

  /** A crashed worker is dropped; its jobs fail and callers retry in-thread. */
  private retire(worker: Worker) {
    this.workers = this.workers.filter((w) => w !== worker);
    this.busy.delete(worker);
  }

  private pick(): Worker | null {
    if (this.broken) return null;
    if (this.workers.length < this.size) {
      const idle = this.workers.find((w) => this.busy.get(w) === 0);
      if (idle) return idle;
      return this.spawn();
    }
    // Least loaded; jobs queue inside the worker's message port.
    return this.workers.reduce((a, b) =>
      (this.busy.get(a) ?? 0) <= (this.busy.get(b) ?? 0) ? a : b,
    );
  }

  run(job: Job): Promise<string | boolean> {
    const worker = this.pick();
    if (!worker) return runInThread(job);
    const id = this.nextId++;
    this.busy.set(worker, (this.busy.get(worker) ?? 0) + 1);
    return new Promise<string | boolean>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, job });
    }).catch(() => runInThread(job));
  }
}

function runInThread(job: Job): Promise<string | boolean> {
  return job.op === "hash"
    ? bcrypt.hash(job.plain, job.rounds)
    : bcrypt.compare(job.plain, job.hash);
}

// Leave a core for the web server itself. One pool per server process,
// kept across hot reloads in development.
const globalForPool = globalThis as unknown as { __ptpBcrypt?: BcryptPool };
const pool =
  globalForPool.__ptpBcrypt ??
  new BcryptPool(Math.max(1, Math.min(4, availableParallelism() - 1)));
globalForPool.__ptpBcrypt = pool;

export function bcryptHash(plain: string, rounds: number): Promise<string> {
  return pool.run({ op: "hash", plain, rounds }) as Promise<string>;
}

export function bcryptCompare(plain: string, hash: string): Promise<boolean> {
  return pool.run({ op: "compare", plain, hash }) as Promise<boolean>;
}
