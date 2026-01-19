const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();

const response = require('./data/movies.json');

app.use(express.json());
app.use(cookieParser());

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username && password) {
    res.cookie('username', username);
    res.json({ success: true });
  } else {
    res.status(422).json({ error: 'Username and password are required' });
  }
});

app.delete('/logout', (_, res) => {
  res.clearCookie('username');
  res.sendStatus(204);
});

app.get('/account', (req, res) => {
  res.json({ user: req.cookies });
});

app.get('/movies', (_, res) => {
  res.json(response);
});

app.get('/movies/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  res.json(response.filter((movie) => movie.id === id).pop());
});

app.get('/healthz', (_req, res) => {
  if (response.length > 0) {
    res.status(200).send('Ok');
  } else {
    res.status(500).send('Movie data is missing');
  }
});

module.exports = app;
