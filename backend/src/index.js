require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Task Management API running on http://localhost:${PORT}`);
});

module.exports = server;
