# Throttle 3-rater agreement

| Label | A pos | A neg | B pos | B neg | C pos | C neg | Majority pos | Majority neg | Note |
|---|---|---|---|---|---|---|---|---|---|
| leading-edge | true | false | true | false | true | false | true | false | All agree; predicate is reliable. |
| trailing-edge | true | false | true | false | true | false | true | false | All agree; predicate is reliable. |
| burst-coalesced | true | false | true | false | true | false | true | false | All agree; predicate is reliable. |
| post-window-fires-immediately | false | false | false | false | false | false | false | false | Majority WRONG on positive. NO rater fires; label is low-confidence. |
| passes-arguments | true | false | false | false | true | false | true | false |  |
| preserves-this | true | false | false | false | true | false | true | false |  |
| single-call | true | false | true | false | true | false | true | false | All agree; predicate is reliable. |

**Majority correctness:** 6/7 labels (85.7%)

