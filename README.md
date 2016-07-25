# wct-xunit
WCT plugin that uses the mocha xunit reporter. Can be used along with Continuous Integration to show test results.

## Installation

```sh
npm install wct-xunit --saveDev
```

## Basic Usage

Add the following to wct.conf.js

```json
module.exports = {
  "plugins": {
    "wct-xunit": {
    }
  }
};
```

More Info: https://github.com/Polymer/web-component-tester#plugins
