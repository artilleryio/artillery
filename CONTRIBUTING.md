# Artillery.io Contributors Guide

## Need to get in touch?

All project discussions should happen in the [issue tracker](https://github.com/artilleryio/artillery/issues) or on [Gitter](https://gitter.im/artilleryio/artillery).
However if you are a first-time contributor and want some help getting started,
feel free to get in touch over email:

* Hassy Veldstra - [h@artillery.io](mailto:h@artillery.io?subject=Artillery Contribution Help)

## Guide for Contributions

* We use the popular Fork+Pull model (more info here: [https://help.github.com/articles/using-pull-requests/](https://help.github.com/articles/using-pull-requests/)]
* Pull requests that modify or add behavior should have tests, whether it's a new feature or a bug fix. If you're unsure how to structure a test, we can help.
* Ideally, pull requests should reference an existing [Issue](https://github.com/artilleryio/artillery/issues) to provide opportunity for discussion of any proposed features or changes which aren't a bug fix.
* One logical change per commit please. We'll ask you to rebase PRs containing commits that change several unrelated things.
* The smaller a PR is the better. Smaller PRs are much easier to review and provide feedback on. Always lean towards smaller PRs.
* Before you write more than a few lines of code, please make sure:

    * If it's a new feature proposal - that it has been discussed and accepted
    * Let others know that you are working on the issue
    
* Commit messages should follow this style (we use the [commitlint conventional](https://github.com/marionebl/commitlint/tree/master/%40commitlint/config-conventional) config):
  ```
  feat: A brief one-liner < 50 chars, use the imperative mood

  Followed by further explanation if needed, this should be wrapped at
  around 72 characters. Most commits should reference an existing
  issue, such as #101 above.
  ```

  Some reading on good commit messages: [http://chris.beams.io/posts/git-commit/](http://chris.beams.io/posts/git-commit/)
* Once your first PR has been merged, please add yourself to `package.json` for the relevant module and open another PR.

## Licensing

By sending a patch you certify that you have the rights to and agree for your contribution to be distributed under the terms of [MPL2](https://www.mozilla.org/en-US/MPL/2.0/).
