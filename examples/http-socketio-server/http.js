const express = require('express');
const bodyParser = require('body-parser');

const app = express();

const response = require('./data/movies.json');

app.use(bodyParser.json());

app.get('/movies', (_, res) => {
  res.json(response);
});

app.get('/movies/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  res.json(response.filter((movie) => movie.id === id).pop());
});

module.exports = app;
