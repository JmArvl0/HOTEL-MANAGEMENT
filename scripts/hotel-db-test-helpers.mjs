// Fixed loopback-only test target. Never loads .env or accepts connection overrides.
// First replay scripts/backend-remediation-db-test.mjs, with no concurrent reset.
import pg from "pg";
import { randomUUID } from "node:crypto";

const connection = { host: "127.0.0.1", port: 55432, user: "backend_audit", connectionTimeoutMillis: 5000 };
export async function hotelTestDatabase() {
  const database = `hotel_ops_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ ...connection, database: "postgres" });
  await admin.connect();
  try {
    await admin.query(`create database ${database} template backend_remediation_test`);
  } finally { await admin.end(); }
  const db = new pg.Client({ ...connection, database });
  await db.connect();
  return {
    db,
    async connect() { const client = new pg.Client({ ...connection, database }); await client.connect(); return client; },
    async close() {
      await db.end();
      const cleanup = new pg.Client({ ...connection, database: "postgres" });
      await cleanup.connect();
      try { await cleanup.query(`drop database ${database} with (force)`); } finally { await cleanup.end(); }
    },
  };
}

export async function hotelFixture(db, roomCount = 2) {
  const tag = randomUUID().slice(0, 8);
  const users = {};
  for (const role of ["guest", "front_desk", "housekeeping", "owner", "manager", "accounting"]) {
    users[role] = randomUUID();
    await db.query("insert into user_accounts(id,email,name,role,password_hash,active,account_status) values($1,$2,$3,$4,'offline-test-placeholder',true,'active')", [users[role], `${tag}-${role}@example.invalid`, `Test ${role}`, role]);
  }
  const guest = (await db.query("insert into guests(name,email,user_account_id) values('Test guest',$1,$2) returning id", [`${tag}@example.invalid`, users.guest])).rows[0].id;
  const type = `Ops-${tag}`;
  await db.query("insert into room_types(name,description,max_guests,beds,base_rate) values($1,'Isolated test',2,'Twin',100)", [type]);
  const rooms = [];
  for (let i = 0; i < roomCount; i++) rooms.push((await db.query("insert into rooms(number,floor,type,rate,status,housekeeping) values($1,1,$2,100,'available','clean') returning id,number", [`${tag}-${i}`, type])).rows[0]);
  return { tag, users, guest, type, rooms };
}

export async function rpc(db, name, args) {
  if (!/^[a-z_]+$/.test(name) || Object.keys(args).some(key => !/^p_[a-z_]+$/.test(key))) throw new Error("Invalid RPC identifier");
  return (await db.query(`select * from public.${name}(${Object.keys(args).map((key, i) => `${key} => $${i + 1}`).join(",")})`, Object.values(args).map(value => value !== null && typeof value === "object" ? JSON.stringify(value) : value))).rows;
}
