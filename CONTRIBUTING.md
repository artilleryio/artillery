# Artillery

## Need to get in touch?

All project discussions should happen in the [issue tracker](https://github.com/shoreditch-ops/artillery/issues) or on [Gitter](https://gitter.im/shoreditch-ops/artillery).
However if you are a first-time contributor and want some help getting started,
feel free to get in touch over email:

* Hassy Veldstra - [h@artillery.io](mailto:h@artillery.io)

## Guide for Contributions

* We use the usual Fork+Pull model (more info: [https://help.github.com/articles/using-pull-requests/](https://help.github.com/articles/using-pull-requests/)]
* Pull requests should have tests
* Ideally, pull requests should reference an Issue

  Before you write more than a few lines of code, please make sure that:

  * If it's a new feature proposal - that it has been discussed and accepted
  * Let others know that you are working on the issue (e.g. by self-assigning the issue)

* New code should follow the project's styleguide. Check with:

  ```shell
  npm run is_linted
  ```

* Commit messages should follow this style:
  ```
  A brief one-liner < 50 chars, use the imperative mood

  Followed by further explanation if needed, this should be wrapped at
  around 72 characters. Most commits should reference an existing
  issue, such as #101 above.
  ```

  Some reading on good commit messages: [http://chris.beams.io/posts/git-commit/](http://chris.beams.io/posts/git-commit/)

* Once your first PR has been merged, please add yourself to `package.json` for the relevant module and send another PR.

## Licensing

By sending a patch you certify that you have the rights to and agree for your contribution to be distributed under the terms of [MPL2](https://www.mozilla.org/en-US/MPL/2.0/).
