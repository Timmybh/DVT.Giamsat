const sql = require('mssql');

const pools = {};

function useMock() {
  return String(process.env.USE_MOCK).toLowerCase() === 'true' || !process.env.DB_SERVER;
}

// Mỗi database (eGMF, HiPro) có một connection pool riêng
async function getPool(dbKey) {
  const database = dbKey === 'hipro' ? process.env.DB_HIPRO : process.env.DB_EGMF;
  if (!pools[dbKey]) {
    pools[dbKey] = new sql.ConnectionPool({
      server: process.env.DB_SERVER,
      port: Number(process.env.DB_PORT || 1433),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
        useUTC: false, // giờ trong eGMF là giờ Việt Nam
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    }).connect();
  }
  return pools[dbKey];
}

// Chạy câu truy vấn có tham số: query({ db, text }, { ten: giaTri })
async function query(q, params = {}) {
  const pool = await getPool(q.db);
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  const result = await req.query(q.text);
  return result.recordset;
}

module.exports = { useMock, query };
