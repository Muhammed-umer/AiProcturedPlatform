/**
 * Removes everything scripts/load/setup.mts created: the LOAD students, their
 * group and the load-test paper (with its attempts, answers and frames).
 *
 *   npx tsx scripts/load/cleanup.mts
 */
import postgres from "postgres";
import { loadEnv, LOAD_GROUP, LOAD_TEST, LOAD_PREFIX } from "./common.mts";

const sql = postgres(loadEnv().DATABASE_URL, { onnotice: () => {} });
const t = await sql`delete from tests where title = ${LOAD_TEST} returning id`;
const g = await sql`delete from groups where name = ${LOAD_GROUP} returning id`;
const u = await sql`
  delete from users where roll_number like ${LOAD_PREFIX + "%"} and role = 'student'
  returning id`;
console.log(`Removed ${t.length} test, ${g.length} group, ${u.length} students`);
await sql.end();
