const express = require('express');
const app = express();
const port = 3000;

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

app.use(express.json());

app.post('/users', (req, res) => {
  if (req.body.username === '') {
    res.status(422).send({ error: 'username is missing' });
    return;
  }

  db.run(
    'INSERT INTO users (username) VALUES (?)',
    [req.body.username],
    function (err) {
      if (err === null) {
        res.status(201).send({ id: this.lastID, username: req.body.username });
      } else {
        res.status(500).send(err);
      }
    }
  );
});

app.get('/users/:id', (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (err !== null) {
      res.status(500).send(err);
      return;
    }

    if (row === undefined) {
      res.status(404).send({ error: 'User not found' });
    } else {
      res.status(200).send(row);
    }
  });
});

app.delete('/users/:id', (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function (err) {
    if (err !== null) {
      res.status(500).send(err);
      return;
    }

    if (this.changes === 0) {
      res.status(404).send({ error: 'User not found' });
    } else {
      res.sendStatus(204);
    }
  });
});

app.listen(port, () => {
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE
  )`);
  console.log(`App listening at http://localhost:${port}`);
});
