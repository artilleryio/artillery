const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
const port = 3000;

app.use(express.json());
app.use(cookieParser());

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email && password) {
    res.cookie('email', email);
    res.json({ success: true, email });
  } else {
    res
      .status(422)
      .json({ success: false, error: 'Email and password are required' });
  }
});

app.get('/account', (req, res) => {
  res.json({ user: req.cookies });
});

app.post('/set-state', (_req, res) => {
  // Cookie will be set from the request, just send a 200 OK response.
  res.sendStatus(200);
});

app.get('/state', (req, res) => {
  const { state } = req.cookies;
  res.json({ currentState: state });
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
