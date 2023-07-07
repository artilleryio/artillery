const express = require('express');
const app = express();
const upload = require('multer')({ dest: 'uploads/', preservePath: true });
const port = 3000;

app.post('/upload', upload.single('document'), (req, res) => {
  const { originalname, mimetype, size } = req.file;
  res.json({ originalname, mimetype, size });
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
