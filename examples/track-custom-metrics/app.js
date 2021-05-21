const express = require("express");
const serverTiming = require('server-timing');
const app = express();
const port = 3000;

app.use(express.json());
app.use(serverTiming());

app.post("/pets", (req, res) => {
  res.startTime("pets", "Creating pet");

  setTimeout(() => {
    res.endTime("pets");
    res.json({
      species: req.body.species,
      name: req.body.name
    });
  }, Math.ceil(Math.random() * 500));
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
