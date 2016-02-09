# Artillery

## Need to get in touch?

All project discussions should happen in the [issue tracker](https://github.com/shoreditch-ops/artillery/issues).
However if you are a first-time contributor and want some help getting started,
feel free to get in touch over email:

* Hassy Veldstra - [h@artillery.io](mailto:h@artillery.io)

## Guide for Contributions

* Pull requests should have tests. (We aim for 100% test coverage, which isn't
  always possible, but test coverage of less than 80% should be considered a
  bug.)
* Ideally, pull requests should reference an Issue.

  Before you write more than a few lines of code, please make sure that:

  * If it's a new feature proposal - that it has been discussed and accepted
  * Let others know that you are working on the issue (e.g. by self-assigning the issue)

* New code should follow the style guidelines
  These are checked automatically when new code is committed. You can also run
  the checks at any time yourself with:

  ```shell
  # eslint check
  npm run is_linted
  ```

  ```shell
  # formatting check (we use Google's JS style)
  npm run is_formatted
  ```
* Commit messages should follow this style:
  ```
  (#101) - A brief one-liner < 50 chars

  Followed by further explanation if needed, this should be wrapped at
  around 72 characters. Most commits should reference an existing
  issue, such as #101 above.
  ```

## Licensing

By sending a patch to Artillery you agree for your contribution to be distributed under the terms of [MPL2](https://www.mozilla.org/en-US/MPL/2.0/).

## Credits

Shout out to [PouchDB](https://github.com/pouchdb/pouchdb) for having a great
Contributor's Guide that served as the starting point for this one.
