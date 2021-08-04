# HTTP and Socket.IO server

## Running the server

First, install the server dependencies:

```shell
npm install
```

After installing the dependencies, start the server:

```shell
npm start
```

##### HTTP

`GET /movies`

returns a list of all the movies

```json
[
  {
    "id": 1,
    "releaseDate": "Dec 18 1985",
    "director": "Terry Gilliam",
    "title": "Brazil",
    "genre": "Black Comedy",
    "imdbRating": 8,
    "runningTimeMin": 136
  },
  {
    "id": 2,
    "releaseDate": "Feb 16 1996",
    "director": "Harold Becker",
    "title": "City Hall",
    "genre": "Drama",
    "imdbRating": 6.1,
    "runningTimeMin": 111
  }
  ...
]
```

`GET /movies/:id`

returns a single movie by its id

```json
{
  "id": 35,
  "releaseDate": "Oct 01 1999",
  "director": "David O. Russell",
  "title": "Three Kings",
  "genre": "Action",
  "imdbRating": 7.3,
  "runningTimeMin": 115
}
```

##### socket.io

The socket.io server listens to `echo` events and emits `echoResponse` events to the client, passing the received payload back
