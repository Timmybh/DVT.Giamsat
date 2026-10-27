require('dotenv').config();
const path = require('path');
const express = require('express');
const api = require('./src/api');

const app = express();
app.use(express.json());
app.use('/api', api);
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  const mode = require('./src/db').useMock() ? 'DỮ LIỆU MẪU' : `SQL Server ${process.env.DB_SERVER}`;
  console.log(`DVT Giám sát chạy tại http://localhost:${port} (${mode})`);
});
