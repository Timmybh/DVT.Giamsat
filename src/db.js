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
      // Mặc định 60 giây (đổi bằng DB_REQUEST_TIMEOUT); script khảo sát nặng đặt lớn hơn
      requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT || 60000),
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    }).connect();
  }
  return pools[dbKey];
}

// Chỉ đọc, không giữ khóa trên eGMF/HiPro (tương đương WITH (NOLOCK) cho mọi bảng)
const NO_LOCK = 'SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n';

// Chạy câu truy vấn có tham số: query({ db, text }, { ten: giaTri })
async function query(q, params = {}) {
  const pool = await getPool(q.db);
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  const t0 = Date.now();
  const result = await req.query(NO_LOCK + q.text);
  // ghi log câu chậm (> 2 giây) để biết bước nào nặng: dòng đầu có chữ của câu + số tham số
  const ms = Date.now() - t0;
  if (ms > 2000) console.log(`[cham-db] ${ms} ms ${q.db} ${Object.keys(params).length} tham số: ${q.text.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
  return result.recordset;
}

module.exports = { useMock, query };
