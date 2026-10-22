import { Pool, types } from "pg";

// Keep SQL DATE values as ISO date-only strings; converting through JS Date can shift dates by timezone.
types.setTypeParser(1082, (value) => value);

/** Shared PostgreSQL connection pool for API handlers. */
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error", error));
