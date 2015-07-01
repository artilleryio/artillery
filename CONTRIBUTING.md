# minigun

## Need to get in touch?

All project discussions should happen in the [issue tracker](https://github.com/artilleryio/minigun/issues).
However if you are a first-time contributor and want some help getting started,
feel free to get in touch over email:

* Hassy Veldstra - [h@artillery.io](mailto:h@artillery.io)

## Guide for Contributions

* Pull requests should have tests
* Ideally, pull requests should reference an Issue
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
