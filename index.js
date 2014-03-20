/**
 * Module dependencies
 */

var chain = require('slide').chain;
var last = chain.last;
var Heroku = require('heroku-client');

/**
 * Create a GitHub hook
 *
 * @param {Object} config
 * @return {Function}
 */

module.exports = function(config) {
  config = config || {};

  var key = config.token;
  var prefix = config.prefix;

  if (!key) throw new Error('missing heroku token');
  if (!prefix) throw new Error('missing heroku prefix');

  var client = new Heroku({token: key});
  var api = new API(client);

  return deploy;
  return function(app) {
    return app.deploy('heroku', deploy);
  };

  function deploy(task, log, fn) {
    var name = task.repo.replace(/-/g, '');
    var branch = task.branch.replace(/-/g, '');

    if (branch === 'prod' || branch === 'test') return fn(new Error('cannot deploy reserved branch ' + branch));

    if (branch === 'master') branch = 'test';

    var app = [prefix, name, branch].join('-');

    chain([
      [api, 'exists', app, log],
      [api, 'create', app, last, log],
      [api, 'enableFeature', 'log-runtime-metrics', app, log],
      [api, 'enableFeature', 'user-env-compile', app, log]
    ], fn);
  };
};

function API(client) {
  this.client = client;
}

API.prototype.exists = function(app, log, fn) {
  log('checking app existance');
  this.client.apps(app).info(function(err, info) {
    if (err && err.statusCode === 404) return fn(null, false);
    if (err) return fn(err);
    fn(null, true);
  });
};

API.prototype.create = function(app, exists, log, fn) {
  if (exists) return fn();
  var params = {
    name: app
  };
  log('creating app ' + app);
  this.client.apps().create(params, fn);
};

API.prototype.enableFeature = function(feature, app, log, fn) {
  log('enabling feature ' + feature);
  this.client.apps(app).features(feature).update({enabled: true}, fn);
};
