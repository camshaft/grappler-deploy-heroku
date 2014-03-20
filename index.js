/**
 * Module dependencies
 */

var chain = require('slide').chain;
var last = chain.last;
var Heroku = require('heroku-client');
var spawn = require('child_process').spawn;
var superagent = require('superagent');

/**
 * Create a GitHub hook
 *
 * @param {Object} config
 * @return {Function}
 */

module.exports = function(config) {
  config = config || {};

  var token = config.token;
  var prefix = config.prefix;
  var drain = config.drain;

  if (!token) throw new Error('missing heroku token');
  if (!prefix) throw new Error('missing heroku prefix');

  var client = new Heroku({token: token});
  var api = new API(client, token);

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
      [api, 'enableFeature', app, 'log-runtime-metrics', log],
      [api, 'enableFeature', app, 'user-env-compile', log],
      [api, 'addDrain', app, drain, log],
      [createSlug, task.dir, log],
      [api, 'release', app, last, log]
    ], fn);
  };
};

function API(client, token) {
  this.client = client;
  this.token = token;
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

API.prototype.enableFeature = function(app, feature, log, fn) {
  log('enabling feature ' + feature);
  this.client.apps(app).features(feature).update({enabled: true}, fn);
};

API.prototype.addDrain = function(app, drain, log, fn) {
  if (!drain) return fn();
  log('adding log drain ' + drain);
  this.client.apps(app).logDrains().create({url: drain}, function(err) {
    if (err && err.statusCode === 422) return fn();
    if (err) return fn(err);
    fn();
  });
};

API.prototype.release = function(app, url, log, fn) {
  log('releasing slug');
  var host = 'https://:' + this.token + '@cisaurus.heroku.com';
  superagent
    .post(host + '/v1/apps/' + app + '/release')
    .send({description: 'Building from grappler', slug_url: url})
    .end(function(err, res) {
      if (err) return fn(err);
      if (res.status === 202) return poll(res.header['location']);
      if (res.error) return fn(new Error(res.body ? res.body.error : res.text));
      fn(null);
    });

  function poll(location) {
    setTimeout(function() {
      superagent
        .get(host + location)
        .end(function(err, res) {
          if (err) return fn(err);
          if (res.status === 202) return poll(location);
          if (res.error) return fn(new Error(res.text));
          log('release ' + res.body.release);
          fn(null);
        });
    }, 2000);
  }
};

function createSlug(dir, log, fn) {
  log('building slug');
  var anvil = spawn('heroku', ['build', dir, '-p']);

  var url;
  anvil.stdout.on('data', function(data) {
    url = '' + data;
  });

  anvil.stderr.on('data', function(data) {
    log('' + data);
  });

  anvil.on('error', function(err) {
    if (err.code === 'ENOENT') return log('error', 'missing anvil build tool');
  });

  anvil.on('close', function(code) {
    if (code !== 0) return fn(new Error('slug was not compiled'));
    if (!url) return new Error('missing slug url');
    setTimeout(function() {
      fn(null, url);
    }, 2000);
  });
}
